import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiCopy, FiDownload, FiEdit2, FiExternalLink,
  FiFileText, FiPaperclip, FiUploadCloud, FiX,
} from "react-icons/fi";
import { useAuth } from "../../../store/context/AuthContext";
import { can, PERMISSIONS } from "../../../constants/permissions";
import { ROLES } from "../../../constants/roles";
import Toast from "../../../Components/Toast/Toast";
import { useToast } from "../../../Components/Toast/useToast";
import * as api from "../../../api/procurement.api";
import { getCompanySettings } from "../../../api/company.api";
import WoPreview from "../../../Components/WorkOrder/WoPreview";
import { buildWoView } from "../../../Components/WorkOrder/woView";
import VendorInvitePicker from "../../../Components/WorkOrder/VendorInvitePicker";
import studio from "../../../Components/WorkOrder/Studio.module.css";
import styles from "./Procurement.module.css";

const SECTIONS = [
  { sec: "project", n: 1, label: "Project Particulars", short: "Project" },
  { sec: "info", n: 2, label: "Work Order Number & Date", short: "Number" },
  { sec: "vendor", n: 3, label: "Vendor / Contractor", short: "Vendor" },
  { sec: "subject", n: 4, label: "Subject & Reference", short: "Subject" },
  { sec: "scope", n: 5, label: "Scope of Work", short: "Scope" },
  { sec: "boq", n: 6, label: "Work Items & Pricing", short: "Items" },
  { sec: "pay", n: 7, label: "Payment Terms", short: "Payment" },
  { sec: "terms", n: 8, label: "Terms & Conditions", short: "Terms" },
  { sec: "signoff", n: 9, label: "Acceptance & Sign-off", short: "Sign-off" },
];

// Draft-stage records can be edited in place; anything beyond that is amended
// through an immutable new version (same number, next version).
const DRAFT_STAGE = new Set(["DRAFT", "IN_REVIEW", "PDF_GENERATED"]);
const TERMINAL = new Set(["CLOSED", "REJECTED", "CANCELLED"]);
const CANCELLABLE = new Set([
  "DRAFT", "IN_REVIEW", "PDF_GENERATED", "SIGNED", "STAMPED", "FINALIZED",
  "ISSUED", "VIEWED", "ACCEPTED", "IN_PROGRESS",
]);

export default function WorkOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toasts, push, dismiss } = useToast();

  const [wo, setWo] = useState(null);
  const [company, setCompany] = useState({});
  const [invites, setInvites] = useState([]);
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sig, setSig] = useState("");
  const [stamp, setStamp] = useState("");
  const [upFile, setUpFile] = useState(null);
  const [upType, setUpType] = useState("SIGNED");
  const [verified, setVerified] = useState({});
  const [tab, setTab] = useState("project");
  const [pdfOpen, setPdfOpen] = useState(false);
  const pdfRef = useRef(null);
  const prevPaneRef = useRef(null);

  const canIssue = can(user, PERMISSIONS.WORK_ORDER_ISSUE);
  const canSign = can(user, PERMISSIONS.WORK_ORDER_SIGN);
  const isAdmin = canIssue;
  // Supervisors open this page read-only from their own routes.
  const isSupervisor = user?.role === ROLES.SUPERVISOR;
  const projectHome = isSupervisor
    ? `/supervisor/my-projects/${wo?.project_id}`
    : "/admin/work-orders";

  useEffect(() => {
    const onDown = (e) => {
      if (pdfRef.current && !pdfRef.current.contains(e.target)) setPdfOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const reload = async () => {
    try {
      const [res, cs] = await Promise.all([
        api.getWorkOrder(id),
        getCompanySettings().catch(() => ({ data: {} })),
      ]);
      setWo(res.data);
      setCompany(cs.data || {});
      setError("");
      try {
        const v = await api.listWorkOrderVendors(id);
        setInvites(v.data || res.data?.vendor_invites || []);
      } catch {
        setInvites(res.data?.vendor_invites || []);
      }
      try {
        const vs = await api.listWorkOrderVersions(id);
        setVersions(vs.data || []);
      } catch {
        setVersions([]);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load work order");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const view = useMemo(() => buildWoView(wo || {}, company), [wo, company]);
  const locked = wo?.is_locked === 1 || ["SIGNED", "STAMPED", "FINALIZED"].includes(wo?.status);
  const money = (v) => (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      push(ok, "success");
      await reload();
    } catch (err) {
      push(err?.response?.data?.detail || "Action failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const verifyDoc = async (docId) => {
    try {
      const r = await api.verifyWoDocument(docId);
      setVerified((p) => ({ ...p, [docId]: r.data.verified }));
      push(r.data.verified ? "Document integrity verified (SHA-256)" : "Hash mismatch!",
        r.data.verified ? "success" : "error");
    } catch (err) {
      push(err?.response?.data?.detail || "Verify failed", "error");
    }
  };

  const uploadSigned = async () => {
    if (!upFile) return;
    setBusy(true);
    try {
      await api.uploadWoDocument(id, upFile, upType);
      push("Signed document stored permanently (original preserved)", "success");
      setUpFile(null);
      reload();
    } catch (err) {
      push(err?.response?.data?.detail || "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // Amend = edit the live draft, or clone an immutable next version once the
  // document has left the draft stage (signed/issued records are never edited).
  const amend = async () => {
    if (DRAFT_STAGE.has(wo?.status)) {
      navigate(`/admin/work-orders/create?draft=${wo.id}`);
      return;
    }
    setBusy(true);
    try {
      const res = await api.cloneWoVersion(id);
      push(`Amendment draft v${res.data.version} created`, "success");
      navigate(`/admin/work-orders/create?draft=${res.data.id}`);
    } catch (err) {
      push(err?.response?.data?.detail || "Amendment failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // Reuse this work order as a template for the SAME project with a fresh
  // auto-generated number, so the same vendor can be engaged again with
  // different requirements without overwriting history.
  const assignAgain = async () => {
    setBusy(true);
    try {
      const res = await api.duplicateWo(id, wo.project_id);
      push(`New work order ${res.data.work_order_number} created for this project`, "success");
      navigate(`/admin/work-orders/create?draft=${res.data.id}`);
    } catch (err) {
      push(err?.response?.data?.detail || "Could not create a new work order", "error");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.contentCard}>
          <div className={styles.emptyState}>
            <h3>Failed to load work order</h3>
            <p>{error}</p>
            <button className={styles.rowBtn} onClick={() => navigate(projectHome)}>Back</button>
          </div>
        </div>
      </div>
    );
  }
  if (!wo) {
    return (
      <div className={styles.page}>
        <div className={styles.contentCard}>
          <div className={styles.loadingState}><div className={styles.loader}></div><p>Loading work order…</p></div>
        </div>
      </div>
    );
  }

  const R = ({ label, value, sub }) =>
    value ? (
      <div className={studio.dReadRow}>
        <span>{label}</span>
        <strong>{value}</strong>
        {sub && <em>{sub}</em>}
      </div>
    ) : null;

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      {/* ---------------- command bar ---------------- */}
      <header className={studio.bar}>
        <button className={studio.iconBtn} onClick={() => navigate(projectHome)} title={isSupervisor ? "Back to project" : "Back to work orders"} aria-label="Back">
          <FiArrowLeft />
        </button>

        <div className={studio.titleBox}>
          <div className={studio.titleRow}>
            <h1>{wo.work_order_number || "Work order"}</h1>
            <span className={studio.verChip}>v{wo.version || 1}</span>
            <span className={studio.statusChip} data-status={wo.status}>{wo.status || "DRAFT"}</span>
            {locked && <span className={studio.statusChip} data-status="LOCKED">Locked</span>}
          </div>
          <span className={studio.saveState} data-state="saved">
            <i className={studio.dotState} />
            {view.vendor.company || view.project.name || "—"} · {money(wo.grand_total)} {wo.currency}
            <button
              type="button"
              className={studio.linkBtn}
              onClick={() => navigate(isSupervisor ? `/supervisor/my-projects/${wo.project_id}` : `/admin/projects/${wo.project_id}`)}
            >
              Open project
            </button>
          </span>
        </div>

        <div className={studio.barActions}>
          {isAdmin && !TERMINAL.has(wo.status) && (
            <button className={studio.btnAccent} onClick={amend} disabled={busy} title="Amend this draft, or create a new version once issued">
              <FiEdit2 /> Amendment
            </button>
          )}
          {isAdmin && (
            <button
              className={studio.btn}
              onClick={assignAgain}
              disabled={busy}
              title="Save a draft copy of this work order for the same project with a fresh number"
            >
              <FiCopy /> Assign again
            </button>
          )}

          <div className={studio.menuWrap} ref={pdfRef}>
            <button className={studio.btn} onClick={() => setPdfOpen(!pdfOpen)} aria-expanded={pdfOpen}>
              PDF
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
            </button>
            {pdfOpen && (
              <div className={studio.menu}>
                <button type="button" disabled={busy} onClick={() => { setPdfOpen(false); act(() => api.generateWorkOrderPdf(id), "PDF generated"); }}>
                  <FiFileText /> Generate PDF
                </button>
                {wo.pdf_path && (
                  <>
                    <button type="button" onClick={() => act(
                      () => api.openAuthedFile(`/work-orders/${id}/pdf/preview`), "PDF opened"
                    )}><FiExternalLink /> Preview PDF</button>
                    <button type="button" onClick={() => act(
                      () => api.downloadAuthedFile(`/work-orders/${id}/pdf/download`, "work-order.pdf"), "PDF downloaded"
                    )}><FiDownload /> Download PDF</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {locked && <div className={studio.lockBar}>Locked — this version is preserved as issued. Use “Amendment” to create the next version.</div>}

      {/* ---------------- split workspace ---------------- */}
      <div className={studio.split}>
        {/* LEFT — read-only sections, same order as the document */}
        <div className={`${studio.pane} ${studio.editPane}`}>
          <nav className={studio.tabs} aria-label="Work order sections">
            {SECTIONS.map((s) => (
              <button
                key={s.sec}
                type="button"
                className={`${studio.tab} ${tab === s.sec ? studio.tabOn : ""}`}
                onClick={() => setTab(s.sec)}
                title={s.label}
              >
                <span className={`${studio.tabNum} ${studio.tabNumOk}`}>{s.n}</span>
                <span className={studio.tabLabel}>{s.short}</span>
              </button>
            ))}
          </nav>

          <section className={studio.edSec} data-section={tab}>
            <div className={studio.edHeadStatic}>
              <div className={studio.edHeadText}>
                <span className={studio.edTitle}>
                  {SECTIONS.find((s) => s.sec === tab)?.label}
                </span>
                <span className={studio.edHint}>Read-only record</span>
              </div>
              <span className={studio.edOk}>As issued</span>
            </div>

            <div className={studio.edBody}>
              {tab === "info" && (
                <>
                  <R label="Number" value={wo.work_order_number} />
                  <R label="Date" value={wo.work_order_date} />
                  <R label="Work type" value={wo.work_type} />
                  <R label="Version" value={`v${wo.version || 1}${wo.is_locked === 1 ? " · locked" : ""}`} />
                  <R label="Currency" value={wo.currency} />
                  <R label="Status" value={wo.status} />
                  <R label="Issued" value={wo.issued_at ? new Date(wo.issued_at).toLocaleString() : ""} />
                  <R label="Accepted" value={wo.accepted_at ? new Date(wo.accepted_at).toLocaleString() : ""} />
                </>
              )}

              {tab === "project" && (
                <>
                  <R label="Project" value={view.project.name || wo.project_name} sub={view.project.project_code} />
                  <R label="Client" value={view.project.client_name || wo.client_name} />
                  <R label="Location" value={wo.location} />
                  <R label="Site" value={wo.site} />
                  <R label="Period" value={`${wo.start_date || "?"} → ${wo.end_date || "?"}`} />
                  <R label="RFQ / Quotation" value={wo.rfq_id ? `RFQ #${wo.rfq_id}` : "Direct work order"} />
                </>
              )}

              {tab === "vendor" && (
                <>
                  <R label="Vendor" value={view.vendor.company} sub={view.vendor.vendor_code} />
                  <R label="Address" value={[view.vendor.address, view.vendor.city, view.vendor.state, view.vendor.pin].filter(Boolean).join(", ")} />
                  <R label="Contact" value={[view.vendor.contact_person, view.vendor.mobile, view.vendor.email].filter(Boolean).join(" · ")} />
                  <R label="GSTIN" value={view.vendor.gstin} />
                  <R label="PAN" value={view.vendor.pan} />
                  <div className={studio.group}>
                    <div className={studio.groupHead}>
                      <span>Vendor responses</span>
                      <em>{invites.length} invited</em>
                    </div>
                    <div className={studio.groupBody}>
                      {invites.length === 0 && <span className={studio.chipEmpty}>No vendor invited yet</span>}
                      {invites.map((v) => (
                        <span key={v.id} className={studio.chip}>
                          {v.vendor_name || `Vendor #${v.vendor_id}`} · {(v.status || "").toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isAdmin && invites.length > 0 && (
                    <VendorResponseRecorder
                      invites={invites}
                      busy={busy}
                      onViewed={(vid) => act(() => api.markWorkOrderViewedByVendor(id, vid), "Marked as viewed")}
                      onAccept={(vid) => act(() => api.respondWorkOrder(id, vid, true), "Acceptance recorded")}
                      onReject={(vid, reason) => act(() => api.respondWorkOrder(id, vid, false, reason), "Rejection recorded")}
                    />
                  )}
                </>
              )}

              {tab === "subject" && (
                <>
                  <R label="Subject" value={wo.subject} />
                  <R label="Reference" value={wo.reference} />
                  <div className={studio.group}>
                    <div className={studio.groupHead}><span>Introductory letter</span></div>
                    <div className={studio.groupBody}>
                      <p className={studio.dReadPara}>{wo.intro_text || "—"}</p>
                    </div>
                  </div>
                </>
              )}

              {tab === "scope" && (
                <>
                  <p className={studio.dReadPara}>{wo.scope_of_work || "—"}</p>
                  <R label="Start" value={wo.start_date} />
                  <R label="End" value={wo.end_date} />
                </>
              )}

              {tab === "boq" && (
                <>
                  <div className={studio.boqHead}>
                    <span className={studio.boqHeadTitle}>
                      <b>{(wo.items || []).length}</b> item{(wo.items || []).length === 1 ? "" : "s"}
                      <em>{money(view.totals.subtotal)}</em>
                    </span>
                  </div>
                  {(wo.items || []).map((it) => (
                    <div key={it.id} className={studio.boqCard}>
                      <div className={studio.boqCardTop}>
                        <span className={studio.boqNum}>{it.item_number}</span>
                        <span className={studio.boqUnit}>{it.unit || ""}</span>
                      </div>
                      <p className={studio.dReadPara}>{it.description}</p>
                      {it.sub_description && <p className={studio.boqSub}>{it.sub_description}</p>}
                      <div className={studio.boqNums}>
                        <label><span>Qty</span><input readOnly value={it.quantity ?? ""} /></label>
                        <label><span>Rate</span><input readOnly value={money(it.unit_rate)} /></label>
                        <div className={studio.boqAmtBox}>
                          <span>Amount</span>
                          <strong>{money(it.line_total ?? (Number(it.quantity) || 0) * (Number(it.unit_rate) || 0))}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className={studio.totCard}>
                    <div className={studio.totLines}>
                      <div className={studio.totLine}><span>Subtotal</span><b>{money(view.totals.subtotal)}</b></div>
                      {Number(wo.discount) > 0 && <div className={studio.totLine}><span>Less discount</span><b>− {money(wo.discount)}</b></div>}
                      {Number(wo.tax_amount) > 0 && <div className={studio.totLine}><span>Tax / GST</span><b>+ {money(wo.tax_amount)}</b></div>}
                      {Number(wo.other_charges) > 0 && <div className={studio.totLine}><span>Other charges</span><b>+ {money(wo.other_charges)}</b></div>}
                      <div className={studio.totGrand}>
                        <span>Grand total</span>
                        <strong>{money(view.totals.grand)} <i>{wo.currency}</i></strong>
                      </div>
                    </div>
                    <p className={studio.totNote}>Server-computed at issuance and frozen.</p>
                  </div>
                </>
              )}

              {tab === "pay" && (
                <>
                  {(view.payment_terms_list || []).map((t, i) => (
                    <div key={i} className={studio.dReadRow}>
                      <span>{i + 1}</span>
                      <strong>{t}</strong>
                    </div>
                  ))}
                  {(view.payment_terms_list || []).length === 0 && <span className={studio.chipEmpty}>—</span>}
                  <R label="Validity" value={wo.validity_days ? `${wo.validity_days} days` : ""} />
                  <R label="Completion" value={wo.completion_period} />
                  <R label="Retention" value={wo.retention_percent != null ? `${wo.retention_percent}%` : ""} />
                  <R label="Taxes" value={wo.tax_terms} />
                  <R label="Delivery" value={wo.delivery_terms} />
                </>
              )}

              {tab === "terms" && (
                <>
                  {(view.general_terms || []).map((t, i) => (
                    <div key={i} className={studio.dReadRow}>
                      <span>{i + 1}</span>
                      <strong>{t}</strong>
                    </div>
                  ))}
                  {(view.general_terms || []).length === 0 && <span className={studio.chipEmpty}>—</span>}
                  {wo.standard_terms && <R label="Standard" value={wo.standard_terms} />}
                  {wo.custom_terms && <R label="Custom" value={wo.custom_terms} />}
                  {wo.special_conditions && <R label="Special" value={wo.special_conditions} />}
                  {wo.rejection_reason && <R label="Rejection" value={wo.rejection_reason} />}
                </>
              )}

              {tab === "signoff" && (
                <>
                  <div className={studio.group}>
                    <div className={studio.groupHead}><span>Acceptance statement</span></div>
                    <div className={studio.groupBody}>
                      <p className={studio.dReadPara}>{wo.acceptance_text || "—"}</p>
                    </div>
                  </div>
                  <R label="Company signatory" value={wo.signer_name} sub={wo.signer_designation} />
                  <R label="Signed at" value={wo.signed_at ? new Date(wo.signed_at).toLocaleString() : ""} />
                  <R label="Stamp" value={wo.stamp_data || "Not stamped"} />
                  <R label="Vendor signatory" value={wo.vendor_signer_name} sub={wo.vendor_signer_designation} />
                  <R label="Finalized" value={wo.finalized_at ? new Date(wo.finalized_at).toLocaleString() : ""} />
                  <R label="Reviewed" value={wo.reviewed_at ? new Date(wo.reviewed_at).toLocaleString() : ""} />
                </>
              )}
            </div>
          </section>

          <div className={studio.footBar}>
            <div className={studio.footStats}>
              <span><b>{(wo.items || []).length}</b> items</span>
              <span><b>{money(view.totals.subtotal)}</b> subtotal</span>
              <span className={studio.footTotal}><b>{money(view.totals.grand)}</b> {wo.currency}</span>
            </div>
            <span className={studio.footHint}>Read-only · {(wo.status || "").toLowerCase()}</span>
          </div>
        </div>

        {/* RIGHT — the same print-accurate A4 */}
        <div ref={prevPaneRef} className={`${studio.pane} ${studio.prevPane}`}>
          <WoPreview view={view} zoom={0.75} onZoom={() => {}} activeSection={tab} />
        </div>
      </div>

      {/* ---------------- status-driven actions ---------------- */}
      {(isAdmin || canSign) && (
        <div className={styles.contentCard}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Work order actions</h3>
              <p>
                Only the next valid step for <b>{wo.status || "DRAFT"}</b> is shown.
                The document flows draft → review → PDF → sign → stamp → finalize → issue.
              </p>
            </div>
          </div>

          {isAdmin && (
            <>
              {wo.status === "DRAFT" && (
                <div className={styles.inlineForm}>
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.reviewWorkOrder(id), "Sent for admin review")}>
                    Submit for review
                  </button>
                  <button className={styles.rowBtn} disabled={busy} onClick={() => act(() => api.generateWorkOrderPdf(id), "PDF generated")}>
                    <FiFileText /> Generate PDF
                  </button>
                  <button className={styles.rowBtn} disabled={busy} onClick={() => act(() => api.issueWorkOrder(id), "Issued directly")}>
                    Issue directly
                  </button>
                  <span className={styles.workflowNote}>Direct issue skips review, signature and stamp — use it only for legacy/urgent orders.</span>
                </div>
              )}

              {wo.status === "IN_REVIEW" && (
                <div className={styles.inlineForm}>
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.generateWorkOrderPdf(id), "PDF generated")}>
                    <FiFileText /> Generate PDF
                  </button>
                  <span className={styles.workflowNote}>The generated PDF is the copy that gets signed and stamped.</span>
                </div>
              )}

              {wo.status === "PDF_GENERATED" && (
                <div className={styles.inlineForm}>
                  <input
                    placeholder="Signer name (defaults to your email)"
                    value={sig}
                    onChange={(e) => setSig(e.target.value)}
                  />
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.signWorkOrder(id, sig || undefined), "Signed")}>
                    Sign work order
                  </button>
                </div>
              )}

              {wo.status === "SIGNED" && (
                <div className={styles.inlineForm}>
                  <input
                    placeholder="Stamp / seal (defaults to COMPANY SEAL)"
                    value={stamp}
                    onChange={(e) => setStamp(e.target.value)}
                  />
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.stampWorkOrder(id, stamp || undefined), "Stamped")}>
                    Apply stamp
                  </button>
                </div>
              )}

              {wo.status === "STAMPED" && (
                <div className={styles.inlineForm}>
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.finalizeWorkOrder(id), "Finalized & locked")}>
                    Finalize &amp; lock
                  </button>
                  <span className={styles.workflowNote}>Finalizing snapshots the master data and locks this version.</span>
                </div>
              )}

              {wo.status === "FINALIZED" && (
                <div className={styles.inlineForm}>
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.issueWorkOrder(id), "Issued to vendor")}>
                    Issue to vendor
                  </button>
                </div>
              )}

              {(wo.status === "ISSUED" || wo.status === "VIEWED") && (
                <div className={styles.inlineForm}>
                  <span className={styles.workflowNote}>Awaiting the vendor&apos;s response. Record acceptance or decline on the Vendor tab.</span>
                  <button className={styles.rowBtn} onClick={() => setTab("vendor")}>
                    Review vendor response
                  </button>
                </div>
              )}

              {wo.status === "ACCEPTED" && (
                <div className={styles.inlineForm}>
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.progressWorkOrder(id), "Work started")}>
                    Start progress
                  </button>
                </div>
              )}

              {wo.status === "IN_PROGRESS" && (
                <div className={styles.inlineForm}>
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.completeWorkOrder(id), "Marked complete")}>
                    Mark complete
                  </button>
                </div>
              )}

              {wo.status === "COMPLETED" && (
                <div className={styles.inlineForm}>
                  <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy} onClick={() => act(() => api.closeWorkOrder(id), "Work order closed")}>
                    Close work order
                  </button>
                </div>
              )}

              {TERMINAL.has(wo.status) && (
                <p className={styles.hint}>
                  This work order is {(wo.status || "").toLowerCase()}. History is preserved — use “Assign again” to create a fresh work order on the same project.
                </p>
              )}

              {CANCELLABLE.has(wo.status) && (
                <div className={styles.inlineForm}>
                  <button
                    className={`${styles.rowBtn} ${styles.rowBtnDanger}`}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Cancel this work order? This cannot be undone.")) {
                        act(() => api.cancelWorkOrder(id), "Work order cancelled");
                      }
                    }}
                  >
                    Cancel work order
                  </button>
                </div>
              )}

              {!TERMINAL.has(wo.status) && wo.status !== "COMPLETED" && (
                <div className={styles.inlineForm}>
                  <span className={styles.workflowNote}>Send to vendors — they can only reply after receiving it.</span>
                  <VendorInvitePicker
                    excludeIds={(invites || []).map((v) => v.vendor_id).filter(Boolean)}
                    busy={busy}
                    onSend={(ids) => act(() => api.sendWorkOrder(id, ids), "Work order sent to vendors")}
                  />
                </div>
              )}
            </>
          )}

          {locked && (
            <p className={styles.hint}>
              Locked (v{wo.version}) ·{" "}
              {wo.signed_at ? `Signed ${new Date(wo.signed_at).toLocaleString()} ` : ""}
              {wo.stamped_at ? `· Stamped ${new Date(wo.stamped_at).toLocaleString()} ` : ""}
              {wo.finalized_at ? `· Finalized ${new Date(wo.finalized_at).toLocaleString()}` : ""}
            </p>
          )}
        </div>
      )}

      {/* ---------------- documents ---------------- */}
      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Official documents</h3>
            <p>Generated and signed files per version — originals preserved, SHA-256 verified</p>
          </div>
        </div>
        <ul className={styles.listPlain}>
          {(wo.documents || []).map((d) => (
            <li key={d.id}>
              <strong>{d.document_type}</strong>
              <span>{d.file_name}</span>
              <span>v{d.version}{d.file_size ? ` · ${(d.file_size / 1024).toFixed(1)} KB` : ""}</span>
              <span>{d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : ""}</span>
              {verified[d.id] != null && (
                <span className={styles.statusBadge}>
                  {verified[d.id] ? "integrity verified" : "HASH MISMATCH"}
                </span>
              )}
              <span className={styles.inlineForm}>
                <button className={styles.rowBtn} onClick={() => verifyDoc(d.id)}>Verify</button>
                <button className={styles.rowBtn} onClick={() => act(
                  () => api.downloadAuthedFile(`/work-order-documents/${d.id}/download`, d.file_name || "document"),
                  "Document downloaded"
                )}>Download</button>
              </span>
            </li>
          ))}
          {(wo.documents || []).length === 0 && <li>No official documents yet — generate the PDF first.</li>}
        </ul>

        {upFile && (
          <div className={studio.uploadStrip}>
            <FiPaperclip /> {upFile.name} ready
            <select value={upType} onChange={(e) => setUpType(e.target.value)}>
              {["SIGNED", "STAMPED", "FINAL"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className={studio.btnAccent} disabled={busy} onClick={uploadSigned}>
              <FiUploadCloud /> Upload
            </button>
            <button className={studio.iconBtn} onClick={() => setUpFile(null)} aria-label="Discard"><FiX /></button>
          </div>
        )}

        {isAdmin && (
          <div className={styles.inlineForm}>
            <select value={upType} onChange={(e) => setUpType(e.target.value)}>
              {["SIGNED", "STAMPED", "FINAL"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setUpFile(e.target.files?.[0] || null)} />
            <button className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} disabled={busy || !upFile} onClick={uploadSigned}>
              Upload Signed Document
            </button>
          </div>
        )}

        {versions.length > 0 && (
          <>
            <div className={styles.tableHeader}>
              <div><h3>Version snapshots</h3><p>Structured, queryable history — earlier versions are never overwritten</p></div>
            </div>
            <ul className={styles.listPlain}>
              {versions.map((v) => (
                <li key={v.id}>
                  <strong>v{v.version}</strong>
                  <span>{v.created_at ? new Date(v.created_at).toLocaleString() : ""}</span>
                  <span>{v.pdf_path || "no PDF"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Admin records each vendor's reply (vendors never log in). */
function VendorResponseRecorder({ invites, busy, onViewed, onAccept, onReject }) {
  const [reasons, setReasons] = useState({});
  const stamp = (v) => {
    if (v.accepted_at) return `accepted ${new Date(v.accepted_at).toLocaleDateString()}`;
    if (v.rejected_at) return `declined${v.rejection_reason ? `: ${v.rejection_reason}` : ""}`;
    if (v.viewed_at) return "viewed, no reply yet";
    return v.sent_at ? `sent ${new Date(v.sent_at).toLocaleDateString()}` : "sent";
  };
  return (
    <div className={studio.group}>
      <div className={studio.groupHead}>
        <span>Record replies on vendors&apos; behalf</span>
        <em>accept / decline + reason</em>
      </div>
      <div className={studio.groupBody} style={{ flexDirection: "column", alignItems: "stretch" }}>
        {invites.map((v) => {
          const done = v.accepted_at || v.rejected_at;
          return (
            <div key={v.id} className={styles.inlineForm} style={{ borderTop: "none", padding: "10px 0" }}>
              <strong style={{ minWidth: 180 }}>{v.vendor_name || `Vendor #${v.vendor_id}`}</strong>
              <span className={styles.hint} style={{ padding: 0 }}>{stamp(v)}</span>
              {!done && (
                <>
                  {v.status === "SENT" && (
                    <button className={styles.rowBtn} disabled={busy} onClick={() => onViewed(v.vendor_id)}>Viewed</button>
                  )}
                  <button className={styles.rowBtn} disabled={busy} onClick={() => onAccept(v.vendor_id)}>Accept</button>
                  <input
                    placeholder="Decline reason *"
                    value={reasons[v.vendor_id] || ""}
                    onChange={(e) => setReasons((p) => ({ ...p, [v.vendor_id]: e.target.value }))}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <button
                    className={styles.rowBtn}
                    disabled={busy}
                    onClick={() => {
                      const r = (reasons[v.vendor_id] || "").trim();
                      if (!r) return;
                      onReject(v.vendor_id, r);
                      setReasons((p) => ({ ...p, [v.vendor_id]: "" }));
                    }}
                  >
                    Decline
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}