import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import Toast from "../../Components/Toast/Toast";
import { useToast } from "../../Components/Toast/useToast";
import * as api from "../../api/procurement.api";
import { getMyVendorOrgs } from "../../api/vendors.api";
import styles from "../admin/Procurement/Procurement.module.css";

export default function VendorWorkOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const [wo, setWo] = useState(null);
  const [invites, setInvites] = useState([]);
  const [myVendorId, setMyVendorId] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const base = import.meta.env.VITE_API_URL;
  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;

  const reload = async () => {
    try {
      const [w, me] = await Promise.all([
        api.getWorkOrder(id).then((x) => x.data),
        getMyVendorOrgs().then((x) => x.data).catch(() => ({ vendor_ids: [] })),
      ]);
      setWo(w);
      setMyVendorId((me.vendor_ids || [])[0] ?? null);
      try {
        const v = await api.listWorkOrderVendors(id).then((x) => x.data);
        setInvites(v || w.vendor_invites || []);
      } catch {
        setInvites(w.vendor_invites || []);
      }
      setError("");
    } catch (err) {
      setError(errMsg(err, "Failed to load work order"));
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.contentCard}>
          <div className={styles.emptyState}><h3>Cannot open work order</h3><p>{error}</p>
            <button className={styles.rowBtn} onClick={() => navigate("/vendor/work-orders")}>Back</button></div>
        </div>
      </div>
    );
  }
  if (!wo) {
    return (
      <div className={styles.page}>
        <div className={styles.contentCard}>
          <div className={styles.loadingState}><div className={styles.loader}></div><p>Loading…</p></div>
        </div>
      </div>
    );
  }

  const myInvite = invites.find((v) => v.vendor_id === myVendorId);
  const myStatus = myInvite?.status || (wo.vendor_id === myVendorId ? wo.status : null);
  const actionable = ["ISSUED", "VIEWED", "SENT"].includes(myStatus || wo.status);

  const respond = async (accept) => {
    if (!myVendorId) {
      push("Your vendor organization could not be determined", "error");
      return;
    }
    if (!accept && !reason.trim()) {
      push("Rejection reason is required", "error");
      return;
    }
    setBusy(true);
    try {
      // Prefer per-vendor endpoint (records timestamps, reason, actor, audit)
      try {
        await api.respondWorkOrder(id, myVendorId, accept, accept ? null : reason.trim());
      } catch (e) {
        // Legacy single-vendor WO fallback
        if (accept) await api.acceptWorkOrder(id);
        else throw e;
      }
      push(accept ? "Accepted — project assignment activates" : "Rejected with reason recorded", "success");
      setReason("");
      reload();
    } catch (err) {
      push(errMsg(err, "Action failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{wo.work_order_number}</span>
          <h1>{wo.project_name || `Project #${wo.project_id}`}</h1>
          <p>{wo.client_name || "-"} · {wo.site || wo.location || "-"} · {(wo.grand_total ?? wo.contract_value) || 0} {wo.currency} · your status: <b>{(myStatus || wo.status || "-").toLowerCase()}</b></p>
        </div>
        <div className={styles.heroActions}>
          <span className={`${styles.statusBadge} ${styles.stActive}`}>{(wo.status || "-").toLowerCase().replace(/_/g, " ")}</span>
          <button className={styles.backBtn} onClick={() => navigate("/vendor/work-orders")}>
            <FiArrowLeft /> Orders
          </button>
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}><div><h3>Work Details</h3><p>{wo.work_type || "—"} · {wo.work_order_date || "-"} · {wo.start_date || "?"} → {wo.end_date || "?"}</p></div></div>
        <p className={styles.hint}>Scope: {wo.scope_of_work || "-"}</p>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}><span>Vendor ID</span><strong>{myVendorId ?? "-"}</strong></div>
          <div className={styles.detailItem}><span>Payment</span><strong>{wo.payment_terms || "-"}</strong></div>
          <div className={styles.detailItem}><span>Validity / Completion</span><strong>{wo.validity_days ? `${wo.validity_days}d` : "-"} / {wo.completion_period || "-"}</strong></div>
          <div className={styles.detailItem}><span>Retention / Taxes</span><strong>{wo.retention_percent ?? "-"} / {wo.tax_terms || "-"}</strong></div>
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}><div><h3>BOQ</h3><p>Grand {(wo.grand_total ?? 0).toFixed?.(2) ?? wo.grand_total} {wo.currency}</p></div></div>
        <ul className={styles.listPlain}>
          {(wo.items || []).map((i) => (
            <li key={i.id}><strong>{i.item_number ? `${i.item_number}. ` : ""}{i.description}</strong><span>{i.quantity ?? "-"} {i.unit || ""}</span>{i.unit_rate != null && <span className={styles.money}>@ {i.unit_rate}</span>}{i.line_total != null && <span className={styles.money}>= {i.line_total}</span>}</li>
          ))}
        </ul>
        {(wo.standard_terms || "").trim() && <p className={styles.hint}>Standard terms: {wo.standard_terms}</p>}
        {(wo.custom_terms || "").trim() && <p className={styles.hint}>Additional terms: {wo.custom_terms}</p>}
        {wo.pdf_path && (
          <div className={styles.inlineForm}>
            <button
              className={styles.rowBtn}
              onClick={async () => {
                try {
                  await api.openAuthedFile(`/work-orders/${wo.id}/pdf/preview`);
                } catch (e) {
                  setError(e?.response?.data?.detail || "Preview failed");
                }
              }}
            >
              Preview PDF
            </button>
            <button
              className={styles.rowBtn}
              onClick={async () => {
                try {
                  await api.downloadAuthedFile(
                    `/work-orders/${wo.id}/pdf/download`,
                    `${wo.work_order_number}.pdf`
                  );
                } catch (e) {
                  setError(e?.response?.data?.detail || "Download failed");
                }
              }}
            >
              Download PDF
            </button>
          </div>
        )}
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}><div><h3>Accept / Reject</h3><p>Acceptance activates your project assignment; rejection needs a reason. Both are audited with timestamp and actor.</p></div></div>
        {myInvite?.accepted_at && <p className={styles.hint}>Accepted at {new Date(myInvite.accepted_at).toLocaleString()}</p>}
        {myInvite?.rejected_at && <p className={styles.hint}>Rejected at {new Date(myInvite.rejected_at).toLocaleString()} — {myInvite.rejection_reason}</p>}
        {wo.accepted_at && !myInvite && <p className={styles.hint}>Accepted at {new Date(wo.accepted_at).toLocaleString()}</p>}
        {wo.rejected_at && !myInvite && <p className={styles.hint}>Rejected — {wo.rejection_reason}</p>}
        {actionable ? (
          <div className={styles.inlineForm}>
            <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => respond(true)}>Accept</button>
            <input placeholder="Rejection reason (required to reject)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} disabled={busy} onClick={() => respond(false)}>Reject</button>
          </div>
        ) : (
          <p className={styles.hint}>No action available in status {(myStatus || wo.status || "-").toLowerCase()}.</p>
        )}
        <p className={styles.hint}>You see only your own records — competitor data is never exposed.</p>
      </div>
    </div>
  );
}
