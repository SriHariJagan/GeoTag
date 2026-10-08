import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import Toast from "../../Components/Toast/Toast";
import { useToast } from "../../Components/Toast/useToast";
import * as api from "../../api/procurement.api";
import { getMyVendorOrgs } from "../../api/vendors.api";
import styles from "../admin/Procurement/Procurement.module.css";

export default function VendorRFQDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const [rfq, setRfq] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [myVendorId, setMyVendorId] = useState(null);
  const [error, setError] = useState("");
  const [lines, setLines] = useState([{ rfq_item_id: "", quantity: "", unit_rate: "" }]);
  const [head, setHead] = useState({ mobilization_cost: "", payment_terms: "", lead_time_days: "" });

  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;

  const reload = async () => {
    try {
      const [r, q, me] = await Promise.all([
        api.getRFQ(id).then((x) => x.data),
        api.listRFQQuotations(id).then((x) => x.data).catch(() => []),
        getMyVendorOrgs().then((x) => x.data).catch(() => ({ vendor_ids: [] })),
      ]);
      setRfq(r);
      setQuotes(q || []);
      setMyVendorId((me.vendor_ids || [])[0] ?? null);
      setError("");
    } catch (err) {
      setError(errMsg(err, "Failed to load RFQ"));
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
          <div className={styles.emptyState}><h3>Cannot open RFQ</h3><p>{error}</p></div>
        </div>
      </div>
    );
  }
  if (!rfq) {
    return (
      <div className={styles.page}>
        <div className={styles.contentCard}>
          <div className={styles.loadingState}><div className={styles.loader}></div><p>Loading…</p></div>
        </div>
      </div>
    );
  }

  const setLine = (i, k, val) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: val } : l)));

  const submit = async (e) => {
    e.preventDefault();
    if (!myVendorId) {
      push("Your vendor organization could not be determined", "error");
      return;
    }
    try {
      await api.submitQuotation({
        rfq_id: Number(id),
        vendor_id: myVendorId,
        mobilization_cost: head.mobilization_cost ? Number(head.mobilization_cost) : 0,
        payment_terms: head.payment_terms || undefined,
        lead_time_days: head.lead_time_days ? Number(head.lead_time_days) : undefined,
        items: lines.map((l) => ({
          rfq_item_id: l.rfq_item_id ? Number(l.rfq_item_id) : undefined,
          description: (rfq.items || []).find((x) => x.id === Number(l.rfq_item_id))?.description,
          quantity: Number(l.quantity) || 0,
          unit_rate: Number(l.unit_rate) || 0,
        })),
      });
      push("Quotation submitted (totals computed server-side)", "success");
      reload();
    } catch (err) {
      push(errMsg(err, "Submit failed"), "error");
    }
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{rfq.rfq_number}</span>
          <h1>{rfq.title}</h1>
          <p>Deadline {rfq.submission_deadline ? new Date(rfq.submission_deadline).toLocaleString() : "none"} · {rfq.currency}</p>
        </div>
        <div className={styles.heroActions}>
          <span className={`${styles.statusBadge} ${styles.stActive}`}>{(rfq.status || "-").toLowerCase()}</span>
          <button className={styles.backBtn} onClick={() => navigate("/vendor/rfqs")}>
            <FiArrowLeft /> RFQs
          </button>
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>Scope & Items</h3><p>{rfq.scope_of_work || rfq.description || "-"}</p></div>
        </div>
        <ul className={styles.listPlain}>
          {(rfq.items || []).map((i) => (
            <li key={i.id}>
              <span className={styles.codeBadge}>#{i.id}</span>
              <strong>{i.description}</strong>
              <span>{i.quantity ?? "-"} {i.unit || ""}</span>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>Commercial terms: {rfq.commercial_terms || "-"}</p>
        <div className={styles.inlineForm}>
          <button className={styles.rowBtn} onClick={async () => { try { await api.markRFQViewed(id, myVendorId); reload(); } catch (err) { push(errMsg(err, "Failed"), "error"); } }}>Mark Viewed</button>
          <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={async () => { try { await api.declineRFQ(id, myVendorId); push("Declined", "success"); reload(); } catch (err) { push(errMsg(err, "Failed"), "error"); } }}>Decline RFQ</button>
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>My Quotations</h3><p>{quotes.length} submission(s) — only yours, never competitors'</p></div>
        </div>
        {quotes.length === 0 ? (
          <p className={styles.hint}>No quotations yet.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead><tr><th>Quotation</th><th>Total</th><th>Lead Time</th><th>Status</th></tr></thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td><span className={styles.codeBadge}>{q.quotation_number}</span></td>
                    <td className={styles.money}>{q.total} {q.currency}</td>
                    <td>{q.lead_time_days != null ? `${q.lead_time_days} days` : "-"}</td>
                    <td><span className={`${styles.statusBadge} ${styles.stWarning}`}>{(q.status || "-").toLowerCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rfq.status === "SENT" && (
        <div className={styles.contentCard}>
          <div className={styles.tableHeader}>
            <div><h3>Submit / Resubmit Quotation</h3><p>Resubmitting supersedes the previous quote (history kept). Totals are computed by the server.</p></div>
          </div>
          <form onSubmit={submit}>
            {lines.map((l, i) => (
              <div key={i} className={styles.inlineForm} style={{ borderTop: "none", paddingTop: 6 }}>
                <select value={l.rfq_item_id} onChange={(e) => setLine(i, "rfq_item_id", e.target.value)} required style={{ flex: 2, minWidth: 200 }}>
                  <option value="">RFQ item…</option>
                  {(rfq.items || []).map((x) => (<option key={x.id} value={x.id}>#{x.id} {x.description}</option>))}
                </select>
                <input placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} required style={{ width: 110 }} />
                <input placeholder="Unit rate" value={l.unit_rate} onChange={(e) => setLine(i, "unit_rate", e.target.value)} required style={{ width: 130 }} />
              </div>
            ))}
            <div className={styles.inlineForm} style={{ borderTop: "none", paddingTop: 6 }}>
              <button type="button" className={styles.rowBtn} onClick={() => setLines((p) => [...p, { rfq_item_id: "", quantity: "", unit_rate: "" }])}>+ Line</button>
            </div>
            <div className={styles.inlineForm}>
              <input placeholder="Mobilization cost" value={head.mobilization_cost} onChange={(e) => setHead((p) => ({ ...p, mobilization_cost: e.target.value }))} style={{ width: 170 }} />
              <input placeholder="Lead time (days)" value={head.lead_time_days} onChange={(e) => setHead((p) => ({ ...p, lead_time_days: e.target.value }))} style={{ width: 150 }} />
              <input placeholder="Payment terms" value={head.payment_terms} onChange={(e) => setHead((p) => ({ ...p, payment_terms: e.target.value }))} style={{ flex: 1, minWidth: 200 }} />
              <button type="submit" className={`${styles.rowBtn} ${styles.rowBtnPrimary}`}>Submit Quotation</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
