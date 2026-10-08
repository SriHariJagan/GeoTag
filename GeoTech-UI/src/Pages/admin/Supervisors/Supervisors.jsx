import {
  useState,
  useMemo,
  useEffect,
  useDeferredValue,
  Fragment,
} from "react";
import {
  FiBriefcase,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiFilter,
  FiMail,
  FiMapPin,
  FiPhone,
  FiRefreshCw,
  FiSearch,
  FiUserCheck,
  FiUsers,
  FiUserX,
  FiX,
} from "react-icons/fi";
import styles from "./Supervisors.module.css";
import { useSupervisors } from "../../../store/context/SupervisorContext";
import Pagination from "../../../Components/Pagination/Pagination";
import { useLocation } from "react-router-dom";

export default function Supervisors() {
  const { supervisors, total, loadSupervisors, loading } = useSupervisors();
  const location = useLocation();

  const [expandedRow, setExpandedRow] = useState(null);

  const [filters, setFilters] = useState({
    search: "",
    status: "",
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { setPage(1); }, [filters.search, filters.status, pageSize]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setFilters((prev) => ({ ...prev, status: params.get("status") || "" }));
  }, [location.search]);

  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    loadSupervisors();
  }, []);

  const filteredData = useMemo(() => {
    return supervisors.filter((s) => {
      const matchesName =
        !deferredSearch ||
        s.name.toLowerCase().includes(deferredSearch.toLowerCase());

      const matchesStatus =
        filters.status === ""
          ? true
          : filters.status === "active"
          ? s.is_active
          : !s.is_active;

      return matchesName && matchesStatus;
    });
  }, [supervisors, deferredSearch, filters.status]);

  const startIdx = (page - 1) * pageSize;
  const pagedData = filteredData.slice(startIdx, startIdx + pageSize);

  const stats = useMemo(() => {
    const total = supervisors.length;
    const active = supervisors.filter((s) => s.is_active).length;
    const inactive = supervisors.filter((s) => !s.is_active).length;
    const totalProjects = supervisors.reduce(
      (sum, s) => sum + Number(s.total_projects || 0),
      0
    );

    return { total, active, inactive, totalProjects };
  }, [supervisors]);

  const toggleExpand = (id) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  const clearFilters = () => {
    setFilters({ search: "", status: "" });
  };

  const hasFilters = filters.search || filters.status;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Field Team Management</span>
          <h1>Supervisors</h1>
          <p>
            Monitor supervisor availability, assigned projects, working days and
            recent field activity in one clean workspace.
          </p>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <StatCard title="Total Supervisors" value={stats.total} icon={<FiUsers />} />
        <StatCard title="Active" value={stats.active} icon={<FiUserCheck />} type="green" />
        <StatCard title="Inactive" value={stats.inactive} icon={<FiUserX />} type="red" />
        <StatCard title="Assigned Projects" value={stats.totalProjects} icon={<FiBriefcase />} type="orange" />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            type="text"
            placeholder="Search supervisor..."
            value={filters.search}
            onChange={(e) =>
              setFilters((p) => ({ ...p, search: e.target.value }))
            }
          />
        </div>

        <div className={styles.filterBox}>
          <FiFilter />
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((p) => ({ ...p, status: e.target.value }))
            }
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {hasFilters && (
          <button className={styles.clearBtn} onClick={clearFilters}>
            <FiX />
            Clear
          </button>
        )}
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Supervisor List</h3>
            <p>
              Showing {pagedData.length} of {filteredData.length} supervisors · page {page}
            </p>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Total Projects</th>
                <th>Working Days</th>
                <th>Projects</th>
                <th>Last Updated</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8">
                    <div className={styles.loadingState}>
                      <div className={styles.loader}></div>
                      <p>Loading supervisors...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className={styles.emptyState}>
                      <FiUsers />
                      <h3>No supervisors found</h3>
                      <p>Try changing search or status filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedData.map((s) => (
                  <Fragment key={s.id}>
                    <tr className={styles.mainRow}>
                      <td>
                        <div className={styles.nameCell}>
                          <div className={styles.avatar}>
                            {s.name?.charAt(0)?.toUpperCase() || "S"}
                          </div>
                          <div>
                            <strong>{s.name}</strong>
                            <span>Supervisor</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className={styles.iconCell}>
                          <FiMail />
                          {s.email || "-"}
                        </div>
                      </td>

                      <td>
                        <div className={styles.iconCell}>
                          <FiPhone />
                          {s.contact || "-"}
                        </div>
                      </td>

                      <td>
                        <div className={styles.statusStack}>
                          {s.is_active ? (
                            <span className={`${styles.badge} ${styles.active}`}>
                              <FiCheckCircle /> Active
                            </span>
                          ) : (
                            <span className={`${styles.badge} ${styles.inactive}`}>
                              <FiX /> Inactive
                            </span>
                          )}

                          {s.updated_today && (
                            <span className={`${styles.badge} ${styles.updated}`}>
                              <FiClock /> Today
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <span className={styles.countBadge}>
                          {s.total_projects || 0}
                        </span>
                      </td>

                      <td>
                        <span className={styles.countBadge}>
                          {s.total_working_days || 0}
                        </span>
                      </td>

                      <td>
                        <button
                          className={styles.viewBtn}
                          onClick={() => toggleExpand(s.id)}
                        >
                          {expandedRow === s.id ? (
                            <>
                              Hide <FiChevronUp />
                            </>
                          ) : (
                            <>
                              View ({s.assigned_projects?.length || 0})
                              <FiChevronDown />
                            </>
                          )}
                        </button>
                      </td>

                      <td>{s.last_updated || "-"}</td>
                    </tr>

                    {expandedRow === s.id && (
                      <tr className={styles.expandedRow}>
                        <td colSpan="8">
                          <div className={styles.expandedContent}>
                            <div className={styles.expandedTitle}>
                              <h4>Assigned Projects</h4>
                              <span>{s.assigned_projects?.length || 0} projects</span>
                            </div>

                            {!s.assigned_projects ||
                            s.assigned_projects.length === 0 ? (
                              <div className={styles.noProjectBox}>
                                <FiBriefcase />
                                <p>No assigned projects</p>
                              </div>
                            ) : (
                              <ul className={styles.projectList}>
                                {s.assigned_projects.map((p) => (
                                  <li key={p.id} className={styles.projectItem}>
                                    <div className={styles.projectHeader}>
                                      <div>
                                        <strong>{p.name}</strong>
                                        <p>
                                          <FiMapPin />
                                          {p.location || "No location"}
                                        </p>
                                      </div>

                                      <span
                                        className={`${styles.projectStatus} ${
                                          p.is_active
                                            ? styles.activeProject
                                            : styles.inactiveProject
                                        }`}
                                      >
                                        {p.is_active ? "Active" : "Removed"}
                                      </span>
                                    </div>

                                    <div className={styles.projectMeta}>
                                      <span>
                                        <FiRefreshCw />
                                        Status: {p.status || "-"}
                                      </span>
                                      <span>
                                        <FiClock />
                                        Assigned: {p.assigned_at || "-"}
                                      </span>
                                      <span>
                                        <FiCalendarIcon />
                                        Working Days: {p.working_days || 0}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          total={filteredData.length}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      </div>
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

function FiCalendarIcon() {
  return <FiClock />;
}