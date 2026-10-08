import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiAward, FiSend, FiPlus, FiCheck, FiX,
  FiClock, FiUserCheck, FiFileText,
} from "react-icons/fi";
import { useAuth } from "../../../store/context/AuthContext";
import { can, PERMISSIONS } from "../../../constants/permissions";
import Toast from "../../../Components/Toast/Toast";
import { useToast } from "../../../Components/Toast/useToast";
import * as api from "../../../api/procurement.api";
import VendorInvitePicker from "../../../Components/WorkOrder/VendorInvitePicker";
import styles from "./Procurement.module.css";

const statusClass = (s) => {
  switch ((s || "").toUpperCase()) {
    case "SENT":
    case "EVALUATING":
    case "SUBMITTED":
    case "VIEWED":
      return styles.stActive;
    case "AWARDED":
    case "ACCEPTED":
    case "EVALUATED":
      return styles.stSuccess;
    case "REJECTED":
    case "DECLINED":
    case "CANCELLED":
      return styles.stDanger;
    case "CLOSED":
    case "SUPERSEDED":
      return styles.stNeutral;
    default:
      return styles.stWarning;
  }
};

const badge = (s) => (
  <span className={`${styles.statusBadge} ${statusClass(s)}`}>
    {(s || "-").toLowerCase().replace(/_/g, " ")}
  </span>
);

export default function RFQDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toasts, push, dismiss } = useToast();

  const [rfq, setRfq] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [invites, setInvites] = useState([]);
  const [award, setAward] = useState(null);
  const [linkedWos, setLinkedWos] = useState([]);
  const [error, setError] = useState("");
  const [item, setItem] = useState({ description: "", quantity: "", unit: "" });
  const [scores, setScores] = useState({});
  const [winnerId, setWinnerId] = useState("");
  const [awardReason, setAwardReason] = useState("");
  const [woScope, setWoScope] = useState("");
  // Admin enters the vendor's price on their behalf (vendors never log in).
  const [qVendor, setQVendor] = useState("");
  const [qRates, setQRates] = useState({});
  const [qLead, setQLead] = useState("");
  const [qValid, setQValid] = useState("");

  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;
  const canAdmin = can(user, PERMISSIONS.RFQ_SEND);

  const reload = async () => {
    try {
      const [r, q, v] = await Promise.all([
        api.getRFQ(id).then((x) => x.data),
        api.listRFQQuotations(id).then((x) => x.data).catch(() => []),
        api.listRFQVendors(id).then((x) => x.data).catch(() => []),
      ]);
      setRfq(r);
      setQuotes(q || []);
      setInvites(v || []);
      setError("");
      try {
        setAward(await api.getAward(id).then((x) => x.data));
      } catch {
        setAward(null);
      }
      // Work orders generated from this RFQ (WO carries rfq_id / quotation link).
      try {
        const w = await api
          .listWorkOrders({ project_id: r.project_id, limit: 100 })
          .then((x) => x.data)
          .catch(() => []);
        const qids = new Set((q || []).map((x) => x.id));
        setLinkedWos(
          (w || []).filter((wo) => Number(wo.rfq_id) === Number(id) || qids.has(wo.quotation_id))
        );
      } catch {
        setLinkedWos([]);
      }
    } catch (err) {
      setError(errMsg(err, "Failed to load RFQ"));
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const act = async (fn, ok) => {
    try {
      await fn();
      push(ok, "success");
      reload();
    } catch (err) {
      push(errMsg(err, "Action failed"), "error");
    }
  };

  const sortedQuotes = useMemo(
    () => [...quotes].sort((a, b) => (a.total || 0) - (b.total || 0)),
    [quotes]
  );
  const quotedVendorIds = useMemo(
    () => new Set((quotes || []).map((q) => q.vendor_id)),
    [quotes]
  );

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.contentCard}>
          <div className={styles.emptyState}>
            <h3>Failed to load RFQ</h3>
            <p>{error}</p>
            <button className={styles.rowBtn} onClick={() => navigate("/admin/procurement")}>Back</button>
          </div>
        </div>
      </div>
    );
  }
  if (!rfq) {
    return (
      <div className={styles.page}>
        <div className={styles.contentCard}>
          <div className={styles.loadingState}><div className={styles.loader}></div><p>Loading RFQ...</p></div>
        </div>
      </div>
    );
  }

  const steps = [
    { n: 1, label: "Scope", done: (rfq.items || []).length > 0 },
    { n: 2, label: "Vendors", done: invites.length > 0 },
    { n: 3, label: "Quotes", done: quotes.length > 0 },
    { n: 4, label: "Award", done: !!award },
    { n: 5, label: "Work orders", done: linkedWos.length > 0 },
  ];
  const currentStep = steps.find((s) => !s.done)?.n || 5;

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{rfq.rfq_number}</span>
          <h1>{rfq.title}</h1>
          <p>Project #{rfq.project_id} · {rfq.currency} · Deadline {rfq.submission_deadline ? new Date(rfq.submission_deadline).toLocaleString() : "none"}</p>
        </div>
        <div className={styles.heroActions}>
          {badge(rfq.status)}
          <button className={styles.backBtn} onClick={() => navigate("/admin/procurement")}>
            <FiArrowLeft /> RFQs
          </button>
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>Where is this RFQ?</h3><p>Follow the steps in order — each unlocks the next</p></div>
        </div>
        <ol className={styles.stepper}>
          {steps.map((s) => (
            <li key={s.n} data-state={s.done ? "done" : s.n === currentStep ? "now" : "todo"}>
              <span className={styles.stepNum}>{s.done ? <FiCheck /> : s.n}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* STEP 1 — scope */}
      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>1 · What do you need?</h3><p>{rfq.scope_of_work || rfq.description || "Add a scope and line items so vendors can quote"}</p></div>
        </div>
        <ul className={styles.listPlain}>
          {(rfq.items || []).map((i) => (
            <li key={i.id}>
              <span className={styles.codeBadge}>#{i.id}</span>
              <strong>{i.description}</strong>
              <span>{i.quantity ?? "-"} {i.unit || ""}</span>
              {i.technical_specification && <span>{i.technical_specification}</span>}
            </li>
          ))}
          {(rfq.items || []).length === 0 && <li>No line items yet — add the first one below.</li>}
        </ul>
        {canAdmin && rfq.status === "DRAFT" && (
          <form
            className={styles.inlineForm}
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () => api.addRFQItem(id, { ...item, quantity: item.quantity ? Number(item.quantity) : undefined })
                  .then(() => setItem({ description: "", quantity: "", unit: "" })),
                "Line item added"
              );
            }}
          >
            <input placeholder="Description *" value={item.description} onChange={(e) => setItem((p) => ({ ...p, description: e.target.value }))} required style={{ flex: 2, minWidth: 200 }} />
            <input placeholder="Qty" value={item.quantity} onChange={(e) => setItem((p) => ({ ...p, quantity: e.target.value }))} style={{ width: 100 }} />
            <input placeholder="Unit" value={item.unit} onChange={(e) => setItem((p) => ({ ...p, unit: e.target.value }))} style={{ width: 100 }} />
            <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} type="submit"><FiPlus /> Add Item</button>
          </form>
        )}
      </div>

      {/* STEP 2 — vendors */}
      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>2 · Who is invited?</h3><p>{invites.length} invitation(s) — search and tick vendors, then send</p></div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>Vendor</th><th>Status</th><th>Quoted?</th><th>Sent At</th>{canAdmin && <th>Record response</th>}</tr></thead>
            <tbody>
              {invites.length === 0 && <tr><td colSpan={canAdmin ? "5" : "4"}>No invitations sent yet.</td></tr>}
              {invites.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.vendor_name || `#${v.vendor_id}`}</strong></td>
                  <td>{badge(v.status)}</td>
                  <td>{quotedVendorIds.has(v.vendor_id) ? <FiCheck color="green" /> : "—"}</td>
                  <td>{v.sent_at ? new Date(v.sent_at).toLocaleString() : "-"}</td>
                  {canAdmin && (
                    <td>
                      <span className={styles.rowActions}>
                        {v.status === "SENT" && (
                          <button className={styles.rowBtn} onClick={() => act(() => api.markRFQViewed(id, v.vendor_id), "Marked as viewed")}>Viewed</button>
                        )}
                        {!["DECLINED", "QUOTATION_SUBMITTED"].includes(v.status) && (
                          <button className={styles.rowBtn} onClick={() => act(() => api.declineRFQ(id, v.vendor_id), "Marked as declined")}>Declined</button>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canAdmin && ["DRAFT", "SENT"].includes(rfq.status) && (
          <div className={styles.inlineForm}>
            <VendorInvitePicker
              excludeIds={invites.map((v) => v.vendor_id).filter(Boolean)}
              onSend={(ids) => act(() => api.sendRFQ(id, ids), "Invitation(s) sent")}
            />
          </div>
        )}
      </div>

      {/* STEP 2b — admin enters the price the vendor quoted offline */}
      {canAdmin && rfq.status === "SENT" && (
        <div className={styles.contentCard}>
          <div className={styles.tableHeader}>
            <div><h3>Enter vendor price</h3><p>Vendors don&apos;t log in — record the rate they gave you by phone / email here</p></div>
          </div>
          <form
            className={styles.priceForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (!qVendor) { push("Select the vendor first", "error"); return; }
              const items = (rfq.items || []).map((it) => ({
                rfq_item_id: it.id,
                quantity: Number(qRates[it.id]?.qty ?? it.quantity ?? 1),
                unit_rate: Number(qRates[it.id]?.rate ?? 0),
              }));
              if (items.length === 0) { push("Add line items in step 1 first", "error"); return; }
              if (!items.some((it) => it.unit_rate > 0)) { push("Enter at least one rate", "error"); return; }
              act(() => api.submitQuotation({
                rfq_id: Number(id),
                vendor_id: Number(qVendor),
                items,
                lead_time_days: qLead ? Number(qLead) : undefined,
                valid_until: qValid || undefined,
              }).then(() => {
                setQVendor(""); setQRates({}); setQLead(""); setQValid("");
              }), "Vendor price recorded");
            }}
          >
            <label className={styles.priceField}>
              <span>Vendor *</span>
              <select value={qVendor} onChange={(e) => setQVendor(e.target.value)} required>
                <option value="">Select vendor…</option>
                {invites
                  .filter((v) => !["DECLINED"].includes(v.status))
                  .map((v) => (
                    <option key={v.vendor_id} value={v.vendor_id}>
                      {v.vendor_name || `Vendor #${v.vendor_id}`} · {String(v.status || "").toLowerCase()}
                    </option>
                  ))}
              </select>
            </label>
            {(rfq.items || []).map((it) => (
              <div key={it.id} className={styles.priceRow}>
                <div className={styles.priceRowMain}>
                  <strong>{it.description}</strong>
                  <span>{it.quantity ?? "-"} {it.unit || ""}</span>
                </div>
                <label>
                  <span>Qty</span>
                  <input
                    type="number" min="0" step="any"
                    value={qRates[it.id]?.qty ?? it.quantity ?? ""}
                    onChange={(e) => setQRates((p) => ({ ...p, [it.id]: { ...p[it.id], qty: e.target.value } }))}
                  />
                </label>
                <label>
                  <span>Rate (₹) *</span>
                  <input
                    type="number" min="0" step="any"
                    placeholder="0"
                    value={qRates[it.id]?.rate ?? ""}
                    onChange={(e) => setQRates((p) => ({ ...p, [it.id]: { ...p[it.id], rate: e.target.value } }))}
                  />
                </label>
                <span className={styles.priceLine}>
                  ₹{((Number(qRates[it.id]?.qty ?? it.quantity ?? 0)) * (Number(qRates[it.id]?.rate ?? 0))).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
            {(rfq.items || []).length === 0 && (
              <p className={styles.mutedLine}>Add line items in step 1 first — rates are entered per item.</p>
            )}
            <div className={styles.priceMeta}>
              <label>
                <span>Lead time (days)</span>
                <input type="number" min="0" value={qLead} onChange={(e) => setQLead(e.target.value)} placeholder="e.g. 15" />
              </label>
              <label>
                <span>Valid until</span>
                <input type="date" value={qValid} onChange={(e) => setQValid(e.target.value)} />
              </label>
              <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} type="submit">Save vendor price</button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3 — quotations */}
      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>3 · Compare quotations</h3><p>Cheapest first · score each quote, then pick one winner below</p></div>
        </div>
        {sortedQuotes.length === 0 && (
          <div className={styles.emptyState}><FiFileText /><h3>No quotations yet</h3><p>Vendors submit quotes from their portal after you invite them.</p></div>
        )}
        <div className={styles.quoteGrid}>
          {sortedQuotes.map((q, idx) => {
            const s = scores[q.id] || {};
            const isWinner = award && award.quotation_id === q.id;
            const isPicked = String(winnerId) === String(q.id);
            // Only quotes the vendor actually sent can be scored or awarded.
            const isSentQuote = ["SUBMITTED", "EVALUATED"].includes(q.status);
            return (
              <div key={q.id} className={styles.quoteCard} data-winner={isWinner ? "1" : undefined} data-picked={isPicked ? "1" : undefined}>
                <div className={styles.quoteTop}>
                  <div>
                    <strong>{q.vendor_name}</strong>
                    <span className={styles.codeBadge}>{q.quotation_number}</span>
                    {idx === 0 && sortedQuotes.length > 1 && <span className={styles.cheapTag}>cheapest</span>}
                  </div>
                  {badge(q.status)}
                </div>
                <div className={styles.quoteNums}>
                  <div><span>Total</span><b>{q.total} {q.currency}</b></div>
                  <div><span>Lead time</span><b>{q.lead_time_days != null ? `${q.lead_time_days} days` : "-"}</b></div>
                  <div><span>Valid until</span><b>{q.valid_until || "-"}</b></div>
                  <div><span>Score</span><b>{q.evaluation?.overall_score ?? "-"}</b></div>
                </div>
                {canAdmin && !award && isSentQuote && (
                  <div className={styles.quoteActions}>
                    <input
                      placeholder="Tech 0–100"
                      value={s.tech || ""}
                      onChange={(e) => setScores((p) => ({ ...p, [q.id]: { ...p[q.id], tech: e.target.value } }))}
                    />
                    <input
                      placeholder="Comm 0–100"
                      value={s.comm || ""}
                      onChange={(e) => setScores((p) => ({ ...p, [q.id]: { ...p[q.id], comm: e.target.value } }))}
                    />
                    <button
                      className={styles.rowBtn}
                      onClick={() => act(() => api.evaluateQuotation(q.id, {
                        technical_score: Number(s.tech), commercial_score: Number(s.comm),
                      }), "Quotation evaluated")}
                    >
                      Score
                    </button>
                    <button
                      className={`${styles.rowBtn} ${isPicked ? styles.rowBtnPrimary : ""}`}
                      onClick={() => setWinnerId(String(q.id))}
                    >
                      {isPicked ? <><FiCheck /> Picked</> : "Pick winner"}
                    </button>
                  </div>
                )}
                {canAdmin && !award && !isSentQuote && !isWinner && (
                  <span className={styles.quoteNote}>Not submitted by vendor yet — can&apos;t be scored or awarded.</span>
                )}
                {isWinner && <div className={styles.winnerNote}><FiAward /> Awarded — see step 4</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 4 — award */}
      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>4 · Award to one vendor</h3><p>{award ? `Awarded to ${award.vendor_name} — this is final` : "Pick the winning quote above, give a reason, confirm"}</p></div>
          {award && <span className={`${styles.statusBadge} ${styles.stSuccess}`}><FiAward /> awarded</span>}
        </div>
        {award ? (
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}><span>Vendor</span><strong>{award.vendor_name}</strong></div>
            <div className={styles.detailItem}><span>Reason</span><strong>{award.award_reason || "-"}</strong></div>
            <div className={styles.detailItem}><span>Lowest compliant</span><strong>{award.lowest_compliant || "-"}</strong></div>
          </div>
        ) : (
          canAdmin && (
            <form
              className={styles.inlineForm}
              onSubmit={(e) => {
                e.preventDefault();
                if (!winnerId) { push("Pick the winning quote in step 3 first", "error"); return; }
                const picked = quotes.find((q) => String(q.id) === String(winnerId));
                if (!picked || !["SUBMITTED", "EVALUATED"].includes(picked.status)) {
                  push("Only a vendor-submitted quote can be awarded", "error");
                  return;
                }
                act(() => api.awardQuotation(id, {
                  quotation_id: Number(winnerId),
                  award_reason: awardReason,
                  lowest_compliant: "UNKNOWN",
                }).then(() => { setWinnerId(""); setAwardReason(""); }), "Vendor awarded — losers marked not accepted");
              }}
            >
              <input value={winnerId ? `Winner: ${quotes.find((q) => String(q.id) === String(winnerId))?.quotation_number || ""}` : ""} readOnly placeholder="No winner picked yet — use “Pick winner” above" style={{ flex: 1, minWidth: 220 }} />
              <input placeholder="Why this vendor? *" value={awardReason} onChange={(e) => setAwardReason(e.target.value)} required style={{ flex: 2, minWidth: 220 }} />
              <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} type="submit"><FiAward /> Confirm award</button>
            </form>
          )
        )}
      </div>

      {/* STEP 5 — work orders + full history */}
      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>5 · Work orders from this RFQ</h3><p>{linkedWos.length} work order(s) — who got it, who accepted, why others didn&apos;t</p></div>
        </div>
        {award && canAdmin && (
          <form
            className={styles.inlineForm}
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () => api.createWorkOrder({
                  project_id: rfq.project_id,
                  vendor_id: award.vendor_id,
                  quotation_id: award.quotation_id,
                  scope_of_work: woScope || rfq.scope_of_work,
                }).then((r) => navigate(`/admin/work-orders/${r.data.id}`)),
                "Work order created"
              );
            }}
          >
            <input placeholder="Scope (defaults to RFQ scope)" value={woScope} onChange={(e) => setWoScope(e.target.value)} style={{ flex: 2, minWidth: 220 }} />
            <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} type="submit">Generate Work Order for {award.vendor_name}</button>
          </form>
        )}
        {linkedWos.length === 0 && <p className={styles.mutedLine}>No work orders generated yet — award first, then generate one above.</p>}
        {linkedWos.map((wo) => (
          <div key={wo.id} className={styles.woBlock}>
            <div className={styles.woHead}>
              <div>
                <strong>{wo.work_order_number || `WO #${wo.id}`}</strong>
                <span>{wo.vendor_name || `Vendor #${wo.vendor_id}`} · {wo.grand_total ?? wo.contract_value ?? "-"} {wo.currency || ""}</span>
              </div>
              {badge(wo.status)}
              <button className={styles.rowBtn} onClick={() => navigate(`/admin/work-orders/${wo.id}`)}>Open</button>
            </div>
            <div className={styles.woHistory}>
              {(wo.vendor_invites || []).map((v) => (
                <span key={v.id} className={styles.histChip} data-tone={v.accepted_at ? "yes" : v.rejected_at ? "no" : "wait"}>
                  <FiUserCheck /> {v.vendor_name || `Vendor #${v.vendor_id}`} ·{" "}
                  {v.accepted_at ? `accepted ${new Date(v.accepted_at).toLocaleDateString()}` : v.rejected_at ? `declined${v.rejection_reason ? `: ${v.rejection_reason}` : ""}` : v.viewed_at ? "viewed, no reply yet" : "sent, not viewed"}
                </span>
              ))}
              {(wo.vendor_invites || []).length === 0 && (
                <span className={styles.mutedLine}>Direct work order to {wo.vendor_name || "vendor"} — no invite history.</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
