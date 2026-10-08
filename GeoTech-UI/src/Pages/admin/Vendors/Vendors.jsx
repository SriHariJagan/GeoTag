import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiBriefcase,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiEye,
  FiFilter,
  FiMail,
  FiMapPin,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSlash,
  FiStar,
  FiTrash2,
  FiTruck,
  FiUser,
  FiX,
} from "react-icons/fi";
import Modal from "../../../Components/Modal/Modal";
import ConfirmDialog from "../../../Components/Modal/ConfirmDialog";
import Toast from "../../../Components/Toast/Toast";
import { useToast } from "../../../Components/Toast/useToast";
import styles from "./Vendors.module.css";
import { useVendors } from "../../../store/context/VendorContext";
import Pagination from "../../../Components/Pagination/Pagination";
import { useAuth } from "../../../store/context/AuthContext";
import { can, PERMISSIONS } from "../../../constants/permissions";
import NewVendorForm from "../../../Components/Forms/NewVendorForm";

const PAGE_SIZE = 15;

const CATEGORIES = [
  "GEOTECHNICAL_INVESTIGATION",
  "SOIL_TESTING",
  "SURVEYING",
  "DRILLING",
  "MATERIAL_TESTING",
  "CIVIL_WORKS",
  "EQUIPMENT_RENTAL",
  "TRANSPORTATION",
  "LABOR_SUPPLY",
  "ENGINEERING_CONSULTANCY",
];

const STATUSES = ["ACTIVE", "PROSPECT", "SUSPENDED", "BLACKLISTED"];

const statusClass = (s) => {
  switch ((s || "").toUpperCase()) {
    case "ACTIVE":
      return styles.statusActive;
    case "PROSPECT":
      return styles.statusProspect;
    case "SUSPENDED":
      return styles.statusSuspended;
    case "BLACKLISTED":
      return styles.statusBlacklisted;
    default:
      return styles.statusDefault;
  }
};

export default function Vendors() {
  const { vendors, total: serverTotal, loading, error, loadVendors, addVendor, editVendor, removeVendor } =
    useVendors();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModal, setIsDeleteModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const canWrite = can(user, PERMISSIONS.VENDOR_CREATE);
  const canDelete = can(user, PERMISSIONS.VENDOR_DELETE);

  const fetchPage = useCallback(() => {
    return loadVendors({
      search: search || undefined,
      status: status || undefined,
      category: category || undefined,
      limit: PAGE_SIZE,
      offset,
    }).catch(() => {});
  }, [loadVendors, search, status, category, offset]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setCategory("");
    setOffset(0);
  };
  const hasFilters = search || status || category;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchPage();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmit = async (data) => {
    try {
      if (selectedVendor) await editVendor(selectedVendor.id, data);
      else await addVendor(data);
      setIsModalOpen(false);
      setSelectedVendor(null);
      push(selectedVendor ? "Vendor updated successfully" : "Vendor onboarded successfully", "success");
    } catch (err) {
      push(err?.response?.data?.detail || "Save failed", "error");
    }
  };

  const handleDelete = async () => {
    try {
      await removeVendor(selectedVendor.id);
      push("Vendor deleted", "success");
    } catch (err) {
      push(err?.response?.data?.detail || "Delete failed. Vendors linked to projects, RFQs or work orders cannot be deleted.", "error");
    } finally {
      setIsDeleteModal(false);
      setSelectedVendor(null);
    }
  };

  const nameOf = (v) => v.legal_business_name || v.vendor_company || "-";

  const stats = {
    total: vendors.length,
    active: vendors.filter((v) => v.status === "ACTIVE").length,
    overdue: vendors.filter((v) => v.compliance_overdue).length,
    avg:
      vendors.length
        ? (vendors.reduce((s, v) => s + (v.rating || 0), 0) / vendors.length).toFixed(1)
        : "-",
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Vendor Management</span>
          <h1>Vendor Directory</h1>
          <p>
            Onboard vendor organizations, track compliance and capabilities,
            and open a profile for RFQs, quotations and work orders.
          </p>
        </div>
        <div className={styles.heroActions}>
          <button className={styles.refreshBtn} onClick={handleRefresh} disabled={loading || refreshing}>
            <FiRefreshCw className={refreshing ? styles.spinning : ""} />
            Refresh
          </button>
          {canWrite && (
            <button
              className={styles.addBtn}
              onClick={() => {
                setSelectedVendor(null);
                setIsModalOpen(true);
              }}
            >
              <FiPlus />
              Add Vendor
            </button>
          )}
        </div>
      </div>

      <div className={styles.statsGrid}>
        <StatCard title="Total Vendors" value={stats.total} icon={<FiTruck />} />
        <StatCard title="Active" value={stats.active} icon={<FiCheckCircle />} type="green" />
        <StatCard title="Compliance Overdue" value={stats.overdue} icon={<FiSlash />} type="orange" />
        <StatCard title="Avg Rating" value={stats.avg} icon={<FiStar />} type="yellow" />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            placeholder="Search name, code, city..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className={styles.filterBox}>
          <FiFilter />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterBox}>
          <FiBriefcase />
          <select value={category} onChange={(e) => { setCategory(e.target.value); setOffset(0); }}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
            ))}
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
            <h3>Vendor List</h3>
            <p>
              Showing {vendors.length} vendors{hasFilters ? " (filtered)" : ""} · Page{" "}
              {Math.floor(offset / PAGE_SIZE) + 1}
            </p>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Status</th>
                <th>Rating</th>
                <th>Experience</th>
                <th>Projects</th>
                <th className={styles.actionsCol}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows colSpan="8" rows={PAGE_SIZE} />
              ) : error ? (
                <tr>
                  <td colSpan="8">
                    <div className={styles.emptyState}>
                      <span className={styles.emptyIcon}>
                        <FiX />
                      </span>
                      <h3>Failed to load vendors</h3>
                      <p>{error?.response?.data?.detail || error.message}</p>
                    </div>
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className={styles.emptyState}>
                      <span className={styles.emptyIcon}>
                        <FiTruck />
                      </span>
                      <h3>No vendors found</h3>
                      <p>Try changing filters or onboard a new vendor.</p>
                      {hasFilters && (
                        <button className={styles.clearBtn} onClick={clearFilters}>
                          <FiX />
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                vendors.map((v, idx) => (
                  <tr
                    key={v.id}
                    className={`${styles.rowClickable} ${idx % 2 === 1 ? styles.zebra : ""}`}
                    onClick={() => navigate(`/admin/vendors/${v.id}`)}
                  >
                    <td>
                      <div className={styles.companyCell}>
                        <span
                          className={styles.companyIcon}
                          style={{ background: tileBg(nameOf(v)) }}
                        >
                          {nameOf(v).charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <strong>{nameOf(v)}</strong>
                          <div>
                            <span className={styles.codeBadge}>
                              {v.vendor_code || "No code"}
                            </span>
                            {(v.service_categories || "").split(",").filter(Boolean).length > 0 && (
                              <span className={styles.capLine}>
                                {(v.service_categories || "")
                                  .split(",")
                                  .slice(0, 2)
                                  .join(" · ")
                                  .toLowerCase()
                                  .replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.iconCell}>
                        <FiUser />
                        <div>
                          <strong>{v.contact_person || "-"}</strong>
                          <div className={styles.subText}>
                            {[v.phone, v.email].filter(Boolean).join(" · ") || "-"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.locCell}>
                        <FiMapPin />
                        {[v.city, v.country].filter(Boolean).join(", ") || "-"}
                      </span>
                    </td>
                    <td>
                      <span className={styles.statusStack}>
                        <span className={`${styles.statusBadge} ${statusClass(v.status)}`}>
                          <span className={styles.statusDot} />
                          {(v.status || "-").toLowerCase()}
                        </span>
                        {v.compliance_overdue && (
                          <span className={styles.flagBadge}>
                            <FiSlash /> compliance due
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <RatingStars value={v.rating} />
                    </td>
                    <td className={styles.expCell}>
                      {v.years_of_experience != null ? `${v.years_of_experience} yrs` : "-"}
                    </td>
                    <td>
                      {(v.project_names || []).length > 0 ? (
                        <span
                          className={styles.projectTags}
                          title={(v.project_names || []).join(", ")}
                        >
                          {(v.project_names || []).slice(0, 2).map((n) => (
                            <span key={n}>{n}</span>
                          ))}
                          {(v.project_names || []).length > 2 && (
                            <span>+{(v.project_names || []).length - 2}</span>
                          )}
                        </span>
                      ) : (
                        <span className={styles.emptyText}>—</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionGroup}>
                        <button
                          className={styles.viewBtn}
                          title="Open profile"
                          aria-label={`Open ${nameOf(v)}`}
                          onClick={() => navigate(`/admin/vendors/${v.id}`)}
                        >
                          <FiEye />
                        </button>
                        {canWrite && (
                          <button
                            className={styles.editBtn}
                            title="Edit vendor"
                            aria-label={`Edit ${nameOf(v)}`}
                            onClick={() => {
                              setSelectedVendor(v);
                              setIsModalOpen(true);
                            }}
                          >
                            <FiEdit2 />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className={styles.deleteBtn}
                            title="Delete vendor"
                            aria-label={`Delete ${nameOf(v)}`}
                            onClick={() => {
                              setSelectedVendor(v);
                              setIsDeleteModal(true);
                            }}
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.tableFooter}>
          <span className={styles.footNote}>
            Server-paginated · {PAGE_SIZE} per page
            {hasFilters ? " · filters active" : ""}
          </span>
          <Pagination
            page={Math.floor(offset / PAGE_SIZE) + 1}
            total={serverTotal ?? vendors.length}
            pageSize={PAGE_SIZE}
            onPage={(p) => setOffset((p - 1) * PAGE_SIZE)}
          />
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <NewVendorForm initialData={selectedVendor} onSubmit={handleSubmit} />
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteModal}
        onClose={() => setIsDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Vendor?"
        message={
          <>
            Are you sure you want to delete{" "}
            <b>{selectedVendor ? nameOf(selectedVendor) : ""}</b>?
            Vendors linked to projects, RFQs or work orders cannot be deleted.
          </>
        }
        confirmLabel="Delete"
      />
    </div>
  );
}

function StatCard({ title, value, icon, type }) {
  return (
    <div className={`${styles.statCard} ${type ? styles[type] : ""}`}>
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

const TILE_GRADIENTS = [
  "linear-gradient(135deg, #2563eb, #0ea5e9)",
  "linear-gradient(135deg, #7c3aed, #db2777)",
  "linear-gradient(135deg, #0d9488, #22c55e)",
  "linear-gradient(135deg, #ea580c, #f59e0b)",
  "linear-gradient(135deg, #1d4ed8, #7c3aed)",
];

function tileBg(name) {
  const c = (name || "V").charCodeAt(0) || 0;
  return TILE_GRADIENTS[c % TILE_GRADIENTS.length];
}

function RatingStars({ value }) {
  if (value == null) return <span className={styles.emptyText}>—</span>;
  const filled = Math.max(0, Math.min(5, Math.round(Number(value))));
  return (
    <span className={styles.ratingWrap} title={`Rating ${value}`}>
      <span className={styles.stars} aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={i < filled ? "" : styles.off}>
            ★
          </span>
        ))}
      </span>
      <span className={styles.ratingVal}>{Number(value).toFixed(1)}</span>
    </span>
  );
}
