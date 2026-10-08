import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiClipboard,
  FiCheckCircle,
  FiClock,
  FiEye,
  FiFileText,
  FiSearch,
  FiFilter,
  FiX,
} from "react-icons/fi";import { useProcurement } from "../../../store/context/ProcurementContext";
import Toast from "../../../Components/Toast/Toast";
import { useToast } from "../../../Components/Toast/useToast";
import Pagination from "../../../Components/Pagination/Pagination";
import { endVendorAssignment } from "../../../api/procurement.api";
import styles from "./Procurement.module.css";

const statusClass = (s) => {
  switch ((s || "").toUpperCase()) {
    case "ISSUED":
    case "IN_PROGRESS":
      return styles.stActive;
    case "ACCEPTED":
    case "COMPLETED":
    case "CLOSED":
      return styles.stSuccess;
    case "REJECTED":
    case "CANCELLED":
      return styles.stDanger;
    default:
      return styles.stWarning;
  }
};

export default function WorkOrders() {
  const { workOrders, assignments, loading, error, loadWorkOrders, loadAssignments } =
    useProcurement();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    loadWorkOrders().catch(() => {});
    loadAssignments().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPage(1); }, [search, status, pageSize]);

  const filtered = workOrders.filter((w) => {
    const q = search.trim().toLowerCase();
    return (
      (!q ||
        w.work_order_number?.toLowerCase().includes(q) ||
        w.vendor_name?.toLowerCase().includes(q)) &&
      (!status || w.status === status)
    );
  });

  const startIdx = (page - 1) * pageSize;
  const paged = filtered.slice(startIdx, startIdx + pageSize);

  const activeAssign = assignments.filter((a) => a.status === "ACTIVE");

  const stats = {
    total: workOrders.length,
    pending: workOrders.filter((w) => ["ISSUED", "VIEWED"].includes(w.status)).length,
    active: workOrders.filter((w) => ["ACCEPTED", "IN_PROGRESS"].includes(w.status)).length,
    assigned: activeAssign.length,
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Procurement</span>
          <h1>Work Orders</h1>
          <p>
            Direct wizard or award-linked. A vendor's acceptance is what activates
            the project assignment — never the selection alone.
          </p>
          <div style={{ marginTop: 10 }}>
            <button className={styles.rowBtn} onClick={() => navigate("/admin/work-orders/create")}>
              + New Work Order (studio)
            </button>
          </div>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <StatCard title="Total Orders" value={stats.total} icon={<FiClipboard />} />
        <StatCard title="Awaiting Acceptance" value={stats.pending} icon={<FiClock />} type="orange" />
        <StatCard title="In Execution" value={stats.active} icon={<FiFileText />} type="blue" />
        <StatCard title="Active Assignments" value={stats.assigned} icon={<FiCheckCircle />} type="green" />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            placeholder="Search WO number or vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterBox}>
          <FiFilter />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {["DRAFT", "IN_REVIEW", "PDF_GENERATED", "SIGNED", "STAMPED", "FINALIZED", "ISSUED", "VIEWED", "ACCEPTED", "REJECTED", "IN_PROGRESS", "COMPLETED", "CLOSED", "CANCELLED"].map((s) => (
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

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            placeholder="Search WO number or vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterBox}>
          <FiFilter />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {["DRAFT", "IN_REVIEW", "PDF_GENERATED", "SIGNED", "STAMPED", "FINALIZED", "ISSUED", "VIEWED", "ACCEPTED", "REJECTED", "IN_PROGRESS", "COMPLETED", "CLOSED", "CANCELLED"].map((s) => (
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
            <h3>Order List</h3>
            <p>{filtered.length} matching · page {page}</p>
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>WO Number</th>
                <th>Vendor</th>
                <th>Project</th>
                <th>Contract Value</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7"><div className={styles.loadingState}><div className={styles.loader}></div><p>Loading work orders...</p></div></td></tr>
              ) : error ? (
                <tr><td colSpan="7"><div className={styles.emptyState}><FiX /><h3>Failed to load</h3><p>{error?.response?.data?.detail || error.message}</p></div></td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan="7"><div className={styles.emptyState}><FiClipboard /><h3>No work orders found</h3><p>Create one from an awarded RFQ.</p></div></td></tr>
              ) : (
                paged.map((w) => (
                  <tr key={w.id}>
                    <td><span className={styles.codeBadge}>{w.work_order_number}</span></td>
                    <td><strong>{w.vendor_name || `#${w.vendor_id}`}</strong></td>
                    <td>#{w.project_id}</td>
                    <td className={styles.money}>{w.contract_value} {w.currency}</td>
                    <td>{w.start_date || "?"} → {w.end_date || "?"}</td>
                    <td><span className={`${styles.statusBadge} ${statusClass(w.status)}`}>{(w.status || "-").toLowerCase().replace(/_/g, " ")}</span></td>
                    <td>
                      <button className={styles.rowBtn} onClick={() => navigate(`/admin/work-orders/${w.id}`)}>
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

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Vendor Assignments</h3>
            <p>History is preserved — ending an assignment never deletes it</p>
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Vendor</th>
                <th>Work Order</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 && (
                <tr><td colSpan="5">No assignments yet. They activate on work-order acceptance.</td></tr>
              )}
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>#{a.project_id}</td>
                  <td><strong>{a.vendor_name || `#${a.vendor_id}`}</strong></td>
                  <td>#{a.work_order_id}</td>
                  <td><span className={`${styles.statusBadge} ${a.status === "ACTIVE" ? styles.stSuccess : styles.stNeutral}`}>{(a.status || "-").toLowerCase()}</span></td>
                  <td>
                    {a.status === "ACTIVE" && (
                      <button
                        className={`${styles.rowBtn} ${styles.rowBtnDanger}`}
                        onClick={async () => {
                          try {
                            await endVendorAssignment(a.id, "COMPLETED", "Work finished");
                            push("Assignment ended (history kept)", "success");
                            loadAssignments().catch(() => {});
                          } catch (err) {
                            push(err?.response?.data?.detail || "Failed", "error");
                          }
                        }}
                      >
                        End
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
