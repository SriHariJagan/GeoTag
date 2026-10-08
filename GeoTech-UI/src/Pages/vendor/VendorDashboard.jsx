import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiClipboard,
  FiCheckCircle,
  FiClock,
  FiFileText,
} from "react-icons/fi";
import Toast from "../../Components/Toast/Toast";
import { useToast } from "../../Components/Toast/useToast";
import { listRFQs, listWorkOrders } from "../../api/procurement.api";
import { listVendorAssignments } from "../../api/procurement.api";
import styles from "../admin/Procurement/Procurement.module.css";

export default function VendorDashboard() {
  const navigate = useNavigate();
  const { toasts, dismiss } = useToast();
  const [rfqs, setRfqs] = useState([]);
  const [wos, setWos] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listRFQs().then((r) => setRfqs(r.data || [])),
      listWorkOrders().then((r) => setWos(r.data || [])),
      listVendorAssignments().then((r) => setAssignments(r.data || [])),
    ])
      .catch((err) => setError(err?.response?.data?.detail || "Failed to load portal"))
      .finally(() => setLoading(false));
  }, []);

  const pendingRFQs = rfqs.filter((r) => r.status === "SENT");
  const pendingWO = wos.filter((w) => ["ISSUED", "VIEWED"].includes(w.status));
  const activeProjects = assignments.filter((a) => a.status === "ACTIVE");

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Vendor Portal</span>
          <h1>Welcome back</h1>
          <p>Only your organization's RFQs, quotations, work orders and projects. Nothing else is visible here.</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.contentCard}>
          <div className={styles.loadingState}><div className={styles.loader}></div><p>Loading portal...</p></div>
        </div>
      ) : error ? (
        <div className={styles.contentCard}>
          <div className={styles.emptyState}><h3>Failed to load portal</h3><p>{error}</p></div>
        </div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <StatCard title="RFQs Awaiting Response" value={pendingRFQs.length} icon={<FiClipboard />} type="orange" />
            <StatCard title="Pending Acceptance" value={pendingWO.length} icon={<FiClock />} type="yellow" />
            <StatCard title="Active Projects" value={activeProjects.length} icon={<FiCheckCircle />} type="green" />
            <StatCard title="Quotations Live" value={wos.length} icon={<FiFileText />} />
          </div>

          <div className={styles.contentCard}>
            <div className={styles.tableHeader}>
              <div><h3>RFQs Awaiting Response</h3><p>{pendingRFQs.length} open request(s)</p></div>
            </div>
            {pendingRFQs.length === 0 ? (
              <p className={styles.hint}>No pending RFQs.</p>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead><tr><th>RFQ Number</th><th>Title</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pendingRFQs.map((r) => (
                      <tr key={r.id}>
                        <td><span className={styles.codeBadge}>{r.rfq_number}</span></td>
                        <td><strong>{r.title}</strong></td>
                        <td><span className={`${styles.statusBadge} ${styles.stActive}`}>sent</span></td>
                        <td><button className={styles.rowBtn} onClick={() => navigate(`/vendor/rfqs/${r.id}`)}>Respond</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.contentCard}>
            <div className={styles.tableHeader}>
              <div><h3>Work Orders Pending Acceptance</h3><p>{pendingWO.length} awaiting your decision</p></div>
            </div>
            {pendingWO.length === 0 ? (
              <p className={styles.hint}>Nothing awaiting acceptance.</p>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead><tr><th>WO Number</th><th>Value</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pendingWO.map((w) => (
                      <tr key={w.id}>
                        <td><span className={styles.codeBadge}>{w.work_order_number}</span></td>
                        <td className={styles.money}>{w.contract_value} {w.currency}</td>
                        <td><span className={`${styles.statusBadge} ${styles.stWarning}`}>{(w.status || "").toLowerCase()}</span></td>
                        <td><button className={styles.rowBtn} onClick={() => navigate("/vendor/work-orders")}>Review</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
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
