import { totalsOf } from "./docEngine";

/**
 * Build the single object both the studio editor and the read-only detail view
 * hand to <WoPreview>, so the A4 document is byte-for-byte the same in both.
 */
export function buildWoView(doc = {}, company = {}) {
  const snapshot = (t) => {
    try {
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  };

  const vs = snapshot(doc.vendor_snapshot);
  const ps = snapshot(doc.project_snapshot);
  const cs = snapshot(doc.company_snapshot);

  const companyBlock = {
    company_name: company.company_name,
    tagline: company.tagline,
    logo_url: company.logo_url,
    address_line1: company.address_line1,
    address_line2: company.address_line2,
    city: company.city,
    state: company.state,
    pin: company.pin,
    phone: company.phone,
    email: company.email,
    website: company.website,
    gstin: company.gstin,
    pan: company.pan,
    ...(cs || {}),
  };

  const vendor = {
    ...(vs || {
      company: doc.vendor_name || doc._vendorRow?.company || "",
      vendor_code: doc._vendorRow?.vendor_code || "",
      address: doc._vendorRow?.address || "",
      city: doc._vendorRow?.city || "",
      state: doc._vendorRow?.state || "",
      pin: doc._vendorRow?.postal_code || "",
      contact_person: doc._vendorRow?.contact_person || "",
      mobile: doc._vendorRow?.phone || "",
      email: doc._vendorRow?.email || "",
      gstin: "",
      pan: "",
    }),
  };
  const ov = doc.vendor_override || {};
  Object.assign(vendor, Object.fromEntries(
    Object.entries(ov).filter(([, v]) => v !== "" && v != null)
  ));

  const project = {
    ...(ps || {
      project_code: doc._projectCode || doc._projectRow?.project_code || "",
      name: doc.project_name || "",
      client_name: doc.client_name || "",
      location: doc.location || "",
      status: doc._projectRow?.status || "",
    }),
  };

  const teamSup = safeArr(doc.team_supervisors ?? doc.team_supervisors_json);
  const teamMac = safeArr(doc.team_machines ?? doc.team_machines_json);

  const items = doc.items || [];
  const totals = totalsOf(items, doc.discount, doc.tax_amount, doc.other_charges);

  return {
    ...doc,
    company: companyBlock,
    vendor,
    project,
    items,
    totals,
    team_supervisors: teamSup,
    team_machines: teamMac,
    payment_terms_list: asList(doc.payment_terms_list ?? doc.payment_terms_json),
    general_terms: asList(doc.general_terms ?? doc.general_terms_json),
  };
}

function safeArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asList(v) {
  if (Array.isArray(v)) return v.filter((x) => String(x || "").trim());
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.filter((x) => String(x || "").trim()) : [];
    } catch {
      return v.trim() ? [v] : [];
    }
  }
  return [];
}