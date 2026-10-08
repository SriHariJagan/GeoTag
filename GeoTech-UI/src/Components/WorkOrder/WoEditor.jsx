import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiCheckCircle, FiChevronDown, FiX } from "react-icons/fi";
import ProjectAutocomplete from "./ProjectAutocomplete";
import { Popover, PopList, PopRow } from "./Picker";
import { eligibleVendors } from "../../api/procurement.api";
import { getSupervisors } from "../../api/supervisors.api";
import { getMachines } from "../../api/machines.api";
import { totalsOf } from "./docEngine";
import styles from "./Studio.module.css";

/**
 * Left-side corporate document editor. All changes flow up via onChange;
 * the A4 preview updates immediately (no save required to preview).
 */
export default function WoEditor({ doc, company, stdTerms, onChange, onRegenNumber, errors = {}, onSectionFocus, activeSection }) {
  const set = (patch) => onChange({ ...doc, ...patch });
  const totals = totalsOf(doc.items, doc.discount, doc.tax_amount, doc.other_charges);
  /* tab selection drives the preview highlight, so it flows through onSectionFocus */
  const shown = SECTIONS.some((s) => s.sec === activeSection) ? activeSection : "info";

  const go = (sec) => onSectionFocus && onSectionFocus(sec);

  const focusSec = (e) => {
    if (!onSectionFocus) return;
    const sec = e.target.closest?.("[data-section]")?.dataset?.section;
    if (sec) onSectionFocus(sec);
  };

  const errSections = new Set(
    Object.entries(errors)
      .map(([k]) => ({ _info: "info", _vendor: "vendor", _project: "project", _subject: "subject", _scope: "scope", _boq: "boq", _pay: "pay", _gen: "terms", _sig: "sig" }[k]))
      .filter(Boolean)
  );

  const doneCount = SECTIONS.filter((s) => !errSections.has(s.sec)).length;

  return (
    <div className={styles.editor} onFocusCapture={focusSec}>
      <div className={styles.tabBar}>
        <nav className={styles.tabs} aria-label="Work order sections">
          {SECTIONS.map((s) => (
            <button
              key={s.sec}
              type="button"
              className={`${styles.tab} ${shown === s.sec ? styles.tabOn : ""}`}
              onClick={() => go(s.sec)}
              title={s.label}
            >
              <span className={`${styles.tabNum} ${errSections.has(s.sec) ? "" : styles.tabNumOk}`}>{s.n}</span>
              <span className={styles.tabLabel}>{s.short}</span>
            </button>
          ))}
        </nav>
        <span className={styles.tabProgress}>
          <b>{doneCount}</b>/{SECTIONS.length} ready
        </span>
      </div>
      <EdSection sec="company" active={shown === "company"} title="Company Letterhead" hint="Printed at the top of every page">
        <div className={styles.companyCard}>
          {company.logo_url ? (
            <img src={`${import.meta.env.VITE_API_URL}/company-settings/logo`} alt="Company logo" />
          ) : (
            <span className={styles.companyMonogram}>{(company.company_name || "C").charAt(0)}</span>
          )}
          <div className={styles.companyCardMain}>
            <strong>{company.company_name || "Company not configured"}</strong>
            {company.tagline && <em>{company.tagline}</em>}
            <span>{[company.address_line1, company.address_line2].filter(Boolean).join(", ")}</span>
            <span>{[company.city, company.state, company.pin].filter(Boolean).join(", ")}</span>
            <span>{[company.phone, company.email, company.website].filter(Boolean).join("  |  ")}</span>
            {(company.gstin || company.pan) && (
              <span className={styles.companyTax}>{[company.gstin && `GSTIN ${company.gstin}`, company.pan && `PAN ${company.pan}`].filter(Boolean).join("  ·  ")}</span>
            )}
          </div>
          <Link className={styles.companyEdit} to="/admin/settings/company">Edit settings →</Link>
        </div>
      </EdSection>

      <EdSection sec="info" active={shown === "info"} title="Work Order Number & Date" hint="Appears under the title on page 1" error={errors._info}>
        <div className={styles.fGrid}>
          <label className={styles.fld}>Work Order Number *
            <div className={styles.fRow}>
              <input value={doc.work_order_number || ""} onChange={(e) => set({ work_order_number: e.target.value })} placeholder="Generated on project select" />
              <button type="button" className={styles.miniBtn} onClick={onRegenNumber} title="Regenerate from numbering settings">↻</button>
            </div>
          </label>
          <label className={styles.fld}>Work Order Date *
            <input type="date" value={doc.work_order_date || ""} onChange={(e) => set({ work_order_date: e.target.value })} />
          </label>
          <label className={styles.fld}>Work Type
            <input value={doc.work_type || ""} onChange={(e) => set({ work_type: e.target.value })} placeholder="e.g. Geotechnical Investigation" />
          </label>
          <label className={styles.fld}>Currency
            <select value={doc.currency || "INR"} onChange={(e) => set({ currency: e.target.value })}>
              {["INR", "USD", "EUR", "AED", "SAR"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </EdSection>

      <EdSection sec="project" active={shown === "project"} title="Project Particulars" hint="Printed as the project / client block" error={errors._project}>
        <ProjectAutocomplete
          value={doc._projectCode || ""}
          onSelect={(p) => onChange({ ...doc, project_id: p ? p.id : null, _projectCode: p ? p.project_code : "", _projectRow: p || null })}
          onReset={(typed) => onChange({ ...doc, project_id: null, _projectCode: typed, _projectRow: null })}
          placeholder="Type Project ID, e.g. GEO-2026…"
        />
        <div className={styles.fGrid} style={{ marginTop: 8 }}>
          <label className={styles.fld}>Project name (doc snapshot)
            <input value={doc.project_name || ""} onChange={(e) => set({ project_name: e.target.value })} />
          </label>
          <label className={styles.fld}>Client (doc snapshot)
            <input value={doc.client_name || ""} onChange={(e) => set({ client_name: e.target.value })} />
          </label>
          <label className={styles.fld}>Location (doc snapshot)
            <input value={doc.location || ""} onChange={(e) => set({ location: e.target.value })} />
          </label>
          <label className={styles.fld}>Site
            <input value={doc.site || ""} onChange={(e) => set({ site: e.target.value })} />
          </label>
        </div>
        <p className={styles.fieldNote}>These values are snapshotted on the document — later edits to the project will not change this work order.</p>
      </EdSection>

      <EdSection sec="vendor" active={shown === "vendor"} title="Vendor / Contractor" hint="Printed as the addressee block" error={errors._vendor}>
        <VendorPicker
          vendorId={doc.vendor_id}
          onPick={(v) => onChange({ ...doc, vendor_id: v ? v.id : null, _vendorRow: v || null })}
        />
        {doc._vendorRow && (
          <div className={styles.masterBox}>
            <span className={styles.tagMaster}>From vendor master</span>
            <VendorMasterCard row={doc._vendorRow} />
            <details className={styles.overrideBox}>
              <summary>Override for this document only</summary>
              <div className={styles.fGrid}>
                {["company", "address", "city", "state", "pin", "contact_person", "mobile", "email", "gstin", "pan"].map((k) => (
                  <label key={k} className={styles.fld}>{k.replace(/_/g, " ")}
                    <input
                      value={(doc.vendor_override || {})[k] || ""}
                      placeholder={String(doc._vendorRow[alias(k)] ?? "")}
                      onChange={(e) => set({ vendor_override: { ...(doc.vendor_override || {}), [k]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            </details>
          </div>
        )}

        <FieldGroup label="Also invite other vendors" hint="Optional — for competitive quotations">
          <div className={styles.chipRow}>
            {(doc.invited_vendor_ids || []).map((id) => (
              <span key={id} className={styles.chip}>
                Vendor #{id}
                <button
                  type="button"
                  onClick={() => onChange({ ...doc, invited_vendor_ids: (doc.invited_vendor_ids || []).filter((x) => x !== id) })}
                  aria-label="Remove invited vendor"
                >✕</button>
              </span>
            ))}
            {(doc.invited_vendor_ids || []).length === 0 && (
              <span className={styles.chipEmpty}>No other vendors invited</span>
            )}
          </div>
          <VendorPicker
            vendorId={null}
            onPick={(v) => {
              if (!v || (doc.invited_vendor_ids || []).includes(v.id)) return;
              onChange({ ...doc, invited_vendor_ids: [...(doc.invited_vendor_ids || []), v.id] });
            }}
          />
        </FieldGroup>
      </EdSection>

      <EdSection sec="team" active={shown === "team"} title="Project Team" hint="Assigned automatically when the vendor accepts">
        <p className={styles.teamHint}>
          Project may stay empty — supervisors and machinery chosen here are assigned to the
          project automatically when the vendor accepts. Only ACTIVE supervisors and
          available machines are accepted (backend enforced).
        </p>
        <TeamSupervisors value={doc.team_supervisors || []} onChange={(team_supervisors) => set({ team_supervisors })} />
        <TeamMachines value={doc.team_machines || []} onChange={(team_machines) => set({ team_machines })} />
      </EdSection>

      <EdSection sec="subject" active={shown === "subject"} title="Subject & Reference" hint="What this order covers" error={errors._subject}>
        <label className={styles.fld}>Subject *
          <input value={doc.subject || ""} onChange={(e) => set({ subject: e.target.value })} placeholder="Work Order for … at …" />
        </label>
        <label className={styles.fld}>Reference
          <input value={doc.reference || ""} onChange={(e) => set({ reference: e.target.value })} placeholder="e.g. Your quotation QT-118 dated …" />
        </label>
        <label className={styles.fld}>Introductory letter *
          <textarea rows={4} value={doc.intro_text || ""} onChange={(e) => set({ intro_text: e.target.value })} placeholder={"Dear Sir,\n\nWe are pleased to award…"} />
        </label>
      </EdSection>

      <EdSection sec="scope" active={shown === "scope"} title="Scope of Work" hint="One line per activity" error={errors._scope}>
        <label className={styles.fld}>Scope *
          <textarea rows={4} value={doc.scope_of_work || ""} onChange={(e) => set({ scope_of_work: e.target.value })} placeholder="Detailed scope…" />
        </label>
        <div className={styles.fGrid}>
          <label className={styles.fld}>Start date
            <input type="date" value={doc.start_date || ""} onChange={(e) => set({ start_date: e.target.value })} />
          </label>
          <label className={styles.fld}>End date
            <input type="date" value={doc.end_date || ""} onChange={(e) => set({ end_date: e.target.value })} />
          </label>
        </div>
      </EdSection>

      <EdSection sec="boq" active={shown === "boq"} title="Work Items & Pricing" hint="Quantities, rates and totals" error={errors._boq}>
        <BoqEditor items={doc.items || []} onChange={(items) => set({ items })} currency={doc.currency || "INR"} />

        <div className={styles.totCard}>
          <div className={styles.totRow}>
            <label className={styles.fld}>
              Discount
              <input type="number" min="0" value={doc.discount ?? 0} onChange={(e) => set({ discount: e.target.value })} />
            </label>
            <label className={styles.fld}>
              Tax / GST
              <input type="number" min="0" value={doc.tax_amount ?? 0} onChange={(e) => set({ tax_amount: e.target.value })} />
            </label>
            <label className={styles.fld}>
              Other charges
              <input type="number" min="0" value={doc.other_charges ?? 0} onChange={(e) => set({ other_charges: e.target.value })} />
            </label>
          </div>
          <div className={styles.totLines}>
            <div className={styles.totLine}><span>Subtotal</span><b>{totals.subtotal.toLocaleString()}</b></div>
            {Number(doc.discount) > 0 && (
              <div className={styles.totLine}><span>Less discount</span><b>− {Number(doc.discount).toLocaleString()}</b></div>
            )}
            {Number(doc.tax_amount) > 0 && (
              <div className={styles.totLine}><span>Tax / GST</span><b>+ {Number(doc.tax_amount).toLocaleString()}</b></div>
            )}
            {Number(doc.other_charges) > 0 && (
              <div className={styles.totLine}><span>Other charges</span><b>+ {Number(doc.other_charges).toLocaleString()}</b></div>
            )}
            <div className={styles.totGrand}>
              <span>Grand total</span>
              <strong>{totals.grand.toLocaleString()} <i>{doc.currency || "INR"}</i></strong>
            </div>
          </div>
          <p className={styles.totNote}>Server recalculates and signs off these totals when you save.</p>
        </div>
      </EdSection>

      <EdSection sec="pay" active={shown === "pay"} title="Payment Terms" hint="Milestones and commercial terms" error={errors._pay}>
        <NumberedEditor
          items={doc.payment_terms_list || []}
          onChange={(payment_terms_list) => set({ payment_terms_list })}
          placeholder="e.g. Mobilization shall be paid after rigs reach site."
          addLabel="+ Add Payment Term"
        />
        <div className={styles.fGrid} style={{ marginTop: 8 }}>
          <label className={styles.fld}>Payment terms (legacy text, optional)
            <input value={doc.payment_terms || ""} onChange={(e) => set({ payment_terms: e.target.value })} />
          </label>
          <label className={styles.fld}>Validity (days)
            <input type="number" min="0" value={doc.validity_days ?? ""} onChange={(e) => set({ validity_days: e.target.value })} />
          </label>
          <label className={styles.fld}>Completion period
            <input value={doc.completion_period || ""} onChange={(e) => set({ completion_period: e.target.value })} />
          </label>
          <label className={styles.fld}>Retention %
            <input type="number" min="0" max="100" value={doc.retention_percent ?? ""} onChange={(e) => set({ retention_percent: e.target.value })} />
          </label>
          <label className={styles.fld}>Taxes
            <input value={doc.tax_terms || ""} onChange={(e) => set({ tax_terms: e.target.value })} />
          </label>
          <label className={styles.fld}>Delivery
            <input value={doc.delivery_terms || ""} onChange={(e) => set({ delivery_terms: e.target.value })} />
          </label>
        </div>
      </EdSection>

      <EdSection sec="terms" active={shown === "terms"} title="Terms & Conditions" hint="Append from the standard library" error={errors._gen}>
        {(stdTerms || []).length > 0 && (
          <div className={styles.libBox}>
            <span>Standard Terms Library — tick to append:</span>
            <div className={styles.libList}>
              {(stdTerms || []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={styles.libItem}
                  onClick={() => set({ general_terms: [...(doc.general_terms || []), `${t.title}: ${t.body}`] })}
                  title={t.body}
                >
                  + {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <NumberedEditor
          items={doc.general_terms || []}
          onChange={(general_terms) => set({ general_terms })}
          placeholder="e.g. The quoted rates shall remain unchanged…"
          addLabel="+ Add Term"
        />
        <label className={styles.fld} style={{ marginTop: 8 }}>Special conditions
          <textarea rows={2} value={doc.special_conditions || ""} onChange={(e) => set({ special_conditions: e.target.value })} />
        </label>
      </EdSection>

      <EdSection sec="accept" active={shown === "accept"} title="Acceptance Statement" hint="Vendor sign-off wording">
        <label className={styles.fld}>Acceptance text
          <textarea rows={3} value={doc.acceptance_text || ""} onChange={(e) => set({ acceptance_text: e.target.value })} />
        </label>
      </EdSection>

      <EdSection sec="sig" active={shown === "sig"} title="Signatories" hint="Printed on the document" error={errors._sig}>
        <div className={styles.fGrid}>
          <label className={styles.fld}>Company signatory name *
            <input value={doc.signer_name || ""} onChange={(e) => set({ signer_name: e.target.value })} />
          </label>
          <label className={styles.fld}>Company designation
            <input value={doc.signer_designation || ""} onChange={(e) => set({ signer_designation: e.target.value })} />
          </label>
          <label className={styles.fld}>Vendor signatory name
            <input value={doc.vendor_signer_name || ""} onChange={(e) => set({ vendor_signer_name: e.target.value })} />
          </label>
          <label className={styles.fld}>Vendor designation
            <input value={doc.vendor_signer_designation || ""} onChange={(e) => set({ vendor_signer_designation: e.target.value })} />
          </label>
        </div>
      </EdSection>

      
    </div>
  );
}

const alias = (k) => ({
  company: "company", address: "address", city: "city", state: "state", pin: "postal_code",
  contact_person: "contact_person", mobile: "phone", email: "email", gstin: "gstin", pan: "pan",
}[k] || k);

/* Order mirrors docEngine.buildBlocks exactly, so tab N edits the same
   block that appears Nth on the printed A4 page. */
const SECTIONS = [
  { sec: "company", n: 1, label: "Company Letterhead", short: "Letterhead" },
  { sec: "info", n: 2, label: "Work Order Number & Date", short: "Number" },
  { sec: "project", n: 3, label: "Project Particulars", short: "Project" },
  { sec: "vendor", n: 4, label: "Vendor / Contractor", short: "Vendor" },
  { sec: "team", n: 5, label: "Project Team", short: "Team" },
  { sec: "subject", n: 6, label: "Subject & Reference", short: "Subject" },
  { sec: "scope", n: 7, label: "Scope of Work", short: "Scope" },
  { sec: "boq", n: 8, label: "Work Items & Pricing", short: "Items" },
  { sec: "pay", n: 9, label: "Payment Terms", short: "Payment" },
  { sec: "terms", n: 10, label: "Terms & Conditions", short: "Terms" },
  { sec: "accept", n: 11, label: "Acceptance Statement", short: "Accept" },
  { sec: "sig", n: 12, label: "Authorised Signatories", short: "Sign" },
];

/** Titled group box inside a section, so related fields read as one block. */
function FieldGroup({ label, hint, children }) {
  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className={styles.groupBody}>{children}</div>
    </div>
  );
}

/** One step of the editor. Only the active step is mounted, so the panel never scrolls as a whole. */
function EdSection({ sec, title, hint, error, active, children }) {
  if (!active) return null;
  return (
    <section className={styles.edSec} data-section={sec}>
      <div className={styles.edHeadStatic}>
        <div className={styles.edHeadText}>
          <span className={styles.edTitle}>{title}</span>
          {hint && <span className={styles.edHint}>{hint}</span>}
        </div>
        {error ? (
          <span className={styles.edErr}>! {error}</span>
        ) : (
          <span className={styles.edOk}>Complete</span>
        )}
      </div>
      <div className={styles.edBody}>{children}</div>
    </section>
  );
}

function VendorMasterCard({ row }) {
  return (
    <div className={styles.vendorCard}>
      <strong>{row.company}</strong>
      <span className={styles.mono}>{row.vendor_code}</span>
      <span>{[row.address, row.city, row.state, row.postal_code].filter(Boolean).join(", ")}</span>
      <span>{[row.contact_person, row.phone, row.email].filter(Boolean).join(" · ")}</span>
      {row.gstin && <span>GSTIN: {row.gstin}</span>}
    </div>
  );
}

function VendorPicker({ vendorId, onPick }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const anchorRef = useRef(null);
  const selected = rows.find((v) => v.id === vendorId);

  const load = useCallback(async (term) => {
    setLoading(true);
    try {
      const r = await eligibleVendors({ search: term || undefined, limit: 50 });
      setRows(r.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q), q ? 250 : 0);
    return () => timer.current && clearTimeout(timer.current);
  }, [q, load]);

  const show = () => {
    setOpen(true);
    if (!rows.length) load(q);
  };

  return (
    <>
      <div className={styles.vPicker}>
        <input
          ref={anchorRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={show}
          placeholder={selected ? selected.company : "Search vendor — name, code, phone"}
          aria-label="Search vendor"
        />
        <button type="button" className={styles.vToggle} onClick={() => (open ? setOpen(false) : show())} aria-label="Show vendors" tabIndex={-1}>
          <FiChevronDown />
        </button>
        {vendorId && (
          <button type="button" className={styles.vClearX} onClick={() => { onPick(null); setQ(""); }} title="Clear vendor" aria-label="Clear vendor">
            <FiX />
          </button>
        )}
      </div>

      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} maxHeight={340}>
        <PopList
          query={q}
          onQuery={setQ}
          placeholder="Search by name, code, phone or email…"
          loading={loading}
          empty={rows.length === 0 ? "No eligible (ACTIVE) vendor found." : ""}
          footer={
            <span className={styles.popHint}>
              {rows.length} result{rows.length === 1 ? "" : "s"} · scroll to see more · Esc to close
            </span>
          }
        >
          {rows.map((v) => (
            <PopRow
              key={v.id}
              selected={v.id === vendorId}
              onClick={() => { onPick(v); setOpen(false); setQ(""); }}
              title={v.company}
              meta={`${v.vendor_code || "—"} · ${[v.phone, v.email].filter(Boolean).join(" · ") || "no contact"}`}
              right={<FiCheckCircle />}
            />
          ))}
        </PopList>
      </Popover>
    </>
  );
}

function BoqEditor({ items, onChange, currency = "INR" }) {
  const setRow = (i, patch) => onChange(items.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () =>
    onChange([
      ...items,
      { item_number: String(items.length + 1), description: "", sub_description: "", unit: "lot", quantity: 1, unit_rate: 0 },
    ]);
  const dup = (i) => {
    const next = [...items];
    next.splice(i + 1, 0, { ...items[i], description: `${items[i].description || ""} (copy)` });
    onChange(next.map((r, j) => ({ ...r, item_number: String(j + 1) })));
  };

  const sum = items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_rate) || 0), 0);
  const filled = items.filter((r) => (r.description || "").trim()).length;

  return (
    <div className={styles.boqWrap}>
      <div className={styles.boqHead}>
        <span className={styles.boqHeadTitle}>
          <b>{items.length}</b> item{items.length === 1 ? "" : "s"}
          {items.length > 0 && <em>{filled} complete · {Number(sum).toLocaleString()}</em>}
        </span>
        <button type="button" className={styles.boqAdd} onClick={add}>
          + Add work item
        </button>
      </div>

      {items.length === 0 && (
        <div className={styles.boqEmpty}>
          <span>No work items yet</span>
          <p>Add each item you are awarding — description, quantity, unit and rate.</p>
          <button type="button" className={styles.boqAdd} onClick={add}>+ Add the first item</button>
        </div>
      )}

      <div className={styles.boqList}>
        {items.map((it, i) => {
          const amount = (Number(it.quantity) || 0) * (Number(it.unit_rate) || 0);
          const pct = amount > 0 ? (amount / Math.max(1, items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_rate) || 0), 0))) * 100 : 0;
          return (
            <div key={i} className={styles.boqCard}>
              <div className={styles.boqCardTop}>
                <span className={styles.boqNum}>{it.item_number || i + 1}</span>
                <input
                  className={styles.boqUnit}
                  value={it.unit || ""}
                  onChange={(e) => setRow(i, { unit: e.target.value })}
                  placeholder="unit"
                  aria-label={`Unit for item ${i + 1}`}
                />
                <div className={styles.boqTools}>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button type="button" onClick={() => dup(i)} title="Duplicate item">⧉</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down">↓</button>
                  <button
                    type="button" className={styles.boqDel}
                    onClick={() => onChange(items.filter((_, j) => j !== i))}
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <textarea
                rows={2}
                className={styles.boqDesc}
                value={it.description || ""}
                onChange={(e) => setRow(i, { description: e.target.value })}
                placeholder="Describe the work — e.g. Borehole No. 1, 0–30 m using DTH rig"
              />
              <input
                className={styles.boqSub}
                value={it.sub_description || ""}
                onChange={(e) => setRow(i, { sub_description: e.target.value })}
                placeholder="Additional note (optional)"
              />

              <div className={styles.boqNums}>
                <label>
                  <span>Qty</span>
                  <input type="number" min="0" value={it.quantity ?? ""} onChange={(e) => setRow(i, { quantity: e.target.value })} />
                </label>
                <label>
                  <span>Rate</span>
                  <input type="number" min="0" value={it.unit_rate ?? ""} onChange={(e) => setRow(i, { unit_rate: e.target.value })} />
                </label>
                <div className={styles.boqAmtBox}>
                  <span>Amount</span>
                  <strong>{amount.toLocaleString()}</strong>
                  <i style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <button type="button" className={styles.boqAddWide} onClick={add}>
          + Add another work item
        </button>
      )}
    </div>
  );
}

function TeamSupervisors({ value, onChange }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const anchorRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    getSupervisors()
      .then((r) => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const ql = q.trim().toLowerCase();
  const filtered = (rows || []).filter(
    (u) =>
      !value.includes(u.id) &&
      (!ql ||
        (u.name || "").toLowerCase().includes(ql) ||
        (u.email || "").toLowerCase().includes(ql) ||
        String(u.id) === ql)
  );
  const byId = (id) => (rows || []).find((u) => u.id === id);
  const show = () => { setOpen(true); if (!rows.length) load(); };

  return (
    <div className={styles.teamBox}>
      <span className={styles.teamHint}>Supervisors — only ACTIVE accounts can be assigned</span>
      {(value || []).map((id) => {
        const u = byId(id);
        const inactive = u && u.account_status && u.account_status !== "ACTIVE";
        return (
          <div key={id} className={`${styles.teamRow} ${inactive ? styles.teamRowWarn : ""}`}>
            <span className={styles.teamAvatar}>{(u?.name || "?").charAt(0).toUpperCase()}</span>
            <span className={styles.teamRowMain}>
              <strong>{u ? u.name : `User #${id}`}</strong>
              <em>{u?.email || "email unavailable"}</em>
            </span>
            {inactive && <span className={styles.teamWarnTag}>{u.account_status}</span>}
            <button type="button" className={styles.teamRemove} onClick={() => onChange(value.filter((x) => x !== id))} title="Remove" aria-label="Remove supervisor">
              <FiX />
            </button>
          </div>
        );
      })}

      <div className={styles.vPicker}>
        <input
          ref={anchorRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={show}
          placeholder="Add supervisor — name or email"
          aria-label="Add supervisor"
        />
        <button type="button" className={styles.vToggle} onClick={() => (open ? setOpen(false) : show())} aria-label="Show supervisors" tabIndex={-1}>
          <FiChevronDown />
        </button>
      </div>

      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} maxHeight={330}>
        <PopList
          query={q}
          onQuery={setQ}
          placeholder="Search supervisors by name or email…"
          loading={loading}
          empty={filtered.length === 0 ? "No matching supervisor." : ""}
          footer={
            <span className={styles.popHint}>
              {filtered.length} available · Esc to close
            </span>
          }
        >
          {filtered.map((u) => (
            <PopRow
              key={u.id}
              onClick={() => { onChange([...value, u.id]); setQ(""); }}
              title={u.name}
              meta={`${u.email || "no email"} · user #${u.id}`}
              right={
                u.account_status && u.account_status !== "ACTIVE"
                  ? <span className={styles.popTagWarn}>{u.account_status}</span>
                  : <span className={styles.popTagOk}>ACTIVE</span>
              }
            />
          ))}
        </PopList>
      </Popover>
    </div>
  );
}

function TeamMachines({ value, onChange }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const anchorRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    getMachines()
      .then((r) => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const picked = new Set((value || []).map((e) => e.machine_id));
  const ql = q.trim().toLowerCase();
  const filtered = (rows || []).filter(
    (m) =>
      !picked.has(m.id) &&
      (!ql || (m.machine_name || "").toLowerCase().includes(ql) || (m.machine_type || "").toLowerCase().includes(ql))
  );

  const setRate = (mid, rate) =>
    onChange((value || []).map((e) => (e.machine_id === mid ? { ...e, rate_per_day: rate } : e)));
  const show = () => { setOpen(true); if (!rows.length) load(); };

  return (
    <div className={styles.teamBox} style={{ marginTop: 8 }}>
      <span className={styles.teamHint}>Machinery with per-day price (defaults to machine master rate)</span>
      {(value || []).map((e) => {
        const m = (rows || []).find((x) => x.id === e.machine_id);
        const hasRate = e.rate_per_day !== "" && e.rate_per_day != null;
        return (
          <div key={e.machine_id} className={styles.teamRow}>
            <span className={styles.teamAvatar}>{(e.machine_name || m?.machine_name || "M").charAt(0).toUpperCase()}</span>
            <span className={styles.teamRowMain}>
              <strong>{e.machine_name || m?.machine_name || `Machine #${e.machine_id}`}</strong>
              <em>{m?.machine_type || "machinery"}</em>
            </span>
            <label className={styles.teamRate}>
              <input
                type="number" min="0" step="0.01" placeholder="0"
                value={e.rate_per_day ?? ""}
                onChange={(ev) => setRate(e.machine_id, ev.target.value)}
                title="Rate per day for this work order"
              />
              <i>/day</i>
            </label>
            {!hasRate && <span className={styles.teamWarnTag}>NO RATE</span>}
            <button type="button" className={styles.teamRemove} onClick={() => onChange((value || []).filter((x) => x.machine_id !== e.machine_id))} title="Remove" aria-label="Remove machine">
              <FiX />
            </button>
          </div>
        );
      })}

      <div className={styles.vPicker}>
        <input
          ref={anchorRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={show}
          placeholder="Add machinery — name or type"
          aria-label="Add machinery"
        />
        <button type="button" className={styles.vToggle} onClick={() => (open ? setOpen(false) : show())} aria-label="Show machinery" tabIndex={-1}>
          <FiChevronDown />
        </button>
      </div>

      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} maxHeight={330}>
        <PopList
          query={q}
          onQuery={setQ}
          placeholder="Search machinery by name or type…"
          loading={loading}
          empty={filtered.length === 0 ? "No matching machine." : ""}
          footer={
            <span className={styles.popHint}>
              {filtered.length} available · Esc to close
            </span>
          }
        >
          {filtered.map((m) => (
            <PopRow
              key={m.id}
              onClick={() => { onChange([...(value || []), { machine_id: m.id, machine_name: m.machine_name, rate_per_day: m.rate_per_day ?? "" }]); setQ(""); }}
              title={m.machine_name}
              meta={`${m.machine_type || "machinery"}${m.rate_per_day != null ? ` · master rate ${Number(m.rate_per_day).toLocaleString()}/day` : " · no master rate"}`}
              right={
                m.status && m.status !== "AVAILABLE"
                  ? <span className={styles.popTagWarn}>{m.status}</span>
                  : <span className={styles.popTagOk}>{m.rate_per_day != null ? `${Number(m.rate_per_day).toLocaleString()}/day` : "AVAILABLE"}</span>
              }
            />
          ))}
        </PopList>
      </Popover>
    </div>
  );
}

export function NumberedEditor({ items, onChange, placeholder, addLabel }) {
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      {(items || []).map((t, i) => (
        <div key={i} className={styles.termRow}>
          <span className={styles.termNum}>{i + 1}.</span>
          <textarea rows={2} value={t} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder={placeholder} />
          <div className={styles.rowBtns}>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down">↓</button>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} title="Delete">✕</button>
          </div>
        </div>
      ))}
      <button type="button" className={styles.miniBtn} onClick={() => onChange([...(items || []), ""])}>
        {addLabel || "+ Add"}
      </button>
    </div>
  );
}
