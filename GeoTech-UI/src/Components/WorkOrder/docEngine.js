// Pure A4 document engine: block building + greedy page packing.
// No DOM here — measurement happens in WoPreview via a hidden measurer,
// this module only packs pre-measured heights. Fully unit-testable.

export const A4_W = 794;
export const A4_H = 1123;
export const CONTENT_W = 706; // 794 - 2*44px margins
export const PAGE_CAP = 1042; // 1123 - 34 top - ~47 bottom/footer reserve

// Block types in document order (mirrors backend PDF section-for-section).
export const BLOCKS = {
  HEADER: "header",
  TITLE: "title",
  META: "meta",
  VENDOR: "vendor",
  SUBJECT: "subject",
  INTRO: "intro",
  SCOPE: "scope",
  BOQ_HEAD: "boqHead",
  ROW: "row",
  TOTALS: "totals",
  SEC_HEAD: "secHead", // payment/general/acceptance/commercial headings
  TERM: "term", // one numbered term (atomic)
  ACCEPT: "accept", // acceptance paragraph (atomic enough; measured as one)
  SIG: "sig", // dual signature block (atomic — never split)
};

/**
 * Build the ordered block list for a WO doc.
 * doc: {company, vendor, project, wo fields, items, payment_terms_list, general_terms, ...}
 */
export function buildBlocks(doc) {
  const blocks = [];
  const push = (type, data = {}) => blocks.push({ key: `${type}-${blocks.length}`, type, ...data });
  push(BLOCKS.HEADER);
  push(BLOCKS.TITLE);
  push(BLOCKS.META);
  push(BLOCKS.VENDOR);
  if (doc.subject || doc.reference) push(BLOCKS.SUBJECT);
  if (doc.intro_text) push(BLOCKS.INTRO);
  if (doc.scope_of_work) push(BLOCKS.SCOPE);
  push(BLOCKS.BOQ_HEAD);
  (doc.items || []).forEach((it, i) => push(BLOCKS.ROW, { index: i }));
  push(BLOCKS.TOTALS);
  if ((doc.payment_terms_list || []).length) {
    push(BLOCKS.SEC_HEAD, { title: "Payment Terms" });
    doc.payment_terms_list.forEach((t, i) => push(BLOCKS.TERM, { list: "pay", index: i }));
  }
  if ((doc.general_terms || []).length) {
    push(BLOCKS.SEC_HEAD, { title: "General Terms & Conditions" });
    doc.general_terms.forEach((t, i) => push(BLOCKS.TERM, { list: "gen", index: i }));
  }
  if (doc.standard_terms || doc.custom_terms || doc.special_conditions) {
    push(BLOCKS.SEC_HEAD, { title: "Additional Terms" });
    if (doc.standard_terms) push(BLOCKS.TERM, { list: "std", index: 0 });
    if (doc.custom_terms) push(BLOCKS.TERM, { list: "custom", index: 0 });
    if (doc.special_conditions) push(BLOCKS.TERM, { list: "special", index: 0 });
  }
  if (doc.acceptance_text) push(BLOCKS.ACCEPT);
  push(BLOCKS.SIG);
  return blocks;
}

/**
 * Greedy-pack blocks into pages.
 * heights: array aligned with blocks. capacity: usable px per page.
 * opts.repeat: { headType, bodyTypes[] } — when a page opens with a body block,
 *   a head block is prepended (BOQ header repeat) and its height reserved.
 * Returns { pages: number[][], headerHeights } where pages hold block indices.
 */
export function packBlocks(blocks, heights, capacity = PAGE_CAP, opts = {}) {
  const { headType = BLOCKS.BOQ_HEAD, bodyTypes = [BLOCKS.ROW] } = opts;
  const headIdx = blocks.findIndex((b) => b.type === headType);
  const headH = headIdx >= 0 ? heights[headIdx] || 0 : 0;
  const pages = [[]];
  let used = 0;

  const openPage = () => {
    pages.push([]);
    used = 0;
  };

  blocks.forEach((b, i) => {
    if (b.type === headType) {
      // Header itself is a normal block (page 1); repeats are virtual.
      if (used + (heights[i] || 0) > capacity && pages[pages.length - 1].length) openPage();
      pages[pages.length - 1].push(i);
      used += heights[i] || 0;
      return;
    }
    let need = heights[i] || 0;
    const pageIsEmpty = pages[pages.length - 1].length === 0;
    const opensWithBody = pageIsEmpty && bodyTypes.includes(b.type) && pages.length > 1;
    if (opensWithBody) need += headH;
    if (used + need > capacity && pages[pages.length - 1].length) {
      openPage();
      // re-evaluate repeat header on the fresh page
      if (bodyTypes.includes(b.type)) {
        pages[pages.length - 1].repeatHead = true;
        used = headH;
      }
    } else if (opensWithBody) {
      pages[pages.length - 1].repeatHead = true;
      used += headH;
    }
    // Oversized single block: isolate on its own page rather than overflow.
    pages[pages.length - 1].push(i);
    used += heights[i] || 0;
  });

  return { pages, headH };
}

/** Client-side mirror of backend totals (server authoritative on save). */
export function totalsOf(items = [], discount = 0, tax = 0, other = 0) {
  let subtotal = 0;
  for (const it of items || []) {
    subtotal += (Number(it.quantity) || 0) * (Number(it.unit_rate) || 0);
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const d = Number(discount) || 0;
  const t = Number(tax) || 0;
  const o = Number(other) || 0;
  return { subtotal, grand: Math.round((subtotal - d + t + o) * 100) / 100 };
}

/** Finalization checklist (mirrors backend _finalize_checks). */
export function validateDoc(doc) {
  const missing = [];
  if (!((doc.work_order_number || "").trim())) missing.push({ section: "Work Order Information", field: "Work Order Number" });
  if (!doc.work_order_date) missing.push({ section: "Work Order Information", field: "Date" });
  if (!doc.project_id) missing.push({ section: "Project", field: "Project" });
  const hasVendor = !!doc.vendor_id || (doc.invited_vendor_ids || []).length > 0;
  if (!hasVendor) missing.push({ section: "Vendor", field: "Vendor" });
  if (!((doc.subject || "").trim())) missing.push({ section: "Subject", field: "Subject" });
  if (!((doc.scope_of_work || "").trim())) missing.push({ section: "Scope", field: "Scope" });
  if (!(doc.items || []).length) missing.push({ section: "BOQ", field: "At least one BOQ item" });
  if (!(doc.payment_terms_list || []).length) missing.push({ section: "Payment Terms", field: "Payment Terms" });
  if (!(doc.general_terms || []).length) missing.push({ section: "General Terms", field: "General Terms & Conditions" });
  if (!((doc.signer_name || "").trim())) missing.push({ section: "Signature", field: "Authorized signatory (name)" });
  return missing;
}
