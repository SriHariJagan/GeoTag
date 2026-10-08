import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiSearch } from "react-icons/fi";
import Toast from "../../Components/Toast/Toast";
import { useToast } from "../../Components/Toast/useToast";
import * as api from "../../api/procurement.api";
import { getMyVendorOrgs } from "../../api/vendors.api";
import styles from "../admin/Procurement/Procurement.module.css";

export default function VendorWorkOrders() {
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const [wos, setWos] = useState([]);
  const [myVendorId, setMyVendorId] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState({});

  const reload = async () => {
    try {
      const [res, me] = await Promise.all([
        api.listWorkOrders(),
        getMyVendorOrgs().then((x) => x.data).catch(() => ({ vendor_ids: [] })),
      ]);
      setWos(res.data || []);
      setMyVendorId((me.vendor_ids || [])[0] ?? null);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load work orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const act = async (fn, ok) => {
    try {
      await fn();
      push(ok, "success");
      reload();
    } catch (err) {
      push(err?.response?.data?.detail || "Action failed", "error");
    }
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Vendor Portal</span>
          <h1>My Work Orders</h1>
          <p>Review, accept or reject. Acceptance is what activates the project assignment.</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            placeholder="Search WO number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>Order List</h3><p>Showing {wos.filter((w) => {
            const q = search.trim().toLowerCase();
            return !q || w.work_order_number?.toLowerCase().includes(q);
          }).length} of {wos.length} work order(s)</p></div>
        </div>
        {loading ? (
          <div className={styles.loadingState}><div className={styles.loader}></div><p>Loading…</p></div>
        ) : error ? (
          <div className={styles.emptyState}><h3>Failed to load</h3><p>{error}</p></div>
        ) : wos.length === 0 ? (
          <div className={styles.emptyState}><h3>No work orders</h3><p>Nothing issued to your organization yet.</p></div>
        ) : (
          wos
            .filter((w) => {
              const q = search.trim().toLowerCase();
              return !q || w.work_order_number?.toLowerCase().includes(q);
            })
            .map((w) => (
            <div key={w.id}>
              <div className={styles.tableHeader}>
                <div>
                  <h3>
                    <button className={styles.rowBtn} onClick={() => navigate(`/vendor/work-orders/${w.id}`)}>
                      {w.work_order_number}
                    </button>{" "}
                    <span className={`${styles.statusBadge} ${styles.stWarning}`}>{(w.status || "").toLowerCase().replace(/_/g, " ")}</span>
                  </h3>
                  <p>{w.scope_of_work || "-"} · {(w.grand_total ?? w.contract_value) || 0} {w.currency} · Project #{w.project_id}{w.pdf_path ? " · PDF available" : ""}</p>
                </div>
                {["ISSUED", "VIEWED"].includes(w.status) && (
                  <div className={styles.actionGroup}>
                    <button className={styles.rowBtn} onClick={() => navigate(`/vendor/work-orders/${w.id}`)}>Open details / PDF</button>
                    <button
                      className={`${styles.rowBtn} ${styles.rowBtnPrimary}`}
                      onClick={() => {
                        if (myVendorId == null) { push("Vendor organization unknown", "error"); return; }
                        act(
                          () => api.respondWorkOrder(w.id, myVendorId, true).catch(() => api.acceptWorkOrder(w.id)),
                          "Accepted — project assignment active"
                        );
                      }}
                    >
                      Accept
                    </button>
                  </div>
                )}
              </div>
              <ul className={styles.listPlain}>
                {(w.items || []).map((i) => (
                  <li key={i.id}><strong>{i.description}</strong><span>{i.quantity ?? "-"} {i.unit || ""}</span></li>
                ))}
              </ul>
              {["ISSUED", "VIEWED"].includes(w.status) && (
                <div className={styles.inlineForm}>
                  <input
                    placeholder="Rejection reason (required)"
                    value={reason[w.id] || ""}
                    onChange={(e) => setReason({ ...reason, [w.id]: e.target.value })}
                  />
                  <button
                    className={`${styles.rowBtn} ${styles.rowBtnDanger}`}
                    onClick={() => {
                      if (myVendorId == null) { push("Vendor organization unknown", "error"); return; }
                      if (!(reason[w.id] || "").trim()) { push("Rejection reason is required", "error"); return; }
                      act(() => api.respondWorkOrder(w.id, myVendorId, false, reason[w.id].trim()), "Rejected with reason recorded");
                    }}
                  >
                    Reject with reason
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
