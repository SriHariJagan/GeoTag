import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiClipboard,
  FiClock,
  FiCheckCircle,
  FiFileText,
  FiPlus,
  FiSearch,
  FiFilter,
  FiX,
  FiEye,
} from "react-icons/fi";
import { useProcurement } from "../../../store/context/ProcurementContext";
import { useProjects } from "../../../store/context/ProjectContext";
import { useAuth } from "../../../store/context/AuthContext";
import { can, PERMISSIONS } from "../../../constants/permissions";
import Modal from "../../../Components/Modal/Modal";
import Toast from "../../../Components/Toast/Toast";
import { useToast } from "../../../Components/Toast/useToast";
import { createRFQ } from "../../../api/procurement.api";
import styles from "./Procurement.module.css";
import Pagination from "../../../Components/Pagination/Pagination";

const statusClass = (s) => {
  switch ((s || "").toUpperCase()) {
    case "SENT":
    case "EVALUATING":
      return styles.stActive;
    case "AWARDED":
      return styles.stSuccess;
    case "CANCELLED":
      return styles.stDanger;
    case "CLOSED":
      return styles.stNeutral;
    default:
      return styles.stWarning;
  }
};

export default function RFQs() {
  const { rfqs, loading, error, loadRFQs } = useProcurement();
  const { projects, loadProjects } = useProjects();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState({ project_id: "", title: "", scope_of_work: "" });

  useEffect(() => { setPage(1); }, [search, status, pageSize]);

  const canCreate = can(user, PERMISSIONS.RFQ_CREATE);

  useEffect(() => {
    loadRFQs().catch(() => {});
    loadProjects().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rfqs.filter((r) => {
    const q = search.trim().toLowerCase();
    return (
      (!q ||
        r.rfq_number?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q)) &&
      (!status || r.status === status)
    );
  });

  const startIdx = (page - 1) * pageSize;
  const paged = filtered.slice(startIdx, startIdx + pageSize);

  const stats = {
    total: rfqs.length,
    open: rfqs.filter((r) => ["DRAFT", "SENT", "EVALUATING"].includes(r.status)).length,
    awarded: rfqs.filter((r) => r.status === "AWARDED").length,
    quotes: rfqs.reduce((s, r) => s + (r.quotation_count || 0), 0),
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await createRFQ({ ...form, project_id: Number(form.project_id) });
      setOpen(false);
      setForm({ project_id: "", title: "", scope_of_work: "" });
      push("RFQ created as draft", "success");
      loadRFQs().catch(() => {});
      navigate(`/admin/procurement/rfqs/${res.data.id}`);
    } catch (err) {
      push(err?.response?.data?.detail || "Create failed", "error");
    }
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Procurement</span>
          <h1>RFQs / Bid Requests</h1>
          <p>
            Pre-award requests sent to vendors. Quotations, evaluation and award
            happen per RFQ — work orders are created only after an award.
          </p>
        </div>
        <div className={styles.heroActions}>
          {canCreate && (
            <button className={styles.addBtn} onClick={() => setOpen(true)}>
              <FiPlus />
              Create RFQ
            </button>
          )}
        </div>
      </div>

      <div className={styles.statsGrid}>
        <StatCard title="Total RFQs" value={stats.total} icon={<FiClipboard />} />
        <StatCard title="Open" value={stats.open} icon={<FiClock />} type="orange" />
        <StatCard title="Awarded" value={stats.awarded} icon={<FiCheckCircle />} type="green" />
        <StatCard title="Quotations" value={stats.quotes} icon={<FiFileText />} type="yellow" />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            placeholder="Search RFQ number or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterBox}>
          <FiFilter />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {["DRAFT", "SENT", "EVALUATING", "AWARDED", "CLOSED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        {(search || status) && (
          <button className={styles.clearBtn} onClick={() => { setSearch(""); setStatus(""); }}>
            <FiX />
            Clear
          </button>
        )}
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Request List</h3>
            <p>{filtered.length} matching · page {page}</p>
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>RFQ Number</th>
                <th>Title</th>
                <th>Project</th>
                <th>Deadline</th>
                <th>Quotes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7"><div className={styles.loadingState}><div className={styles.loader}></div><p>Loading RFQs...</p></div></td></tr>
              ) : error ? (
                <tr><td colSpan="7"><div className={styles.emptyState}><FiX /><h3>Failed to load RFQs</h3><p>{error?.response?.data?.detail || error.message}</p></div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="7"><div className={styles.emptyState}><FiClipboard /><h3>No RFQs found</h3><p>Try changing filters or create a new RFQ.</p></div></td></tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id}>
                    <td><span className={styles.codeBadge}>{r.rfq_number}</span></td>
                    <td><strong>{r.title}</strong></td>
                    <td>#{r.project_id}</td>
                    <td>{r.submission_deadline ? new Date(r.submission_deadline).toLocaleDateString() : "-"}</td>
                    <td>{r.quotation_count ?? 0}</td>
                    <td><span className={`${styles.statusBadge} ${statusClass(r.status)}`}>{(r.status || "-").toLowerCase()}</span></td>
                    <td>
                      <button className={styles.rowBtn} onClick={() => navigate(`/admin/procurement/rfqs/${r.id}`)}>
                        <FiEye /> Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <form className={styles.modalForm} onSubmit={submit}>
          <h3>Create RFQ</h3>
          <label>Project *</label>
          <select value={form.project_id} onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value }))} required>
            <option value="">Select project</option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>
            ))}
          </select>
          <label>Title *</label>
          <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Borehole drilling works" required />
          <label>Scope of work</label>
          <input value={form.scope_of_work} onChange={(e) => setForm((p) => ({ ...p, scope_of_work: e.target.value }))} placeholder="Brief scope summary" />
          <button type="submit" className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} style={{ marginTop: 16, width: "100%", justifyContent: "center", height: 44 }}>
            Create Draft
          </button>
        </form>
      </Modal>
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
