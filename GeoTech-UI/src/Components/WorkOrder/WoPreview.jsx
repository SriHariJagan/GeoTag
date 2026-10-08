import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  A4_W, CONTENT_W, PAGE_CAP, BLOCKS, buildBlocks, packBlocks,
} from "./docEngine";
import styles from "./Studio.module.css";

const money = (v) => (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Live print-accurate A4 preview. Blocks are measured in a hidden measurer at
 * exact content width, then greedy-packed into pages (rows/terms never split,
 * BOQ header repeats, signatures stay whole, footer + page numbers per page).
 */
/* Editor section -> printed block. Keys match SECTIONS order in WoEditor. */
const SECTION_BLOCK = {
  company: BLOCKS.HEADER,
  info: BLOCKS.TITLE,
  project: BLOCKS.META,
  vendor: BLOCKS.VENDOR,
  subject: BLOCKS.SUBJECT,
  scope: BLOCKS.SCOPE,
  boq: BLOCKS.BOQ_HEAD,
  pay: BLOCKS.SEC_HEAD,
  terms: BLOCKS.SEC_HEAD,
  accept: BLOCKS.ACCEPT,
  sig: BLOCKS.SIG,
};

export default function WoPreview({ view, zoom, onZoom, activeSection }) {
  const blocks = useMemo(() => buildBlocks(view), [view]);
  const measureRef = useRef(null);
  const [heights, setHeights] = useState([]);
  const pageRefs = useRef([]);
  const anchorRefs = useRef({});

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const hs = Array.from(el.children).map((c) => c.offsetHeight || 0);
    setHeights((prev) => (prev.length === hs.length && prev.every((h, i) => h === hs[i]) ? prev : hs));
  });

  const { pages } = useMemo(() => {
    if (!heights.length || heights.length !== blocks.length) return { pages: [blocks.map((_, i) => i)] };
    return packBlocks(blocks, heights, PAGE_CAP);
  }, [blocks, heights]);

  // highlight the preview section matching the editor focus (typing => glow)
  const hlIndex = useMemo(() => {
    if (!activeSection) return -1;
    const want = SECTION_BLOCK[activeSection];
    if (!want) return -1;
    if (activeSection === "pay" || activeSection === "terms") {
      const title = activeSection === "pay" ? "Payment Terms" : "General Terms";
      const i = blocks.findIndex((b) => b.type === BLOCKS.SEC_HEAD && (b.title || "").startsWith(title.split(" ")[0]));
      if (i >= 0) return i;
    }
    return blocks.findIndex((b) => b.type === want);
  }, [blocks, activeSection]);

  useLayoutEffect(() => {
    if (hlIndex < 0) return;
    const t = setTimeout(() => {
      anchorRefs.current[hlIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    return () => clearTimeout(t);
  }, [hlIndex, pages]);

  const gotoPage = (i) => {
    const el = pageRefs.current[i];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.previewWrap}>
      <div className={styles.previewBar}>
        <div className={styles.zoomGroup}>
          <button className={styles.toolBtn} onClick={() => onZoom(Math.max(0.4, +(zoom - 0.1).toFixed(2)))}>−</button>
          <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
          <button className={styles.toolBtn} onClick={() => onZoom(Math.min(1.6, +(zoom + 0.1).toFixed(2)))}>+</button>
          <button className={styles.toolBtnWide} onClick={() => onZoom("fit")}>Fit width</button>
        </div>
        <div className={styles.zoomGroup}>
          <button className={styles.toolBtn} onClick={() => gotoPage(0)} title="First page">⇤</button>
          <span className={pages.length <= 2 ? styles.pageOk : styles.pageWarn}>
            {pages.length} page{pages.length === 1 ? "" : "s"}
            {pages.length > 2 && " — consider trimming"}
          </span>
          <button className={styles.toolBtn} onClick={() => gotoPage(pages.length - 1)} title="Last page">⇥</button>
        </div>
      </div>

      {/* hidden measurer at exact print content width */}
      <div ref={measureRef} className={styles.measurer} style={{ width: CONTENT_W }} aria-hidden>
        {blocks.map((b, i) => (
          <div key={b.key} className={styles.measureBlock}>
            <BlockView block={b} view={view} index={i} repeatHead={false} />
          </div>
        ))}
      </div>

      <div className={styles.pages} style={{ zoom }}>
        {pages.map((page, pi) => (
          <section
            key={pi}
            ref={(el) => { pageRefs.current[pi] = el; }}
            className={styles.a4}
            style={{ width: A4_W }}
          >
            <div className={styles.a4Body}>
              {pi > 0 && <div className={styles.dContHead}>WORK ORDER · {view.work_order_number || "—"} (continued)</div>}
              {page.repeatHead && <BoqHead />}
              {page.map((bi) => (
                <div
                  key={blocks[bi].key}
                  ref={(el) => { if (bi === hlIndex && el) anchorRefs.current[bi] = el; }}
                  className={`${styles.secAnchor} ${bi === hlIndex ? styles.secHl : ""}`}
                >
                  <BlockView block={blocks[bi]} view={view} index={bi} repeatHead={false} />
                </div>
              ))}
            </div>
            <footer className={styles.a4Foot}>
              <span className={styles.dFootCo}>{footLine(view.company)}</span>
              <span className={styles.dFootRef}>{view.work_order_number} · v{view.version || 1}</span>
              <span className={styles.dFootPg}>Page {pi + 1} / {pages.length}</span>
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}

function footLine(company = {}) {
  return [company.phone, company.email, company.website].filter(Boolean).join("  |  ");
}

/* ---------- block rendering (mirrors backend PDF section-for-section) ---------- */

function BlockView({ block, view, repeatHead }) {
  const { type } = block;
  switch (type) {
    case BLOCKS.HEADER: return <DocHeader company={view.company} />;
    case BLOCKS.TITLE: return <DocTitle wo={view} />;
    case BLOCKS.META: return <DocMeta view={view} />;
    case BLOCKS.VENDOR: return <DocVendor vendor={view.vendor} />;
    case BLOCKS.SUBJECT: return <DocSubject wo={view} />;
    case BLOCKS.INTRO: return <SecPara title="Introduction" text={view.intro_text} />;
    case BLOCKS.SCOPE: return <SecPara title="Scope of Work" text={view.scope_of_work} />;
    case BLOCKS.BOQ_HEAD: return <BoqHead />;
    case BLOCKS.ROW: return <BoqRow item={(view.items || [])[block.index]} n={block.index + 1} />;
    case BLOCKS.TOTALS: return <BoqTotals view={view} />;
    case BLOCKS.SEC_HEAD: return <h3 className={styles.dH}>{block.title}</h3>;
    case BLOCKS.TERM: return <NumberedTerm view={view} block={block} />;
    case BLOCKS.ACCEPT: return (
      <div>
        <h3 className={styles.dH}>Acceptance</h3>
        <p className={styles.dJust}>{view.acceptance_text}</p>
      </div>
    );
    case BLOCKS.SIG: return <SigBlock view={view} />;
    default: return null;
  }
}

function DocHeader({ company = {} }) {
  return (
    <div className={styles.dHeader}>
      <div className={styles.dLogo}>
        {company.logo_url ? (
          <img src={`${import.meta.env.VITE_API_URL}/company-settings/logo`} alt="logo" />
        ) : (
          <span className={styles.dMonogram}>{(company.company_name || "C").charAt(0)}</span>
        )}
      </div>
      <div className={styles.dCompany}>
        <strong>{company.company_name || "Company Name"}</strong>
        {company.tagline && <span className={styles.dTag}>{company.tagline}</span>}
        <span className={styles.dAddr}>{[company.address_line1, company.address_line2].filter(Boolean).join(", ")}</span>
        <span className={styles.dAddr}>{[company.city, company.state, company.pin].filter(Boolean).join(", ")}</span>
        <span className={styles.dAddr}>{[company.phone, company.email, company.website].filter(Boolean).join("  |  ")}</span>
      </div>
      <div className={styles.dReg}>
        {company.gstin && <span>GSTIN: {company.gstin}</span>}
        {company.pan && <span>PAN: {company.pan}</span>}
      </div>
    </div>
  );
}

function DocTitle({ wo }) {
  return (
    <div className={styles.dTitleWrap}>
      <div className={styles.dTitleMain}>
        <h1 className={styles.dTitle}>WORK ORDER</h1>
        <span className={styles.dDocNo}>{wo.work_order_number || "—"}</span>
      </div>
      <div className={styles.dTitleMeta}>
        <span><i>Date</i>{wo.work_order_date || "—"}</span>
        <span><i>Ver</i>{wo.version || 1}</span>
        <span><i>Currency</i>{wo.currency || "INR"}</span>
        <span className={styles.dStamp}>{wo.status || "DRAFT"}</span>
      </div>
    </div>
  );
}

function DocMeta({ view }) {
  const p = view.project || {};
  const cells = [
    ["Project", view.project_name || p.name || "-"],
    ["Project ID", p.project_code || "-"],
    ["Client", view.client_name || p.client_name || "-"],
    ["Location", `${view.location || p.location || "-"}${view.site ? ` · ${view.site}` : ""}`],
    ["Work Type", view.work_type || "-"],
    ["Period", `${view.start_date || "?"} to ${view.end_date || "?"}`],
  ];
  return (
    <div className={styles.dMetaGrid}>
      {cells.map(([k, v]) => (
        <div key={k} className={styles.dMetaCell}>
          <span>{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

function DocVendor({ vendor = {} }) {
  const addr = [vendor.address, vendor.city, vendor.state, vendor.pin].filter(Boolean).join(", ");
  const contact = [vendor.contact_person, vendor.mobile && `Mob: ${vendor.mobile}`, vendor.email].filter(Boolean).join(" · ");
  const reg = [vendor.gstin && `GSTIN: ${vendor.gstin}`, vendor.pan && `PAN: ${vendor.pan}`].filter(Boolean).join("   ·   ");
  return (
    <div>
      <h3 className={styles.dH}>Vendor / Contractor</h3>
      <div className={styles.dVendorBox}>
        <div className={styles.dVendorHead}>
          <strong>{vendor.company || "-"}</strong>
          {vendor.vendor_code && <span className={styles.dChip}>/ {vendor.vendor_code}</span>}
        </div>
        <div className={styles.dVendorCols}>
          {addr && <span>{addr}</span>}
          {contact && <span>{contact}</span>}
        </div>
        {reg && <span className={styles.dVendorReg}>{reg}</span>}
      </div>
    </div>
  );
}

function DocSubject({ wo }) {
  return (
    <div>
      <h3 className={styles.dH}>Subject</h3>
      <p className={styles.dSubject}><b>{wo.subject}</b></p>
      {wo.reference && <p className={styles.dRef}><b>Reference:</b> {wo.reference}</p>}
    </div>
  );
}

function SecPara({ title, text }) {
  return (
    <div>
      <h3 className={styles.dH}>{title}</h3>
      {(text || "").split("\n").map((ln, i) => (
        <p key={i} className={styles.dJust}>{ln || <br />}</p>
      ))}
    </div>
  );
}

function BoqHead() {
  return (
    <table className={styles.dBoq}>
      <colgroup>
        <col style={{ width: 34 }} />
        <col />
        <col style={{ width: 52 }} />
        <col style={{ width: 52 }} />
        <col style={{ width: 76 }} />
        <col style={{ width: 88 }} />
      </colgroup>
      <thead>
        <tr><th>S.No.</th><th>Description</th><th className={styles.num}>Qty</th><th>Unit</th><th className={styles.num}>Rate</th><th className={styles.num}>Amount</th></tr>
      </thead>
    </table>
  );
}

function BoqRow({ item = {}, n }) {
  return (
    <table className={styles.dBoq}>
      <tbody>
        <tr>
          <td>{item.item_number || n}</td>
          <td>
            <div>{item.description}</div>
            {item.sub_description && <div className={styles.dNote}>{item.sub_description}</div>}
          </td>
          <td className={styles.num}>{item.quantity ?? "-"}</td>
          <td>{item.unit || ""}</td>
          <td className={styles.num}>{money(item.unit_rate)}</td>
          <td className={styles.num}>{money((Number(item.quantity) || 0) * (Number(item.unit_rate) || 0))}</td>
        </tr>
      </tbody>
    </table>
  );
}

function BoqTotals({ view }) {
  const t = view.totals || { subtotal: 0, grand: 0 };
  return (
    <div className={styles.dTotWrap}>
      <table className={styles.dTotals}>
        <tbody>
          <tr><td>Subtotal</td><td className={styles.num}>{money(t.subtotal)}</td></tr>
          {Number(view.discount) > 0 && <tr><td>Less: Discount</td><td className={styles.num}>− {money(view.discount)}</td></tr>}
          {Number(view.tax_amount) > 0 && <tr><td>Add: Tax / GST</td><td className={styles.num}>{money(view.tax_amount)}</td></tr>}
          {Number(view.other_charges) > 0 && <tr><td>Add: Other charges</td><td className={styles.num}>{money(view.other_charges)}</td></tr>}
        </tbody>
      </table>
      <div className={styles.dGrand}>
        <span>GRAND TOTAL</span>
        <strong>{money(t.grand)} <i>{view.currency || "INR"}</i></strong>
      </div>
    </div>
  );
}

function NumberedTerm({ view, block }) {
  const { list, index } = block;
  let text = "";
  let n = index + 1;
  if (list === "pay") text = (view.payment_terms_list || [])[index];
  else if (list === "gen") text = (view.general_terms || [])[index];
  else if (list === "std") { text = view.standard_terms; n = 1; }
  else if (list === "custom") { text = view.custom_terms; n = 1; }
  else if (list === "special") { text = view.special_conditions; n = 1; }
  if (!text) return null;
  return <p className={styles.dTerm}><b>{n}.</b> {text}</p>;
}

function SigBlock({ view }) {
  const c = view.company || {};
  const v = view.vendor || {};
  return (
    <div>
      <h3 className={styles.dH}>Authorised Signatories</h3>
      <div className={styles.dSigGrid}>
        <div className={styles.dSigBox}>
          <div className={styles.dSigHead}>For {c.company_name || "Company"}</div>
          <div className={styles.dSigNames}>
            <strong>{view.signer_name || " "}</strong>
            <span>{view.signer_designation || "Authorised Signatory"}</span>
          </div>
          <div className={styles.dSigLine} />
          <div className={styles.dSigFoot}>
            {view.signed_at ? `Signed ${new Date(view.signed_at).toLocaleDateString()}` : "Signature & date"}
          </div>
          {view.stamp_data || view.stamped_at ? (
            <div className={styles.dSeal}>STAMPED</div>
          ) : (
            <div className={styles.dSealSpace} />
          )}
        </div>
        <div className={styles.dSigBox}>
          <div className={styles.dSigHead}>For {v.company || "Vendor"}</div>
          <div className={styles.dSigNames}>
            <strong>{view.vendor_signer_name || v.contact_person || " "}</strong>
            <span>{view.vendor_signer_designation || "Authorised Signatory"}</span>
          </div>
          <div className={styles.dSigLine} />
          <div className={styles.dSigFoot}>Signature &amp; date</div>
          <div className={styles.dSealSpace} />
        </div>
      </div>
    </div>
  );
}
