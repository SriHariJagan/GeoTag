import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiEdit2,
  FiFilter,
  FiMapPin,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../../../store/context/AuthContext";
import { useProjects } from "../../../store/context/ProjectContext";
import { ROLES } from "../../../constants/roles";
import styles from "./Projects.module.css";
import Modal from "../../../Components/Modal/Modal";
import ConfirmDialog from "../../../Components/Modal/ConfirmDialog";
import NewProjectForm from "../../../Components/Forms/NewProjectForm";
import Toast from "../../../Components/Toast/Toast";
import { useToast } from "../../../Components/Toast/useToast";

export default function Projects() {
  const {
    projects = [],
    loading,
    addProject,
    updateProject,
    deleteProject,
    loadProjects,
  } = useProjects();

  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, push, dismiss } = useToast();
  const canManage = user?.role === ROLES.SUPERADMIN || user?.role === ROLES.ADMIN;
  const canDelete = user?.role === ROLES.SUPERADMIN;
  const isSupervisor = user?.role === ROLES.SUPERVISOR;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModal, setIsDeleteModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [sort, setSort] = useState({ key: "date", dir: -1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setFilters((prev) => ({ ...prev, status: params.get("status") || "" }));
  }, [location.search]);

  const normStatus = (s) => (s || "").toLowerCase().replace(/[\s_-]/g, "");

  // Reset to first page whenever the data set changes
  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.status, pageSize, projects.length]);

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    );

  const filteredData = useMemo(
    () =>
      projects.filter((p) => {
        const q = filters.search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          p.name?.toLowerCase().includes(q) ||
          p.project_code?.toLowerCase().includes(q) ||
          p.client_name?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q);

        const matchesStatus =
          !filters.status || normStatus(p.status) === normStatus(filters.status);

        return matchesSearch && matchesStatus;
      }),
    [filters, projects]
  );

  const sortedData = useMemo(() => {
    const val = (p) => {
      switch (sort.key) {
        case "name":
          return (p.name || "").toLowerCase();
        case "code":
          return (p.project_code || "").toLowerCase();
        case "client":
          return (p.client_name || "").toLowerCase();
        case "date":
          return p.date || "";
        case "status":
          return normStatus(p.status);
        case "progress":
          return Number(p.progress) || 0;
        default:
          return "";
      }
    };
    return [...filteredData].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [filteredData, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedData = useMemo(
    () => sortedData.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedData, safePage, pageSize]
  );

  const projectStats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) =>
      ["active", "ongoing"].includes(normStatus(p.status))
    ).length;
    const completed = projects.filter(
      (p) => normStatus(p.status) === "completed"
    ).length;
    const onHold = projects.filter((p) =>
      ["onhold"].includes(normStatus(p.status))
    ).length;

    return { total, active, completed, onHold };
  }, [projects]);

  const getStatusClass = (status) => {
    switch (normStatus(status)) {
      case "active":
      case "ongoing":
        return styles.statusOngoing;
      case "completed":
      case "closed":
        return styles.statusCompleted;
      case "onhold":
        return styles.statusOnHold;
      default:
        return styles.statusDefault;
    }
  };

  const statusLabel = (status) => {
    const map = {
      draft: "Draft",
      planned: "Planned",
      active: "Active",
      ongoing: "Ongoing",
      onhold: "On Hold",
      completed: "Completed",
      closed: "Closed",
      cancelled: "Cancelled",
      notstarted: "Not Started",
    };
    return map[normStatus(status)] || status || "Unknown";
  };

  const apiError = (err, fallback) =>
    err?.response?.data?.detail || err?.message || fallback;

  // Supervisors have no /:id catch-all — always land on their detail route.
  const goDetail = (pid) => {
    if (isSupervisor) navigate(`/supervisor/my-projects/${pid}`);
    else navigate(`${pid}`);
  };

  // Awaited + error-propagating: the form keeps the modal open and shows
  // submitError on failure; success closes the modal with a toast.
  const handleSubmit = async (data) => {
    if (!canManage) return;
    try {
      if (selectedProject) {
        await updateProject(selectedProject.id, data);
        push(`Project ${selectedProject.project_code} updated`, "success");
      } else {
        await addProject(data);
        push("Project created", "success");
      }
      setSelectedProject(null);
      setIsModalOpen(false);
    } catch (err) {
      push(apiError(err, "Save failed"), "error");
      throw err;
    }
  };

  const confirmDelete = async () => {
    if (!canDelete || !selectedProject) return;
    try {
      await deleteProject(selectedProject.id);
      push("Project deleted", "success");
      setSelectedProject(null);
      setIsDeleteModal(false);
    } catch (err) {
      push(apiError(err, "Delete failed"), "error");
    }
  };

  const clearFilters = () => {
    setFilters({ search: "", status: "" });
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{isSupervisor ? "My Assignments" : "Project Management"}</span>
          <h1>{isSupervisor ? "My Projects" : "Projects"}</h1>
          <p>
            {isSupervisor
              ? "Only the projects assigned to you are listed here. Open one to file reports and record expenses."
              : "Manage project details, supervisors, vendors, machinery and progress from one clean workspace."}
          </p>
        </div>

        {canManage && (
          <button
            className={styles.addBtn}
            disabled={loading}
            onClick={() => {
              setSelectedProject(null);
              setIsModalOpen(true);
            }}
          >
            <FiPlus />
            Add Project
          </button>
        )}
      </div>

      <div className={styles.statsGrid}>
        <StatCard
          title="Total Projects"
          value={projectStats.total}
          icon={<FiBriefcase />}
        />
        <StatCard
          title="Active"
          value={projectStats.active}
          icon={<FiClock />}
          type="blue"
        />
        <StatCard
          title="Completed"
          value={projectStats.completed}
          icon={<FiCheckCircle />}
          type="green"
        />
        <StatCard
          title="On Hold"
          value={projectStats.onHold}
          icon={<FiRefreshCw />}
          type="orange"
        />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            type="text"
            placeholder="Search code, name, client, location..."
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
          />
        </div>

        <div className={styles.filterBox}>
          <FiFilter />
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, status: e.target.value }))
            }
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="onhold">On Hold</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {(filters.search || filters.status) && (
          <button onClick={clearFilters} className={styles.clearBtn}>
            <FiX />
            Clear
          </button>
        )}
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Project List</h3>
            <p>
              Showing{" "}
              {sortedData.length === 0
                ? 0
                : (safePage - 1) * pageSize + 1}
              –{Math.min(safePage * pageSize, sortedData.length)} of{" "}
              {sortedData.length} projects
              {sortedData.length !== projects.length &&
                ` (filtered from ${projects.length})`}
            </p>
          </div>
          <label className={styles.pageSizeLabel}>
            Rows
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[8, 12, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortTh label="Project" k="name" sort={sort} onSort={toggleSort} />
                <SortTh label="Client" k="client" sort={sort} onSort={toggleSort} />
                <SortTh label="Schedule" k="date" sort={sort} onSort={toggleSort} />
                <th>Team</th>
                <SortTh label="Status" k="status" sort={sort} onSort={toggleSort} />
                <SortTh label="Progress" k="progress" sort={sort} onSort={toggleSort} />
                {(canManage || canDelete) && <th className={styles.actionsCol}>Actions</th>}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <SkeletonRows
                  colSpan={canManage || canDelete ? 7 : 6}
                  rows={pageSize}
                />
              ) : pagedData.length === 0 ? (
                <tr>
                  <td colSpan={canManage || canDelete ? 7 : 6}>
                    <div className={styles.emptyState}>
                      <span className={styles.emptyIcon}>
                        <FiBriefcase />
                      </span>
                      <h3>No projects found</h3>
                      <p>Try changing search or status filter.</p>
                      {(filters.search || filters.status) && (
                        <button onClick={clearFilters} className={styles.clearBtn}>
                          <FiX />
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pagedData.map((p, idx) => {
                  const progress = p.progress || 0;

                  return (
                    <tr
                      key={p.id}
                      className={`${styles.rowClickable} ${idx % 2 === 1 ? styles.zebra : ""}`}
                      onClick={() => goDetail(p.id)}
                    >
                      <td>
                        <div className={styles.projectCell}>
                          <button
                            className={styles.projectLink}
                            onClick={(e) => {
                              e.stopPropagation();
                              goDetail(p.id);
                            }}
                          >
                            {p.name || "-"}
                          </button>
                          <div className={styles.projectMeta}>
                            <span className={styles.codeBadge}>
                              {p.project_code || "-"}
                            </span>
                            <span className={styles.metaLoc}>
                              <FiMapPin />
                              {p.location || "-"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className={styles.clientCell}>
                          <strong>{p.client_name || "-"}</strong>
                          <span>{p.engineer_in_charge || "-"}</span>
                        </div>
                      </td>

                      <td>
                        <div className={styles.dateCell}>
                          <FiCalendar />
                          {p.date || "-"}
                        </div>
                      </td>

                      <td>
                        <TeamCell
                          vendors={p.vendors?.map((v) => v.vendor_name) || []}
                          supervisors={
                            p.supervisors?.map((s) => s.full_name) || []
                          }
                          machinery={
                            p.machinery?.map((m) => m.machine_name) || []
                          }
                        />
                      </td>

                      <td>
                        <span
                          className={`${styles.statusBadge} ${getStatusClass(
                            p.status
                          )}`}
                        >
                          <span className={styles.statusDot} />
                          {statusLabel(p.status)}
                        </span>
                      </td>

                      <td>
                        <div className={styles.progressBox}>
                          <div className={styles.progressInfo}>
                            <span>{progress}%</span>
                          </div>
                          <div className={styles.progressTrack}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {(canManage || canDelete) && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className={styles.actionGroup}>
                            {canManage && (
                              <button
                                onClick={() => {
                                  setSelectedProject(p);
                                  setIsModalOpen(true);
                                }}
                                className={styles.editBtn}
                                title="Edit project"
                                aria-label={`Edit ${p.name}`}
                              >
                                <FiEdit2 />
                              </button>
                            )}

                            {canDelete && (
                              <button
                                onClick={() => {
                                  setSelectedProject(p);
                                  setIsDeleteModal(true);
                                }}
                                className={styles.deleteBtn}
                                title="Delete project"
                                aria-label={`Delete ${p.name}`}
                              >
                                <FiTrash2 />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
            >
              ← Prev
            </button>
            {pageNumbers(safePage, totalPages).map((n, i) =>
              n === "…" ? (
                <span key={`gap-${i}`} className={styles.pageGap}>
                  …
                </span>
              ) : (
                <button
                  key={n}
                  className={`${styles.pageBtn} ${n === safePage ? styles.pageActive : ""}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              )
            )}
            <button
              className={styles.pageBtn}
              disabled={safePage === totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {canManage && isModalOpen && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="lg">
          <NewProjectForm
            initialData={selectedProject}
            onSubmit={handleSubmit}
          />
        </Modal>
      )}

      {canDelete && (
        <ConfirmDialog
          isOpen={isDeleteModal}
          onClose={() => setIsDeleteModal(false)}
          onConfirm={confirmDelete}
          title="Delete Project?"
          message={
            <>
              Are you sure you want to delete <b>{selectedProject?.name}</b>?
              This action cannot be undone.
            </>
          }
          confirmLabel="Delete"
        />
      )}
    </div>
  );
}

function StatCard({ title, value, icon, type = "blue" }) {
  return (
    <div className={`${styles.statCard} ${styles[type]}`}>
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>
      <span>{icon}</span>
    </div>
  );
}

function SkeletonRows({ colSpan, rows }) {
  return (
    <>
      {Array.from({ length: Math.min(rows, 8) }).map((_, i) => (
        <tr key={`sk-${i}`}>
          <td colSpan={colSpan}>
            <div className={styles.skRow} aria-hidden>
              <span className={styles.skAvatar} />
              <span className={styles.skLines}>
                <i style={{ width: `${52 - i * 4}%` }} />
                <i style={{ width: `${30 - i * 2}%` }} />
              </span>
              <span className={styles.skPill} />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function SortTh({ label, k, sort, onSort }) {
  const active = sort?.key === k;
  return (
    <th aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`${styles.sortTh} ${active ? styles.sortActive : ""}`}
        onClick={() => onSort(k)}
        title={`Sort by ${label}`}
      >
        {label}
        <span className={styles.sortIcon} aria-hidden>
          {active ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, current - 1, current, current + 1, total - 1, total]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

const AVATAR_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#db2777", "#ea580c"];

function TeamGroup({ label, items, color }) {
  if (!items || items.length === 0) return null;
  const shown = items.slice(0, 3);
  return (
    <div
      className={styles.teamGroup}
      title={`${label}: ${items.join(", ")}`}
    >
      <span className={styles.teamAvatars}>
        {shown.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className={styles.miniAvatar}
            style={{
              background: AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length],
              zIndex: shown.length - i,
            }}
          >
            {(name || "?").charAt(0).toUpperCase()}
          </span>
        ))}
      </span>
      <span className={styles.teamLabel}>
        {label} · <b>{items.length}</b>
      </span>
      {items.length > 3 && (
        <span className={styles.moreTag}>+{items.length - 3}</span>
      )}
    </div>
  );
}

function TeamCell({ vendors, supervisors, machinery }) {
  const total = vendors.length + supervisors.length + machinery.length;
  if (total === 0) return <span className={styles.emptyText}>Unassigned</span>;
  return (
    <div className={styles.teamCell}>
      <TeamGroup label="Vendors" items={vendors} />
      <TeamGroup label="Supervisors" items={supervisors} />
      <TeamGroup label="Machines" items={machinery} />
    </div>
  );
}