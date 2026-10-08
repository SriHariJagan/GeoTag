import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FiArrowLeft, FiAward, FiChevronDown, FiCopy, FiDownload, FiEdit2,
  FiExternalLink, FiFileText, FiMoreVertical, FiPaperclip, FiSend,
  FiUploadCloud, FiX,
} from "react-icons/fi";
import Toast from "../Toast/Toast";
import { useToast } from "../Toast/useToast";
import WoEditor from "./WoEditor";
import WoPreview from "./WoPreview";
import { totalsOf, validateDoc } from "./docEngine";
import * as woApi from "../../api/procurement.api";
import { getCompanySettings } from "../../api/company.api";
import { getProjectDetails } from "../../api/projects.api";
import { useAuth } from "../../store/context/AuthContext";
import { can, PERMISSIONS } from "../../constants/permissions";
import styles from "./Studio.module.css";

const DEFAULT_INTRO = "Dear Sir,\n\nWe are pleased to award the above said work to you. The scope, rates and terms & conditions are mentioned below.";
const DEFAULT_ACCEPT = "You may please return a copy of this Work Order duly sealed and signed by your authorized representative towards unconditional acceptance of the above conditions, which shall constitute a valid contract between us.";

const blankDoc = () => ({
  id: null, status: "DRAFT", version: 1,
  work_order_number: "", work_order_date: new Date().toISOString().slice(0, 10),
  project_id: null, vendor_id: null, invited_vendor_ids: [],
  _projectCode: "", _projectRow: null, _vendorRow: null,
  project_name: "", client_name: "", site: "", location: "", work_type: "",
  subject: "", reference: "", intro_text: DEFAULT_INTRO, scope_of_work: "",
  start_date: "", end_date: "",
  items: [{ item_number: "1", description: "", sub_description: "", unit: "lot", quantity: 1, unit_rate: 0 }],
  discount: 0, tax_amount: 0, other_charges: 0, currency: "INR",
  validity_days: "", completion_period: "", retention_percent: "",
  tax_terms: "", delivery_terms: "", payment_terms: "", special_conditions: "",
  standard_terms: "", custom_terms: "",
  payment_terms_list: [""], general_terms: [""],
  acceptance_text: DEFAULT_ACCEPT,
  vendor_override: {},
  team_supervisors: [], team_machines: [],
  signer_name: "", signer_designation: "",
  vendor_signer_name: "", vendor_signer_designation: "",
  documents: [], vendor_invites: [],
});

export default function WorkOrderStudio() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toasts, push, dismiss } = useToast();
  const { user } = useAuth();
  const isAdmin = can(user, PERMISSIONS.WORK_ORDER_CREATE);

  const [doc, setDoc] = useState(blankDoc);
  const [company, setCompany] = useState({});
  const [stdTerms, setStdTerms] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [mobileTab, setMobileTab] = useState("edit");
  const [zoom, setZoom] = useState(0.75);
  const [activeSection, setActiveSection] = useState(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupQ, setDupQ] = useState("");
  const [dupRows, setDupRows] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const moreRef = useRef(null);
  const pdfRef = useRef(null);
  const prevPaneRef = useRef(null);

  /* close menus on outside click / Escape */
  useEffect(() => {
    if (!moreOpen && !pdfOpen) return;
    const onDown = (e) => {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
      if (pdfOpen && pdfRef.current && !pdfRef.current.contains(e.target)) setPdfOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") { setMoreOpen(false); setPdfOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen, pdfOpen]);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadType, setUploadType] = useState("SIGNED");
  const [verified, setVerified] = useState({});
  const saveTimer = useRef(null);
  const draftId = params.get("draft");

  const fail = (e, fb = "Action failed") => {
    const msg = e?.response?.data?.detail || e?.message || fb;
    push(typeof msg === "string" ? msg : fb, "error");
  };

  // base data
  useEffect(() => {
    getCompanySettings().then((r) => setCompany(r.data || {})).catch(() => {});
    woApi.listStandardTerms().then((r) => setStdTerms(r.data || [])).catch(() => {});
  }, []);

  // load draft
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      try {
        const r = await woApi.getWoDocument(draftId);
        const d = r.data || {};
        setDoc(fromApi(d));
        setSavedAt(new Date());
        push(`Draft ${d.work_order_number} loaded`, "success");
      } catch (e) { fail(e, "Failed to load draft"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  const fromApi = (d) => ({
    ...blankDoc(),
    ...d,
    _projectCode: d.doc_project?.project_code || "",
    _projectRow: null,
    _vendorRow: null,
    invited_vendor_ids: (d.vendor_invites || []).map((v) => v.vendor_id),
  });

  const toApi = (d) => {
    const clean = (arr) => (arr || []).map((s) => (s || "").trim()).filter(Boolean);
    return {
      project_id: d.project_id,
      vendor_id: d.vendor_id ?? null,
      work_order_number: (d.work_order_number || "").trim() || undefined,
      work_order_date: d.work_order_date || undefined,
      project_name: d.project_name || undefined,
      client_name: d.client_name || undefined,
      site: d.site || undefined,
      location: d.location || undefined,
      work_type: d.work_type || undefined,
      subject: d.subject || undefined,
      reference: d.reference || undefined,
      intro_text: d.intro_text || undefined,
      acceptance_text: d.acceptance_text || undefined,
      payment_terms_list: clean(d.payment_terms_list),
      general_terms: clean(d.general_terms),
      vendor_override: d.vendor_override && Object.keys(d.vendor_override).length ? d.vendor_override : undefined,
      team_supervisors: d.team_supervisors || undefined,
      team_machines: (d.team_machines || []).map((e) => ({
        machine_id: e.machine_id,
        rate_per_day: e.rate_per_day === "" || e.rate_per_day == null ? undefined : Number(e.rate_per_day),
      })),
      signer_name: d.signer_name || undefined,
      signer_designation: d.signer_designation || undefined,
      vendor_signer_name: d.vendor_signer_name || undefined,
      vendor_signer_designation: d.vendor_signer_designation || undefined,
      scope_of_work: d.scope_of_work || undefined,
      currency: d.currency || "INR",
      discount: Number(d.discount) || 0,
      tax_amount: Number(d.tax_amount) || 0,
      other_charges: Number(d.other_charges) || 0,
      start_date: d.start_date || undefined,
      end_date: d.end_date || undefined,
      payment_terms: d.payment_terms || undefined,
      validity_days: d.validity_days === "" || d.validity_days == null ? undefined : Number(d.validity_days),
      completion_period: d.completion_period || undefined,
      retention_percent: d.retention_percent === "" || d.retention_percent == null ? undefined : Number(d.retention_percent),
      tax_terms: d.tax_terms || undefined,
      delivery_terms: d.delivery_terms || undefined,
      special_conditions: d.special_conditions || undefined,
      items: (d.items || []).map((it, i) => ({
        item_number: it.item_number || String(i + 1),
        description: it.description || "",
        sub_description: it.sub_description || undefined,
        unit: it.unit || undefined,
        quantity: Number(it.quantity) || 0,
        unit_rate: Number(it.unit_rate) || 0,
      })),
    };
  };

  const persist = useCallback(async (snapshot, { silent = true } = {}) => {
    if (!snapshot.project_id) {
      if (!silent) push("Select a project first", "error");
      return null;
    }
    setSaving(true);
    try {
      let res;
      if (snapshot.id) {
        res = await woApi.updateWorkOrder(snapshot.id, toApi(snapshot));
      } else {
        res = await woApi.createWorkOrder(toApi(snapshot));
      }
      const merged = { ...snapshot, ...fromApi(res.data), _vendorRow: snapshot._vendorRow, _projectRow: snapshot._projectRow, _projectCode: snapshot._projectCode };
      setDoc(merged);
      setDirty(false);
      setSavedAt(new Date());
      if (!silent) push(snapshot.id ? "Draft saved" : `Draft ${res.data.work_order_number} created`, "success");
      return merged;
    } catch (e) {
      if (!silent) fail(e, "Save failed");
      else push(e?.response?.data?.detail || "Autosave failed", "error");
      return null;
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounced autosave (never every keystroke)
  useEffect(() => {
    if (!dirty || !doc.project_id || !doc.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(doc, { silent: true }), 1500);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
  }, [dirty, doc, persist]);

  const onChange = (next) => {
    setDoc(next);
    setDirty(true);
  };

  const onRegenNumber = async () => {
    if (!doc.project_id) { push("Select a project first", "error"); return; }
    try {
      const r = await woApi.nextWoNumber(doc.project_id);
      onChange({ ...doc, work_order_number: r.data.work_order_number });
      push(`Number reserved: ${r.data.work_order_number}`, "success");
    } catch (e) { fail(e, "Numbering failed"); }
  };

  // prefill number on project pick (only when untouched)
  const onDocChange = async (next) => {
    const picked = !doc.project_id && next.project_id;
    onChange(next);
    if (picked && !next.work_order_number) {
      try {
        const r = await woApi.nextWoNumber(next.project_id);
        setDoc((d) => (d.work_order_number ? d : { ...d, work_order_number: r.data.work_order_number }));
      } catch { /* numbering optional until save */ }
    }
    if (picked) {
      try {
        const full = await getProjectDetails(next.project_id).then((x) => x.data).catch(() => null);
        if (full) {
          setDoc((d) => ({
            ...d,
            project_name: d.project_name || full.name || "",
            client_name: d.client_name || full.client_name || "",
            location: d.location || full.location || "",
          }));
        }
      } catch { /* snapshot optional */ }
    }
  };

  // preview view-model (snapshot-first for saved, live masters for drafts)
  const view = useMemo(() => {
    const vendor = doc.vendor_snapshot && Object.keys(doc.vendor_snapshot).length
      ? { ...doc.vendor_snapshot }
      : {
          company: doc._vendorRow?.company || doc.vendor_name || "",
          vendor_code: doc._vendorRow?.vendor_code || "",
          address: doc._vendorRow?.address || "",
          city: doc._vendorRow?.city || "", state: doc._vendorRow?.state || "",
          pin: doc._vendorRow?.postal_code || "",
          contact_person: doc._vendorRow?.contact_person || "",
          mobile: doc._vendorRow?.phone || "",
          email: doc._vendorRow?.email || "",
          gstin: doc._vendorRow?.gstin || "", pan: "",
          ...(doc.vendor_override || {}),
        };
    // doc-level overrides always win (even over snapshots for unsaved edits)
    Object.assign(vendor, Object.fromEntries(
      Object.entries(doc.vendor_override || {}).filter(([, v]) => v !== "" && v != null)));
    const project = doc.project_snapshot && Object.keys(doc.project_snapshot).length
      ? { ...doc.project_snapshot }
      : {
          project_code: doc._projectCode || doc._projectRow?.project_code || "",
          name: doc.project_name, client_name: doc.client_name,
          location: doc.location, status: doc._projectRow?.status || "",
        };
    const totals = totalsOf(doc.items, doc.discount, doc.tax_amount, doc.other_charges);
    return { ...doc, company, vendor, project, totals };
  }, [doc, company]);

  const missing = useMemo(() => validateDoc({ ...doc, invited_vendor_ids: doc.invited_vendor_ids }), [doc]);
  const errMap = useMemo(() => {
    const m = {};
    missing.forEach(({ section }) => {
      const key = { "Work Order Information": "_info", Vendor: "_vendor", Project: "_project", Subject: "_subject", Scope: "_scope", BOQ: "_boq", "Payment Terms": "_pay", "General Terms": "_gen", Signature: "_sig" }[section];
      if (key) m[key] = (m[key] ? m[key] + " · " : "") + section + " incomplete";
    });
    return m;
  }, [missing]);

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      const saved = dirty || !doc.id ? await persist(doc, { silent: true }) : doc;
      if (!saved) return;
      const res = await fn(saved);
      const merged = { ...saved, ...fromApi(res.data || res), _vendorRow: saved._vendorRow, _projectRow: saved._projectRow, _projectCode: saved._projectCode };
      setDoc(merged);
      setDirty(false);
      setSavedAt(new Date());
      if (ok) push(ok, "success");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const doGenerate = () => act((s) => woApi.generateWorkOrderPdf(s.id), "Professional PDF generated");
  const doDownloadPdf = async () => {
    setBusy(true);
    try {
      await woApi.downloadAuthedFile(`/work-orders/${doc.id}/pdf/download`, "work-order.pdf");
    } catch (e) { fail(e, "Download failed"); } finally { setBusy(false); }
  };
  const doDownloadDoc = async (docId, fileName) => {
    setBusy(true);
    try {
      await woApi.downloadAuthedFile(`/work-order-documents/${docId}/download`, fileName || "document");
    } catch (e) { fail(e, "Download failed"); } finally { setBusy(false); }
  };
  const doSign = () => act((s) => woApi.signWorkOrder(s.id, doc.signer_name || undefined), "Signed by admin");
  const doStamp = () => act((s) => woApi.stampWorkOrder(s.id, "COMPANY SEAL"), "Company stamp applied");
  const doFinalize = () => act((s) => woApi.finalizeWorkOrder(s.id), "Finalized & locked");
  const doSend = () => act(async (s) => {
    const ids = [...new Set([...(doc.invited_vendor_ids || []), ...(doc.vendor_id ? [doc.vendor_id] : [])])];
    if (!ids.length) throw new Error("Select at least one vendor");
    await woApi.sendWorkOrder(s.id, ids);
    try { await woApi.issueWorkOrder(s.id); } catch { /* already issued */ }
    return woApi.getWorkOrder(s.id);
  }, "Sent to vendors & issued");

  const doUpload = async () => {
    if (!uploadFile) { push("Choose a PDF/PNG/JPG file", "error"); return; }
    setBusy(true);
    try {
      const saved = dirty || !doc.id ? await persist(doc, { silent: true }) : doc;
      if (!saved) return;
      const res = await woApi.uploadWoDocument(saved.id, uploadFile, uploadType);
      const merged = { ...saved, ...fromApi(res.data), _vendorRow: saved._vendorRow, _projectRow: saved._projectRow, _projectCode: saved._projectCode };
      setDoc(merged);
      setDirty(false);
      setUploadFile(null);
      const up = (merged.documents || []).find((d) => d.document_type === uploadType);
      if (up) {
        const v = await woApi.verifyWoDocument(up.id).then((x) => x.data).catch(() => null);
        if (v) setVerified((p) => ({ ...p, [up.id]: v.verified }));
      }
      push("Signed document stored permanently (original preserved)", "success");
    } catch (e) { fail(e, "Upload failed"); } finally { setBusy(false); }
  };

  const doNewVersion = () => act((s) => woApi.cloneWoVersion(s.id), "Version created — v1 untouched");

  const locked = doc.id && (doc.is_locked === 1 || ["SIGNED", "STAMPED", "FINALIZED"].includes(doc.status));

  const doFit = () => {
    const w = prevPaneRef.current ? prevPaneRef.current.clientWidth : 900;
    setZoom(Math.max(0.4, Math.min(1.2, (w - 64) / 830)));
  };

  return (
    <div className={styles.studio}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <header className={styles.bar}>
        <button className={styles.iconBtn} onClick={() => navigate("/admin/work-orders")} title="Back to work orders" aria-label="Back to work orders">
          <FiArrowLeft />
        </button>

        <div className={styles.titleBox}>
          <div className={styles.titleRow}>
            <h1>{doc.work_order_number || "Untitled Work Order"}</h1>
            {doc.id && <span className={styles.verChip}>v{doc.version || 1}</span>}
            <span className={styles.statusChip} data-status={doc.id ? doc.status : "NEW"}>
              {doc.id ? doc.status : "NEW"}
            </span>
          </div>
          <span className={styles.saveState} data-state={saving ? "saving" : dirty ? "dirty" : "saved"}>
            <i className={styles.dotState} />
            {saving
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : savedAt
                  ? `Saved ${savedAt.toLocaleTimeString()}`
                  : "New work order"}
          </span>
        </div>

        <div className={styles.barActions}>
          <button className={styles.btnAccent} disabled={busy || saving || locked} onClick={() => persist(doc, { silent: false })}>
            Save
          </button>

          <div className={styles.menuWrap} ref={pdfRef}>
            <button className={styles.btn} disabled={busy || !doc.id} onClick={() => setPdfOpen(!pdfOpen)}>
              PDF <FiChevronDown />
            </button>
            {pdfOpen && (
              <div className={styles.menu}>
                <button type="button" onClick={() => { setPdfOpen(false); doGenerate(); }} disabled={busy || !doc.id}>
                  <FiFileText /> Generate PDF
                </button>
                {doc.pdf_path && (
                  <button type="button" onClick={() => { setPdfOpen(false); doDownloadPdf(); }} disabled={busy}>
                    <FiDownload /> Download PDF
                  </button>
                )}
              </div>
            )}
          </div>

          <button className={styles.btnPrimary} disabled={busy || !doc.id || locked} onClick={doFinalize}>
            Finalize
          </button>

          <div className={styles.menuWrap} ref={moreRef}>
            <button className={styles.iconBtn} onClick={() => setMoreOpen(!moreOpen)} title="More actions" aria-label="More actions">
              <FiMoreVertical />
            </button>
            {moreOpen && (
              <div className={`${styles.menu} ${styles.menuRight}`}>
                <button type="button" onClick={() => { setMoreOpen(false); setDupOpen(true); }} disabled={busy}>
                  <FiCopy /> Duplicate from previous
                </button>
                <button type="button" onClick={() => { setMoreOpen(false); doSign(); }} disabled={busy || !doc.id || locked}>
                  <FiEdit2 /> Admin sign
                </button>
                <button type="button" onClick={() => { setMoreOpen(false); doStamp(); }} disabled={busy || !doc.id || locked}>
                  <FiAward /> Apply stamp
                </button>
                <button type="button" onClick={() => { setMoreOpen(false); doSend(); }} disabled={busy || !doc.id}>
                  <FiSend /> Send &amp; issue
                </button>
                <button type="button" onClick={() => { setMoreOpen(false); doNewVersion(); }} disabled={busy || !doc.id}>
                  <FiCopy /> New version
                </button>
                <button type="button" onClick={() => { setMoreOpen(false); doUpload(); }} disabled={busy || !doc.id || !uploadFile}>
                  <FiUploadCloud /> Upload signed {uploadType.toLowerCase()}
                </button>
                {doc.id && (
                  <button type="button" onClick={() => { setMoreOpen(false); navigate(`/admin/work-orders/${doc.id}`); }}>
                    <FiExternalLink /> Open full record
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {locked && <div className={styles.lockBar}>Locked — corrections require “New version”.</div>}

      <div className={styles.mobileTabs}>
        <button className={mobileTab === "edit" ? styles.mOn : ""} onClick={() => setMobileTab("edit")}>Edit</button>
        <button className={mobileTab === "preview" ? styles.mOn : ""} onClick={() => setMobileTab("preview")}>Preview</button>
      </div>

      <div className={styles.split}>
        {/* ---------------- LEFT: editor ---------------- */}
        <div className={`${styles.pane} ${styles.editPane} ${mobileTab === "edit" ? styles.mShow : ""}`}>
          <WoEditor
            doc={doc}
            company={company}
            stdTerms={stdTerms}
            onChange={onDocChange}
            onRegenNumber={onRegenNumber}
            errors={errMap}
            onSectionFocus={setActiveSection}
            activeSection={activeSection}
          />

          <div className={styles.footBar}>
            <div className={styles.footStats}>
              <span><b>{(doc.items || []).length}</b> items</span>
              <span><b>{(view.totals?.subtotal || 0).toLocaleString()}</b> subtotal</span>
              <span className={styles.footTotal}>
                <b>{(view.totals?.grand || 0).toLocaleString()}</b> {company?.currency || "INR"}
              </span>
            </div>
            {missing.length > 0 && (
              <span className={styles.footHint}>
                {missing.length} left: {[...new Set(missing.map((m) => m.section))].slice(0, 3).join(" · ")}
              </span>
            )}
          </div>
        </div>

        {/* ---------------- RIGHT: live A4 ---------------- */}
        <div ref={prevPaneRef} className={`${styles.pane} ${styles.prevPane} ${mobileTab === "preview" ? styles.mShow : ""}`}>
          <WoPreview view={view} zoom={zoom} onZoom={(z) => (z === "fit" ? doFit() : setZoom(z))} activeSection={activeSection} />
        </div>
      </div>

      {/* duplicate picker */}
      {dupOpen && (
        <div className={styles.modalBack} onClick={() => setDupOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3>Start from a previous work order</h3>
            <p>Everything is copied into a fresh draft — the original stays untouched.</p>
            <input
              value={dupQ} onChange={(e) => setDupQ(e.target.value)}
              placeholder="Search by WO number or vendor…" aria-label="Search work orders"
              autoFocus
            />
            <DupList
              q={dupQ}
              onPick={async (w) => {
                setBusy(true);
                try {
                  const res = await woApi.duplicateWo(w.id);
                  setDupOpen(false);
                  navigate(`/admin/work-orders/create?draft=${res.data.id}`);
                } catch (e) { fail(e, "Duplicate failed"); } finally { setBusy(false); }
              }}
            />
            <button className={styles.btn} onClick={() => setDupOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {uploadFile && (
        <div className={styles.uploadStrip}>
          <FiPaperclip /> {uploadFile.name} ready to upload as <b>{uploadType}</b>
          <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
            {["SIGNED", "STAMPED", "FINAL"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
          <button className={styles.btnAccent} disabled={busy || !doc.id} onClick={doUpload}>Upload</button>
          <button className={styles.iconBtn} onClick={() => setUploadFile(null)} title="Discard" aria-label="Discard"><FiX /></button>
        </div>
      )}

      {(doc.documents || []).length > 0 && (
        <div className={styles.docList}>
          <h3>Stored documents</h3>
          {(doc.documents || []).map((d) => (
            <div key={d.id} className={styles.docRow}>
              <strong>{d.document_type}</strong>
              <span>{d.file_name}</span>
              <span>v{d.version}{d.file_size ? ` · ${(d.file_size / 1024).toFixed(0)} KB` : ""}</span>
              {d.uploaded_at && <span>{new Date(d.uploaded_at).toLocaleDateString()}</span>}
              {verified[d.id] != null && (
                <span className={verified[d.id] ? styles.okBadge : styles.badBadge}>
                  {verified[d.id] ? "Verified" : "Mismatch"}
                </span>
              )}
              <button className={styles.linkBtn} onClick={async () => {
                const v = await woApi.verifyWoDocument(d.id).then((x) => x.data).catch((e) => { fail(e); return null; });
                if (v) setVerified((p) => ({ ...p, [d.id]: v.verified }));
              }}>Verify</button>
              <button className={styles.linkBtn} onClick={() => doDownloadDoc(d.id, d.file_name)}>Download</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DupList({ q, onPick }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await woApi.listWorkOrders();
        const ql = (q || "").trim().toLowerCase();
        const all = r.data || [];
        setRows(
          alive
            ? all
                .filter(
                  (w) =>
                    !ql ||
                    (w.work_order_number || "").toLowerCase().includes(ql) ||
                    (w.vendor_name || "").toLowerCase().includes(ql)
                )
                .slice(0, 15)
            : []
        );
      } catch {
        if (alive) setRows([]);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  if (!rows.length) return <div className={styles.vEmpty}>No previous work orders match.</div>;
  return (
    <>
      {rows.map((w) => (
        <button key={w.id} type="button" className={styles.vItem} onClick={() => onPick(w)}>
          <strong>{w.work_order_number} · v{w.version}</strong>
          <span>
            {(w.project_name || `Project #${w.project_id}`)} · {w.vendor_name || "multi-vendor"} · {w.status}
          </span>
        </button>
      ))}
    </>
  );
}
