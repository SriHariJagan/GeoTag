import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "../Toast/Toast";
import { useToast } from "../Toast/useToast";
import ProjectAutocomplete from "./ProjectAutocomplete";
import * as woApi from "../../api/procurement.api";
import { getProjectDetails } from "../../api/projects.api";
import { useAuth } from "../../store/context/AuthContext";
import { can, PERMISSIONS } from "../../constants/permissions";
import styles from "./WorkOrderWizard.module.css";

const STEPS = [
  "Header", "Project", "Scope", "BOQ", "Commercial",
  "Vendors", "Terms", "Preview", "PDF", "Sign & Stamp", "Send",
];

const EMPTY_ITEM = { item_number: "", description: "", unit: "lot", quantity: 1, unit_rate: 0 };

export default function WorkOrderWizard() {
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const { user } = useAuth();
  const isAdmin = can(user, PERMISSIONS.WORK_ORDER_SIGN);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [wo, setWo] = useState(null); // created work order
  const [err, setErr] = useState("");

  // wizard state
  const [header, setHeader] = useState({ work_order_number: "", work_order_date: "", work_type: "" });
  const [project, setProject] = useState(null);
  const [projSnap, setProjSnap] = useState({ project_name: "", client_name: "", site: "", location: "" });
  const [scope, setScope] = useState({ scope_of_work: "", start_date: "", end_date: "" });
  const [items, setItems] = useState([{ ...EMPTY_ITEM, item_number: "1" }]);
  const [money, setMoney] = useState({ discount: 0, tax_amount: 0, other_charges: 0, currency: "INR" });
  const [commercial, setCommercial] = useState({
    payment_terms: "", validity_days: "", completion_period: "",
    retention_percent: "", tax_terms: "", delivery_terms: "", special_conditions: "",
  });
  const [vendorSearch, setVendorSearch] = useState({ q: "", capability: "" });
  const [eligible, setEligible] = useState([]);
  const [vendorIds, setVendorIds] = useState([]);
  const [stdTerms, setStdTerms] = useState([]);
  const [pickedTerms, setPickedTerms] = useState([]);
  const [customTerms, setCustomTerms] = useState("");
  const [sig, setSig] = useState({ signature: "", stamp: "" });

  const totals = useMemo(
    () => woApi.previewWoTotals(items, money.discount, money.tax_amount, money.other_charges),
    [items, money]
  );

  useEffect(() => {
    woApi.listStandardTerms().then((r) => setStdTerms(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await woApi.eligibleVendors({
          search: vendorSearch.q || undefined,
          capability: vendorSearch.capability || undefined,
          limit: 50,
        });
        if (alive) setEligible(r.data || []);
      } catch {
        if (alive) setEligible([]);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [vendorSearch]);

  const fail = (e) => {
    const msg = e?.response?.data?.detail || e?.message || "Action failed";
    setErr(typeof msg === "string" ? msg : JSON.stringify(msg));
    push(typeof msg === "string" ? msg : "Action failed", "error");
  };

  // ---- step validation ----
  const validHeader = () => true; // number auto if blank; date defaults today
  const validProject = () => {
    if (!project) {
      push("Select a project (or create new first from Projects page)", "error");
      return false;
    }
    return true;
  };
  const validScope = () => {
    if (!scope.scope_of_work.trim()) {
      push("Scope of work is required", "error");
      return false;
    }
    return true;
  };
  const validBoq = () => {
    if (!items.length || items.some((i) => !i.description.trim())) {
      push("Each BOQ item needs a description", "error");
      return false;
    }
    if (items.some((i) => Number(i.quantity) < 0 || Number(i.unit_rate) < 0)) {
      push("Quantity/rate cannot be negative", "error");
      return false;
    }
    if (Number(money.discount) > totals.subtotal) {
      push("Discount cannot exceed subtotal", "error");
      return false;
    }
    return true;
  };
  const validVendors = () => {
    if (!vendorIds.length) {
      push("Select at least one eligible (ACTIVE) vendor", "error");
      return false;
    }
    return true;
  };

  const next = () => {
    const checks = [validHeader, validProject, validScope, validBoq, null, validVendors];
    const chk = checks[step];
    if (chk && !chk()) return;
    setErr("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => { setErr(""); setStep((s) => Math.max(s - 1, 0)); };

  const onProjectPick = async (p) => {
    try {
      const full = await getProjectDetails(p.id).then((r) => r.data).catch(() => null);
      setProject({ ...p, full });
      setProjSnap({
        project_name: p.name || "",
        client_name: p.client_name || "",
        site: "",
        location: p.location || "",
      });
      push(`Loaded ${p.project_code} — team & history available on project page`, "success");
    } catch (e) { fail(e); }
  };

  // ---- create WO (Preview -> PDF step) ----
  const createWO = async () => {
    if (!validProject() || !validScope() || !validBoq()) return;
    setBusy(true);
    setErr("");
    try {
      const payload = {
        project_id: project.id,
        vendor_id: vendorIds[0] ?? null,
        work_order_number: header.work_order_number.trim() || undefined,
        work_order_date: header.work_order_date || undefined,
        work_type: header.work_type || undefined,
        project_name: projSnap.project_name || undefined,
        client_name: projSnap.client_name || undefined,
        site: projSnap.site || undefined,
        location: projSnap.location || undefined,
        scope_of_work: scope.scope_of_work,
        currency: money.currency || "INR",
        discount: Number(money.discount) || 0,
        tax_amount: Number(money.tax_amount) || 0,
        other_charges: Number(money.other_charges) || 0,
        start_date: scope.start_date || undefined,
        end_date: scope.end_date || undefined,
        payment_terms: commercial.payment_terms || undefined,
        validity_days: commercial.validity_days ? Number(commercial.validity_days) : undefined,
        completion_period: commercial.completion_period || undefined,
        retention_percent: commercial.retention_percent !== "" ? Number(commercial.retention_percent) : undefined,
        tax_terms: commercial.tax_terms || undefined,
        delivery_terms: commercial.delivery_terms || undefined,
        special_conditions: commercial.special_conditions || undefined,
        standard_terms: pickedTerms.map((id) => stdTerms.find((t) => t.id === id)?.body || "").filter(Boolean).join("\n\n") || undefined,
        custom_terms: customTerms || undefined,
        items: items.map((i, idx) => ({
          item_number: i.item_number || String(idx + 1),
          description: i.description,
          unit: i.unit || undefined,
          quantity: Number(i.quantity) || 0,
          unit_rate: Number(i.unit_rate) || 0,
        })),
      };
      const res = await woApi.createWorkOrder(payload);
      setWo(res.data);
      push(`Work order ${res.data.work_order_number} created (totals computed server-side)`, "success");
      setStep(8);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const doPdf = async () => {
    if (!wo) return;
    setBusy(true);
    try {
      try { await woApi.reviewWorkOrder(wo.id); } catch { /* already reviewed */ }
      const res = await woApi.generateWorkOrderPdf(wo.id);
      setWo(res.data);
      push("Professional PDF generated", "success");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const doSign = async () => {
    setBusy(true);
    try {
      const res = await woApi.signWorkOrder(wo.id, sig.signature || user?.email || "ADMIN");
      setWo(res.data);
      push("Signed by admin — document version preserved", "success");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const doStamp = async () => {
    setBusy(true);
    try {
      const res = await woApi.stampWorkOrder(wo.id, sig.stamp || "COMPANY SEAL");
      setWo(res.data);
      push("Company stamp applied", "success");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const doFinalize = async () => {
    setBusy(true);
    try {
      const res = await woApi.finalizeWorkOrder(wo.id);
      setWo(res.data);
      push("Finalized & locked — further edits require a new version", "success");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const doSend = async () => {
    setBusy(true);
    try {
      let cur = wo;
      const s1 = await woApi.sendWorkOrder(wo.id, vendorIds);
      cur = s1.data;
      try { await woApi.issueWorkOrder(wo.id); cur = (await woApi.getWorkOrder(wo.id)).data; } catch { /* maybe already issued */ }
      setWo(cur);
      push("Work order sent — vendors notified in portal", "success");
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const locked = wo && (wo.is_locked === 1 || ["SIGNED", "STAMPED", "FINALIZED"].includes(wo.status));

  return (
    <div className={styles.wrap}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <div className={styles.steps}>
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            className={`${styles.step} ${i === step ? styles.stepActive : ""} ${i < step ? styles.stepDone : ""}`}
            onClick={() => (wo ? setStep(i) : i <= step && setStep(i))}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* 1 HEADER */}
      {step === 0 && (
        <div className={styles.card}>
          <h3>1. Work Order Header</h3>
          <p className={styles.sub}>Number auto-generates if left blank (duplicates rejected with 409).</p>
          <div className={styles.grid}>
            <div className={styles.field}><label>Work order number (optional)</label>
              <input value={header.work_order_number} onChange={(e) => setHeader({ ...header, work_order_number: e.target.value })} placeholder="Auto: WO-<project>-001" /></div>
            <div className={styles.field}><label>Date</label>
              <input type="date" value={header.work_order_date} onChange={(e) => setHeader({ ...header, work_order_date: e.target.value })} /></div>
            <div className={styles.field}><label>Work type</label>
              <input value={header.work_type} onChange={(e) => setHeader({ ...header, work_type: e.target.value })} placeholder="e.g. Borehole drilling" /></div>
          </div>
          <div className={styles.nav}><span /><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>Continue → Project</button></div>
        </div>
      )}

      {/* 2 PROJECT */}
      {step === 1 && (
        <div className={styles.card}>
          <h3>2. Project</h3>
          <p className={styles.sub}>Type a Project ID (e.g. GEO-2026) — matching projects appear. Selecting loads details; nothing is duplicated.</p>
          <ProjectAutocomplete value={project?.project_code} onSelect={onProjectPick} onReset={() => { setProject(null); push("Create the project from Projects page, then return here", "success"); }} />
          {project && (
            <div className={styles.kv} style={{ marginTop: 10 }}>
              <div><span>Project</span>{project.project_code} — {project.name}</div>
              <div><span>Client</span>{project.client_name || "-"}</div>
              <div><span>Location</span>{project.location || "-"}</div>
              <div><span>Status</span>{project.status}</div>
            </div>
          )}
          <div className={styles.grid} style={{ marginTop: 10 }}>
            <div className={styles.field}><label>Project name (snapshot)</label><input value={projSnap.project_name} onChange={(e) => setProjSnap({ ...projSnap, project_name: e.target.value })} /></div>
            <div className={styles.field}><label>Client (snapshot)</label><input value={projSnap.client_name} onChange={(e) => setProjSnap({ ...projSnap, client_name: e.target.value })} /></div>
            <div className={styles.field}><label>Site</label><input value={projSnap.site} onChange={(e) => setProjSnap({ ...projSnap, site: e.target.value })} placeholder="Site / plot" /></div>
            <div className={styles.field}><label>Location (snapshot)</label><input value={projSnap.location} onChange={(e) => setProjSnap({ ...projSnap, location: e.target.value })} /></div>
          </div>
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>Continue → Scope</button></div>
        </div>
      )}

      {/* 3 SCOPE */}
      {step === 2 && (
        <div className={styles.card}>
          <h3>3. Scope of Work</h3>
          <p className={styles.sub}>Describe the work; add schedule window.</p>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.full}`}><label>Scope *</label>
              <textarea value={scope.scope_of_work} onChange={(e) => setScope({ ...scope, scope_of_work: e.target.value })} placeholder="Detailed scope…" /></div>
            <div className={styles.field}><label>Start date</label><input type="date" value={scope.start_date} onChange={(e) => setScope({ ...scope, start_date: e.target.value })} /></div>
            <div className={styles.field}><label>End date</label><input type="date" value={scope.end_date} onChange={(e) => setScope({ ...scope, end_date: e.target.value })} /></div>
          </div>
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>Continue → BOQ</button></div>
        </div>
      )}

      {/* 4 BOQ */}
      {step === 3 && (
        <div className={styles.card}>
          <h3>4. BOQ / Work Items</h3>
          <p className={styles.sub}>Amounts compute live for preview — the backend recomputes and ignores frontend totals.</p>
          <table className={styles.tbl}>
            <thead><tr><th>#</th><th>Description *</th><th>Unit</th><th className={styles.num}>Qty</th><th className={styles.num}>Rate</th><th></th></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td><input value={it.item_number} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, item_number: e.target.value } : x))} style={{ width: 44 }} /></td>
                  <td><input value={it.description} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Item description" style={{ width: "100%" }} /></td>
                  <td><input value={it.unit} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} style={{ width: 60 }} /></td>
                  <td><input type="number" min="0" value={it.quantity} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} style={{ width: 80 }} /></td>
                  <td><input type="number" min="0" value={it.unit_rate} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unit_rate: e.target.value } : x))} style={{ width: 90 }} /></td>
                  <td><button className={styles.btn} onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.rowBtns} style={{ marginTop: 8 }}>
            <button className={styles.btn} onClick={() => setItems([...items, { ...EMPTY_ITEM, item_number: String(items.length + 1) }])}>+ Add item</button>
          </div>
          <div className={styles.grid} style={{ marginTop: 8 }}>
            <div className={styles.field}><label>Discount</label><input type="number" min="0" value={money.discount} onChange={(e) => setMoney({ ...money, discount: e.target.value })} /></div>
            <div className={styles.field}><label>Tax</label><input type="number" min="0" value={money.tax_amount} onChange={(e) => setMoney({ ...money, tax_amount: e.target.value })} /></div>
            <div className={styles.field}><label>Other charges</label><input type="number" min="0" value={money.other_charges} onChange={(e) => setMoney({ ...money, other_charges: e.target.value })} /></div>
            <div className={styles.field}><label>Currency</label>
              <select value={money.currency} onChange={(e) => setMoney({ ...money, currency: e.target.value })}>
                {["INR", "USD", "EUR", "AED", "SAR"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
          </div>
          <div className={styles.totals}><table><tbody>
            <tr><td>Subtotal</td><td>{totals.subtotal.toFixed(2)}</td></tr>
            <tr><td>Discount</td><td>{Number(totals.discount).toFixed(2)}</td></tr>
            <tr><td>Tax</td><td>{Number(totals.tax).toFixed(2)}</td></tr>
            <tr><td>Other</td><td>{Number(totals.other).toFixed(2)}</td></tr>
            <tr className={styles.grand}><td>Grand total</td><td>{totals.grand.toFixed(2)} {money.currency}</td></tr>
          </tbody></table></div>
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>Continue → Commercial</button></div>
        </div>
      )}

      {/* 5 COMMERCIAL */}
      {step === 4 && (
        <div className={styles.card}>
          <h3>5. Commercial Terms</h3>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.full}`}><label>Payment terms</label><textarea value={commercial.payment_terms} onChange={(e) => setCommercial({ ...commercial, payment_terms: e.target.value })} placeholder="e.g. 30 days after invoice…" /></div>
            <div className={styles.field}><label>Validity (days)</label><input type="number" min="0" value={commercial.validity_days} onChange={(e) => setCommercial({ ...commercial, validity_days: e.target.value })} /></div>
            <div className={styles.field}><label>Completion period</label><input value={commercial.completion_period} onChange={(e) => setCommercial({ ...commercial, completion_period: e.target.value })} placeholder="e.g. 45 days" /></div>
            <div className={styles.field}><label>Retention %</label><input type="number" min="0" max="100" value={commercial.retention_percent} onChange={(e) => setCommercial({ ...commercial, retention_percent: e.target.value })} /></div>
            <div className={styles.field}><label>Taxes</label><input value={commercial.tax_terms} onChange={(e) => setCommercial({ ...commercial, tax_terms: e.target.value })} placeholder="e.g. GST extra as applicable" /></div>
            <div className={styles.field}><label>Delivery terms</label><input value={commercial.delivery_terms} onChange={(e) => setCommercial({ ...commercial, delivery_terms: e.target.value })} /></div>
            <div className={`${styles.field} ${styles.full}`}><label>Special conditions</label><textarea value={commercial.special_conditions} onChange={(e) => setCommercial({ ...commercial, special_conditions: e.target.value })} /></div>
          </div>
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>Continue → Vendors</button></div>
        </div>
      )}

      {/* 6 VENDORS */}
      {step === 5 && (
        <div className={styles.card}>
          <h3>6. Select Vendors</h3>
          <p className={styles.sub}>Only eligible <b>ACTIVE</b> vendors are listed. Search by vendor ID, company, capability or status.</p>
          <div className={styles.grid}>
            <div className={styles.field}><label>Search (ID / company)</label><input value={vendorSearch.q} onChange={(e) => setVendorSearch({ ...vendorSearch, q: e.target.value })} placeholder="VN-000001 or company…" /></div>
            <div className={styles.field}><label>Capability</label><input value={vendorSearch.capability} onChange={(e) => setVendorSearch({ ...vendorSearch, capability: e.target.value })} placeholder="e.g. DRILLING" /></div>
          </div>
          <div style={{ marginTop: 8 }}>
            {eligible.length === 0 && <p className={styles.hint}>No eligible vendors match. Onboard vendors first (they auto-receive VN- IDs and start PROSPECT → ACTIVE).</p>}
            {eligible.map((v) => (
              <label key={v.id} className={styles.vendorRow}>
                <input type="checkbox" checked={vendorIds.includes(v.id)} onChange={() => setVendorIds(vendorIds.includes(v.id) ? vendorIds.filter((x) => x !== v.id) : [...vendorIds, v.id])} />
                <strong>{v.company}</strong>
                <span className={styles.badge}>{v.vendor_code}</span>
                <span className={styles.badge}>{v.status}</span>
                {v.capabilities && <span className={styles.hint}>{v.capabilities}</span>}
              </label>
            ))}
          </div>
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>Continue → Terms</button></div>
        </div>
      )}

      {/* 7 TERMS */}
      {step === 6 && (
        <div className={styles.card}>
          <h3>7. Terms & Conditions</h3>
          <p className={styles.sub}>Pick reusable standard terms, plus custom terms.</p>
          {stdTerms.length === 0 && <p className={styles.hint}>No standard terms library yet — add custom terms below.</p>}
          {stdTerms.map((t) => (
            <label key={t.id} className={styles.vendorRow}>
              <input type="checkbox" checked={pickedTerms.includes(t.id)} onChange={() => setPickedTerms(pickedTerms.includes(t.id) ? pickedTerms.filter((x) => x !== t.id) : [...pickedTerms, t.id])} />
              <strong>{t.title}</strong>
              <span className={styles.hint}>{(t.body || "").slice(0, 80)}…</span>
            </label>
          ))}
          <div className={`${styles.field} ${styles.full}`} style={{ marginTop: 8 }}><label>Custom terms</label>
            <textarea value={customTerms} onChange={(e) => setCustomTerms(e.target.value)} placeholder="Additional project-specific terms…" /></div>
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>Continue → Preview</button></div>
        </div>
      )}

      {/* 8 PREVIEW */}
      {step === 7 && (
        <div className={styles.card}>
          <h3>8. Final Preview Before Issuing</h3>
          <div className={styles.kv}>
            <div><span>WO number</span>{header.work_order_number || "(auto)"}</div>
            <div><span>Project</span>{project ? `${project.project_code} — ${project.name}` : "-"}</div>
            <div><span>Vendors</span>{vendorIds.length} selected</div>
            <div><span>Grand total (preview)</span>{totals.grand.toFixed(2)} {money.currency}</div>
          </div>
          <p className={styles.hint} style={{ marginTop: 8 }}>Creating computes all totals on the backend — frontend totals are never trusted.</p>
          {err && <p className={styles.err}>{err}</p>}
          <div className={styles.nav}>
            <button className={styles.btn} onClick={back}>← Back</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={createWO} disabled={busy || !!wo}>
              {busy ? "Creating…" : wo ? `Created ${wo.work_order_number}` : "Create Work Order → Generate PDF"}
            </button>
          </div>
        </div>
      )}

      {/* 9 PDF */}
      {step === 8 && (
        <div className={styles.card}>
          <h3>9. Generate PDF</h3>
          {!wo && <p className={styles.warn}>Create the work order first (previous step).</p>}
          {wo && (
            <>
              <p className={styles.sub}>Corporate PDF: header, WO title/number/date, vendor + project/client/site, scope, BOQ, commercial, payment, completion, terms, signature & stamp areas.</p>
              <div className={styles.rowBtns}>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doPdf} disabled={busy}>Generate PDF</button>
                {wo.pdf_path && (
                  <>
                    <button
                      className={styles.btn}
                      onClick={async () => {
                        setBusy(true);
                        try { await woApi.openAuthedFile(woApi.workOrderPdfPreviewUrl(wo.id)); }
                        catch (e) { push(e?.response?.data?.detail || "Preview failed", "error"); }
                        finally { setBusy(false); }
                      }}
                    >
                      Preview PDF
                    </button>
                    <button
                      className={styles.btn}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await woApi.downloadAuthedFile(
                            woApi.workOrderPdfDownloadUrl(wo.id),
                            `${wo.work_order_number}.pdf`
                          );
                        } catch (e) { push(e?.response?.data?.detail || "Download failed", "error"); }
                        finally { setBusy(false); }
                      }}
                    >
                      Download PDF
                    </button>
                  </>
                )}
              </div>
              {wo.pdf_path && <p className={styles.hint}>PDF v{wo.pdf_version} stored server-side; every sign/stamp/finalize preserves a version.</p>}
            </>
          )}
          {err && <p className={styles.err}>{err}</p>}
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setStep(9)} disabled={!wo?.pdf_path}>Continue → Sign & Stamp</button></div>
        </div>
      )}

      {/* 10 SIGN & STAMP */}
      {step === 9 && (
        <div className={styles.card}>
          <h3>10. Admin Sign & Stamp</h3>
          {!isAdmin && <p className={styles.lockNote}>Only ADMIN can sign/stamp. Ask an administrator to complete this step.</p>}
          {locked && <p className={styles.lockNote}>Signed/finalized — locked. Changes require a new work order version.</p>}
          <div className={styles.grid}>
            <div className={styles.field}><label>Signature (name)</label><input value={sig.signature} onChange={(e) => setSig({ ...sig, signature: e.target.value })} placeholder={user?.email || "Admin name"} disabled={!isAdmin || locked} /></div>
            <div className={styles.field}><label>Stamp / seal</label><input value={sig.stamp} onChange={(e) => setSig({ ...sig, stamp: e.target.value })} placeholder="COMPANY SEAL" disabled={!isAdmin || locked} /></div>
          </div>
          <div className={styles.rowBtns} style={{ marginTop: 8 }}>
            <button className={styles.btn} onClick={doSign} disabled={busy || !isAdmin || locked || wo?.status !== "PDF_GENERATED"}>1. Signature</button>
            <button className={styles.btn} onClick={doStamp} disabled={busy || !isAdmin || locked || wo?.status !== "SIGNED"}>2. Stamp</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doFinalize} disabled={busy || !isAdmin || wo?.status !== "STAMPED"}>3. Finalize (lock)</button>
          </div>
          {wo && <p className={styles.hint}>Status: {wo.status} · v{wo.version} · PDF v{wo.pdf_version} {wo.signed_at ? `· signed ${new Date(wo.signed_at).toLocaleString()}` : ""}</p>}
          {err && <p className={styles.err}>{err}</p>}
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setStep(10)} disabled={wo?.status !== "FINALIZED"}>Continue → Send</button></div>
        </div>
      )}

      {/* 11 SEND */}
      {step === 10 && (
        <div className={styles.card}>
          <h3>11. Send to Vendors</h3>
          <p className={styles.sub}>Vendors see it in their portal with details, scope, BOQ, commercial, terms and PDF — then Accept or Reject with audit.</p>
          {err && <p className={styles.err}>{err}</p>}
          <div className={styles.rowBtns}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={doSend} disabled={busy || !wo || wo.status === "ISSUED"}>
              {busy ? "Sending…" : "Send to selected vendors & Issue"}
            </button>
            {wo && <button className={styles.btn} onClick={() => navigate(`/admin/work-orders/${wo.id}`)}>Open Work Order →</button>}
          </div>
          <p className={styles.hint}>Vendor isolation enforced: each vendor sees only its own records.</p>
          <div className={styles.nav}><button className={styles.btn} onClick={back}>← Back</button><span /></div>
        </div>
      )}
    </div>
  );
}
