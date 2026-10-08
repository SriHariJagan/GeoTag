import { useState, useEffect, useMemo, useRef } from "react";
import styles from "./NewProjectForms.module.css";
import { useMachines } from "../../store/context/MachineContext";
import { useUsers } from "../../store/context/UserContext";
import { useVendors } from "../../store/context/VendorContext";
import ProjectAutocomplete from "../WorkOrder/ProjectAutocomplete";
import { getProjectDetails } from "../../api/projects.api";

const PROJECT_TYPES = ["INVESTIGATION", "DRILLING", "SURVEY", "TESTING", "CIVIL_WORK", "CONSULTANCY", "OTHER"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CURRENCIES = ["INR", "USD", "EUR", "AED", "SAR"];
const CREATE_STATUSES = ["DRAFT", "PLANNED", "ACTIVE"];

const EMPTY_FORM = {
  project_code: "",
  date: "",
  name: "",
  description: "",
  client_name: "",
  engineer_in_charge: "",
  location: "",
  project_type: "",
  priority: "MEDIUM",
  currency: "INR",
  project_budget: "",
  status: "DRAFT",
  totalBH: "",
  completedBH: "",
  supervisor_ids: [],
  machine_ids: [],
  vendor_ids: [],
};

export default function NewProjectForm({ initialData, onSubmit }) {
  const { machines, loadMachines } = useMachines();
  const { users, loadUsers } = useUsers();
  const { vendors, loadVendors } = useVendors();

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [linkedProject, setLinkedProject] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);

  useEffect(() => {
    loadMachines();
    loadUsers();
    loadVendors();
  }, []);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...EMPTY_FORM,
        ...initialData,
        supervisor_ids: initialData.supervisors?.map((s) => s.id) || [],
        machine_ids: initialData.machinery?.map((m) => m.id) || [],
        vendor_ids: initialData.vendors?.map((v) => v.id) || [],
        totalBH: initialData.total_boreholes ?? "",
        completedBH: initialData.completed_boreholes ?? "",
        project_budget: initialData.project_budget ?? "",
        priority: initialData.priority || "MEDIUM",
        currency: initialData.currency || "INR",
        project_type: initialData.project_type || "",
        description: initialData.description || "",
        status: initialData.status || "DRAFT",
        date: initialData.date || "",
      });
    } else {
      setFormData(EMPTY_FORM);
    }
    setErrors({});
    setSubmitError("");
  }, [initialData]);

  const supervisors = useMemo(() => {
    const list = users.filter((u) => (u.role || "").toUpperCase() === "SUPERVISOR");
    return [...list].sort((a, b) => {
      const ea = a.account_status === "ACTIVE" ? 0 : 1;
      const eb = b.account_status === "ACTIVE" ? 0 : 1;
      return ea - eb || (a.full_name || "").localeCompare(b.full_name || "");
    });
  }, [users]);

  const activeVendors = useMemo(() => {
    const list = vendors || [];
    return [...list].sort((a, b) => {
      const ea = a.status === "ACTIVE" ? 0 : 1;
      const eb = b.status === "ACTIVE" ? 0 : 1;
      return ea - eb;
    });
  }, [vendors]);

  const handleChange = (e) =>
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));

  const toggleId = (field, id) =>
    setFormData((p) => ({
      ...p,
      [field]: p[field].includes(id)
        ? p[field].filter((i) => i !== id)
        : [...p[field], id],
    }));

  const setIds = (field, ids) => setFormData((p) => ({ ...p, [field]: ids }));

  const totalBH = Number(formData.totalBH) || 0;
  const completedBH = Number(formData.completedBH) || 0;
  const autoProgress = totalBH > 0 ? Math.min(100, Math.round((completedBH / totalBH) * 100)) : 0;

  const pendingSupervisors = useMemo(
    () =>
      (users || []).filter(
        (u) =>
          formData.supervisor_ids.includes(u.id) &&
          (u.account_status || (u.is_active ? "ACTIVE" : "INVITED")) !== "ACTIVE"
      ),
    [users, formData.supervisor_ids]
  );

  const ineligibleVendors = useMemo(
    () =>
      (vendors || []).filter(
        (v) => formData.vendor_ids.includes(v.id) && (v.status || "ACTIVE") !== "ACTIVE"
      ),
    [vendors, formData.vendor_ids]
  );

  const badMachines = useMemo(
    () =>
      (machines || []).filter(
        (m) =>
          formData.machine_ids.includes(m.id) &&
          ["inactive", "maintenance"].includes((m.status || "").toLowerCase())
      ),
    [machines, formData.machine_ids]
  );

  const onLinkExisting = async (p) => {
    if (!p) return;
    setLinkLoading(true);
    try {
      const full = await getProjectDetails(p.id).then((r) => r.data).catch(() => null);
      setLinkedProject({ ...p, full });
      // Pre-fill from existing project; existing entities become selectable options.
      setFormData((prev) => ({
        ...prev,
        project_code: p.project_code || prev.project_code,
        name: p.name || prev.name,
        client_name: p.client_name || prev.client_name,
        location: p.location || prev.location,
      }));
      if (full) {
        const supIds = (full.supervisors || []).map((s) => s.id).filter(Boolean);
        const venIds = (full.vendors || []).map((v) => v.id).filter(Boolean);
        setFormData((prev) => ({
          ...prev,
          supervisor_ids: [...new Set([...prev.supervisor_ids, ...supIds])],
          vendor_ids: [...new Set([...prev.vendor_ids, ...venIds])],
        }));
      }
    } finally {
      setLinkLoading(false);
    }
  };

  const onLinkReset = (typed) => {
    setLinkedProject(null);
    setFormData((prev) => ({ ...EMPTY_FORM, project_code: typed || "" }));
  };

  const str = (v) => (v ?? "").toString();

  const validate = () => {
    const e = {};
    if (pendingSupervisors.length > 0)
      e.supervisors = "User has not accepted the invitation and cannot be assigned.";
    if (ineligibleVendors.length > 0)
      e.vendors = "Only ACTIVE vendors can be assigned.";
    if (!str(formData.project_code).trim()) e.project_code = "Project code is required";
    if (!str(formData.name).trim()) e.name = "Project name is required";
    if (!formData.date) e.date = "Date is required";
    if (!str(formData.client_name).trim()) e.client_name = "Client name is required";
    if (!str(formData.engineer_in_charge).trim())
      e.engineer_in_charge = "Client representative is required";
    if (!str(formData.location).trim()) e.location = "Location is required";
    if (formData.totalBH !== "" && Number(formData.totalBH) < 0)
      e.totalBH = "Cannot be negative";
    if (formData.completedBH !== "" && Number(formData.completedBH) < 0)
      e.completedBH = "Cannot be negative";
    if (Number(formData.completedBH) > Number(formData.totalBH) && formData.totalBH !== "")
      e.completedBH = "Cannot exceed total boreholes";
    if (formData.project_budget !== "" && Number(formData.project_budget) < 0)
      e.project_budget = "Cannot be negative";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        project_code: str(formData.project_code).trim(),
        date: formData.date,
        name: str(formData.name).trim(),
        description: str(formData.description).trim() || undefined,
        client_name: str(formData.client_name).trim(),
        engineer_in_charge: str(formData.engineer_in_charge).trim(),
        location: str(formData.location).trim(),
        project_type: formData.project_type || undefined,
        priority: formData.priority || undefined,
        currency: formData.currency || "INR",
        project_budget: formData.project_budget === "" ? 0 : Number(formData.project_budget),
        status: formData.status,
        total_boreholes: totalBH,
        completed_boreholes: completedBH,
        supervisor_ids: formData.supervisor_ids,
        machine_ids: formData.machine_ids,
        vendor_ids: formData.vendor_ids,
      });
    } catch (err) {
      setSubmitError(err?.response?.data?.detail || "Failed to save project");
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label, name, props = {}, hint) => (
    <div className={styles.field}>
      <label htmlFor={`np-${name}`}>
        {label} {props.required && <span className={styles.required}>*</span>}
      </label>
      <input id={`np-${name}`} name={name} value={formData[name] ?? ""} onChange={handleChange} {...props} />
      {hint && <span className={styles.hint}>{hint}</span>}
      {errors[name] && <span className={styles.errorMsg}>{errors[name]}</span>}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={submitForm}>
      <h2>{initialData ? "Edit Project" : "Create New Project"}</h2>
      <p className={styles.formSub}>
        {initialData
          ? "Update project details and team assignments."
          : "Type a Project ID to reuse an existing project (details + team load automatically), or create new."}
      </p>

      {!initialData && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}><span className={styles.stepNo}>0</span> Existing Project Lookup</h3>
          <ProjectAutocomplete
            value={linkedProject?.project_code}
            onSelect={onLinkExisting}
            onReset={onLinkReset}
            placeholder="Type Project ID, e.g. GEO-2026-001…"
          />
          {linkLoading && <span className={styles.hint}>Loading project information…</span>}
          {linkedProject && (
            <span className={styles.hint}>
              Linked {linkedProject.project_code} — {linkedProject.name} · {linkedProject.client_name || "-"} ·{" "}
              {linkedProject.location || "-"} · {linkedProject.status}. Existing supervisors/vendors
              pre-selected below; adjust as needed. Nothing is duplicated.
            </span>
          )}
        </div>
      )}

      {/* ---------- 1. PROJECT IDENTITY ---------- */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}><span className={styles.stepNo}>1</span> Project Identity</h3>
        <div className={styles.formGrid}>
          {field("Project Code", "project_code", { placeholder: "e.g. HYD-001", required: true }, "Unique. Used in RFQs, work orders and reports.")}
          {field("Project Name", "name", { placeholder: "e.g. Hyderabad Geotechnical Investigation", required: true })}
          {field("Date", "date", { type: "date", required: true })}
          <div className={`${styles.field} ${styles.fullWidth}`}>
            <label htmlFor="np-description">Description</label>
            <textarea
              id="np-description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={2}
              placeholder="Scope summary, site context, key deliverables..."
            />
          </div>
        </div>
      </div>

      {/* ---------- 2. CLIENT & SITE ---------- */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}><span className={styles.stepNo}>2</span> Client &amp; Site</h3>
        <div className={styles.formGrid}>
          {field("Client Name", "client_name", { placeholder: "e.g. ABC Constructions", required: true })}
          {field(
            "Client Representative",
            "engineer_in_charge",
            { placeholder: "e.g. Ramesh Iyer", required: true },
            "The person from the client side who visits the site to inspect progress and approve work."
          )}
          {field("Location", "location", { placeholder: "e.g. Gachibowli, Hyderabad", required: true })}
        </div>
      </div>

      {/* ---------- 3. PLANNING & BUDGET ---------- */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}><span className={styles.stepNo}>3</span> Planning &amp; Budget</h3>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="np-project_type">Project Type</label>
            <select id="np-project_type" name="project_type" value={formData.project_type} onChange={handleChange}>
              <option value="">Select…</option>
              {PROJECT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="np-priority">Priority</label>
            <select id="np-priority" name="priority" value={formData.priority} onChange={handleChange}>
              {PRIORITIES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="np-status">Status</label>
            <select id="np-status" name="status" value={formData.status} onChange={handleChange}>
              {(initialData
                ? ["DRAFT", "PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "Not Started", "Ongoing", "On Hold", "Completed"]
                : CREATE_STATUSES
              ).map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            {!initialData && <span className={styles.hint}>New projects start as Draft. Move to Active from the project page.</span>}
          </div>
          {field("Budget", "project_budget", { type: "number", min: 0, step: "0.01", placeholder: "0.00" })}
          <div className={styles.field}>
            <label htmlFor="np-currency">Currency</label>
            <select id="np-currency" name="currency" value={formData.currency} onChange={handleChange}>
              {CURRENCIES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          {field("Total Boreholes", "totalBH", { type: "number", min: 0 })}
          {field("Completed Boreholes", "completedBH", { type: "number", min: 0 })}
          <div className={styles.field}>
            <label>Progress (auto)</label>
            <div className={styles.progressPreview}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${autoProgress}%` }} />
              </div>
              <span>{autoProgress}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 4. TEAM & RESOURCES ---------- */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}><span className={styles.stepNo}>4</span> Team &amp; Resources</h3>
        <p className={styles.sectionHint}>
          Search and select multiple. Only <b>ACTIVE</b> supervisors, <b>ACCEPTED-work-order</b> vendors
          and <b>available</b> machines can be assigned — enforced on frontend and backend.
        </p>
        {pendingSupervisors.length > 0 && (
          <div className={styles.formError}>
            User has not accepted the invitation and cannot be assigned:{" "}
            {pendingSupervisors.map((u) => u.full_name || u.email).join(", ")}
          </div>
        )}
        {errors.supervisors && <div className={styles.formError}>{errors.supervisors}</div>}
        {ineligibleVendors.length > 0 && (
          <div className={styles.formError}>
            Vendor has not accepted the Work Order and cannot be assigned to this project:{" "}
            {ineligibleVendors.map((v) => v.legal_business_name || v.vendor_company).join(", ")}
          </div>
        )}
        {errors.vendors && <div className={styles.formError}>{errors.vendors}</div>}
        {badMachines.length > 0 && (
          <div className={styles.formError}>
            Machine not available (inactive/maintenance):{" "}
            {badMachines.map((m) => m.machine_name).join(", ")}
          </div>
        )}
        <div className={styles.assignmentGrid}>
          <MultiSelect
            label="Supervisors"
            items={supervisors}
            selected={formData.supervisor_ids}
            onToggle={(id) => toggleId("supervisor_ids", id)}
            onSet={(ids) => setIds("supervisor_ids", ids)}
            getKey={(u) => u.full_name || u.email}
            getSub={(u) => u.email}
            getBadge={(u) => (u.account_status === "ACTIVE" ? null : u.account_status || "UNKNOWN")}
          />
          <MultiSelect
            label="Vendors"
            items={activeVendors}
            selected={formData.vendor_ids}
            onToggle={(id) => toggleId("vendor_ids", id)}
            onSet={(ids) => setIds("vendor_ids", ids)}
            getKey={(v) => v.legal_business_name || v.vendor_company || v.contact_person}
            getSub={(v) => [v.vendor_code, v.city].filter(Boolean).join(" · ")}
            getBadge={(v) => (v.status === "ACTIVE" ? null : v.status || "")}
          />
          <MultiSelect
            label="Machinery"
            items={machines || []}
            selected={formData.machine_ids}
            onToggle={(id) => toggleId("machine_ids", id)}
            onSet={(ids) => setIds("machine_ids", ids)}
            getKey={(m) => m.machine_name}
            getSub={(m) => m.machine_type}
            getBadge={(m) => (m.status && m.status !== "active" ? m.status : null)}
          />
        </div>
      </div>

      {submitError && <div className={styles.formError}>{submitError}</div>}

      <button type="submit" className={styles.submitBtn} disabled={submitting}>
        {submitting ? "Saving..." : initialData ? "Update Project" : "Create Project"}
      </button>
    </form>
  );
}

// ---------------- PROFESSIONAL MULTI-SELECT ----------------
function MultiSelect({ label, items, selected, onToggle, onSet, getKey, getSub, getBadge }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter(
      (i) =>
        !selected.includes(i.id) &&
        (!q ||
          getKey(i)?.toLowerCase().includes(q) ||
          getSub(i)?.toLowerCase().includes(q))
    );
  }, [items, selected, search, getKey, getSub]);

  const allIds = (items || []).map((i) => i.id);

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlight]) {
        onToggle(filtered[highlight].id);
        setSearch("");
        setHighlight(0);
      } else {
        setOpen(true);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={styles.chipSelectBox} ref={boxRef}>
      <label>
        {label}
        <span className={styles.countBadge}>{selected.length} selected</span>
      </label>

      {selected.length > 0 && (
        <div className={styles.chipContainer}>
          {selected.map((id) => {
            const item = (items || []).find((i) => i.id === id);
            return (
              <span key={id} className={styles.chip} title={item ? getSub(item) : ""}>
                <span className={styles.chipAvatar}>
                  {(item ? getKey(item) : "?").charAt(0).toUpperCase()}
                </span>
                {item ? getKey(item) : `ID ${id}`}
                <button type="button" onClick={() => onToggle(id)} aria-label={`Remove ${getKey(item)}`}>
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={`Search ${label.toLowerCase()}… (↑↓ + Enter)`}
        role="combobox"
        aria-expanded={open}
        aria-label={`Search ${label}`}
      />

      {open && (
        <div className={styles.dropdown} role="listbox">
          <div className={styles.msFooter}>
            <button type="button" onClick={() => onSet(allIds)}>Select all ({(items || []).length})</button>
            <button type="button" onClick={() => onSet([])}>Clear</button>
          </div>
          {filtered.length === 0 && (
            <div className={styles.msEmpty}>
              {selected.length === (items || []).length ? "All selected" : "No matches found"}
            </div>
          )}
          {filtered.slice(0, 50).map((i, idx) => {
            const badge = getBadge ? getBadge(i) : null;
            return (
              <div
                key={i.id}
                role="option"
                aria-selected={false}
                className={`${styles.msItem} ${idx === highlight ? styles.msHighlight : ""}`}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => {
                  onToggle(i.id);
                  setSearch("");
                  setHighlight(0);
                }}
              >
                <span className={styles.msCheck}>+</span>
                <span className={styles.msAvatar}>{(getKey(i) || "?").charAt(0).toUpperCase()}</span>
                <span className={styles.msText}>
                  <strong>{getKey(i)}</strong>
                  {getSub(i) && <small>{getSub(i)}</small>}
                </span>
                {badge && <span className={styles.msBadge}>{badge}</span>}
              </div>
            );
          })}
          {filtered.length > 50 && (
            <div className={styles.msEmpty}>Showing first 50 — refine your search</div>
          )}
        </div>
      )}
    </div>
  );
}
