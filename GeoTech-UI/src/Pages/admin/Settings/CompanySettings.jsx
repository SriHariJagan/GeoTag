import { useEffect, useState } from "react";
import Toast from "../../../Components/Toast/Toast";
import { useToast } from "../../../Components/Toast/useToast";
import {
  getCompanySettings, updateCompanySettings, uploadCompanyLogo, companyLogoUrl,
} from "../../../api/company.api";
import styles from "./CompanySettings.module.css";

const FIELDS = [
  ["company_name", "Company Name *"],
  ["tagline", "Tagline"],
  ["address_line1", "Address Line 1"],
  ["address_line2", "Address Line 2"],
  ["city", "City"],
  ["state", "State"],
  ["pin", "PIN"],
  ["phone", "Phone"],
  ["phone2", "Alternate Phone"],
  ["email", "Email"],
  ["website", "Website"],
  ["gstin", "GSTIN"],
  ["pan", "PAN"],
  ["wo_number_prefix", "WO Number Prefix"],
  ["wo_number_format", "WO Number Format ({prefix} {project} {yy} {yyyy} {seq})"],
];

export default function CompanySettings() {
  const { toasts, push, dismiss } = useToast();
  const [form, setForm] = useState({});
  const [logoTs, setLogoTs] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCompanySettings()
      .then((r) => setForm(r.data || {}))
      .catch(() => push("Failed to load company settings", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { logo_path, logo_url, id, updated_by, updated_at, ...payload } = form;
      const r = await updateCompanySettings(payload);
      setForm(r.data || {});
      push("Company settings saved — headers, footers and numbering use this", "success");
    } catch (err) {
      push(err?.response?.data?.detail || "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const r = await uploadCompanyLogo(f);
      setForm(r.data || {});
      setLogoTs(Date.now());
      push("Logo uploaded — previews and PDFs update immediately", "success");
    } catch (err) {
      push(err?.response?.data?.detail || "Logo upload failed", "error");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  if (loading) return <div className={styles.page}><div className={styles.card}><p>Loading…</p></div></div>;

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Organization</span>
          <h1>Company Settings</h1>
          <p>Single source of truth for document headers, footers, logos and work-order numbering. Nothing is hardcoded.</p>
        </div>
      </div>
      <form className={styles.card} onSubmit={save}>
        <div className={styles.logoRow}>
          <div className={styles.logoBox}>
            {form.logo_path ? (
              <img src={`${companyLogoUrl()}?ts=${logoTs}`} alt="Company logo" />
            ) : (
              <span>No logo yet</span>
            )}
          </div>
          <label className={styles.logoBtn}>
            Upload Logo (PNG/JPG, ≤5MB)
            <input type="file" accept=".png,.jpg,.jpeg" onChange={onLogo} hidden />
          </label>
        </div>
        <div className={styles.grid}>
          {FIELDS.map(([k, label]) => (
            <label key={k} className={styles.fld}>{label}
              <input value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </label>
          ))}
          <label className={`${styles.fld} ${styles.full}`}>Other Registrations
            <textarea rows={2} value={form.other_registrations ?? ""} onChange={(e) => setForm({ ...form, other_registrations: e.target.value })} />
          </label>
          <label className={`${styles.fld} ${styles.full}`}>Footer — Head Office
            <textarea rows={2} value={form.footer_head_office ?? ""} onChange={(e) => setForm({ ...form, footer_head_office: e.target.value })} />
          </label>
          <label className={`${styles.fld} ${styles.full}`}>Footer — Regional Office
            <textarea rows={2} value={form.footer_regional_office ?? ""} onChange={(e) => setForm({ ...form, footer_regional_office: e.target.value })} />
          </label>
        </div>
        <button className={styles.saveBtn} disabled={busy}>{busy ? "Saving…" : "Save Company Settings"}</button>
      </form>
    </div>
  );
}
