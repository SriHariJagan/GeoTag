import { useEffect, useState, useMemo, useRef } from "react";
import { FiCheck } from "react-icons/fi";
import styles from "./DERForm.module.css";
import { useProjects } from "../../store/context/ProjectContext";
import { useVendors } from "../../store/context/VendorContext";
import { getProjectById } from "../../api/projects.api";

const today = new Date().toISOString().split("T")[0];

const RIG_TYPES = ["Rotary", "Percussion", "Auger", "Core Drilling", "SPT", "Other"];
const WEATHER = ["Clear", "Sunny", "Cloudy", "Rainy", "Stormy", "Windy", "Foggy"];
const WORK_STATUS = ["working", "idle", "breakdown", "holiday", "completed"];

const INITIAL_STATE = {
  project_id: "",
  client: "",
  client_person_name: "",
  client_person_designation: "",
  site_location: "",
  vendor_id: "",

  borehole_no: "",
  rig_no: "",
  type_of_rig: "",
  chainage: "",
  depth_started: "",
  soil_depth: "",
  soft_rock_depth: "",
  hard_rock_depth: "",
  total_depth: "",

  hours_worked: "",
  manpower_count: "",
  weather_condition: "",
  work_status: "working",
  delay_reason: "",

  remarks: "",
  borehole_started: "",
  borehole_ended: "",
  report_date: today,
  status: "SUBMITTED",
};

const vendorName = (v) =>
  v?.legal_business_name || v?.vendor_company || v?.contact_person || `Vendor #${v?.id}`;

export default function DERForm({ initialData, onSubmit }) {
  const [formData, setFormData] = useState(INITIAL_STATE);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const { projects, loadProjects } = useProjects();
  const { vendors, loadVendors } = useVendors();

  /* ---------------- LOAD DATA ---------------- */
  useEffect(() => {
    loadProjects();
    loadVendors();
  }, []);

  /* ---------------- PREFILL FOR EDIT ---------------- */
  useEffect(() => {
    if (initialData) {
      setFormData({ ...INITIAL_STATE, ...initialData });
    } else {
      setFormData(INITIAL_STATE);
    }
    setErrors({});
    setSubmitError("");
  }, [initialData]);

  /* ================= PROJECT SELECTION ================= */
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === Number(formData.project_id));
  }, [formData.project_id, projects]);

  /* ================= AUTO FILL PROJECT DETAILS ================= */
  useEffect(() => {
    if (selectedProject) {
      setFormData((prev) => ({
        ...prev,
        client: selectedProject.client_name || "",
        client_person_name: selectedProject.engineer_in_charge || "",
        site_location: selectedProject.location || "",
      }));
    }
  }, [selectedProject]);

  /* ============ FULL PROJECT SNAPSHOT (auto-fetched on select) ============ */
  const [projSnap, setProjSnap] = useState(null);
  const [projSnapBusy, setProjSnapBusy] = useState(false);
  useEffect(() => {
    const pid = selectedProject?.id;
    if (!pid) { setProjSnap(null); return; }
    let alive = true;
    setProjSnapBusy(true);
    getProjectById(pid)
      .then((r) => alive && setProjSnap(r.data))
      .catch(() => alive && setProjSnap(selectedProject))
      .finally(() => alive && setProjSnapBusy(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]);

  /* ================= FILTER VENDORS BASED ON PROJECT ================= */
  const filteredVendors = useMemo(() => {
    if (!selectedProject) return [];
    const ids = (selectedProject.vendors || []).map((v) => Number(v.id));
    if (ids.length === 0) return vendors;
    return vendors.filter((v) => ids.includes(Number(v.id)));
  }, [selectedProject, vendors]);

  /* ================= AUTO TOTAL DEPTH ================= */
  const soil = Number(formData.soil_depth || 0);
  const soft = Number(formData.soft_rock_depth || 0);
  const hard = Number(formData.hard_rock_depth || 0);
  const totalDepth = soil + soft + hard;

  /* ================= HANDLERS ================= */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!formData.project_id) e.project_id = "Select a project";
    if (!formData.vendor_id) e.vendor_id = "Select a vendor";
    if (!formData.borehole_no.trim()) e.borehole_no = "Borehole no is required";
    if (!formData.rig_no.trim()) e.rig_no = "Rig no is required";
    if (!formData.type_of_rig.trim()) e.type_of_rig = "Rig type is required";
    if (!formData.chainage.trim()) e.chainage = "Chainage is required";
    if (!formData.client.trim()) e.client = "Client is required";
    if (!formData.client_person_name.trim()) e.client_person_name = "Client representative is required";
    if (!formData.report_date) e.report_date = "Report date is required";
    if (
      formData.borehole_started &&
      formData.borehole_ended &&
      formData.borehole_ended < formData.borehole_started
    )
      e.borehole_ended = "Must be on or after the start date";
    if (formData.hours_worked !== "" && Number(formData.hours_worked) < 0)
      e.hours_worked = "Cannot be negative";
    if (formData.manpower_count !== "" && Number(formData.manpower_count) < 0)
      e.manpower_count = "Cannot be negative";
    for (const k of ["depth_started", "soil_depth", "soft_rock_depth", "hard_rock_depth"]) {
      if (formData[k] !== "" && Number(formData[k]) < 0) e[k] = "Cannot be negative";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    const numericFields = [
      "project_id",
      "vendor_id",
      "depth_started",
      "soil_depth",
      "soft_rock_depth",
      "hard_rock_depth",
      "hours_worked",
      "manpower_count",
    ];

    const payload = Object.keys(formData).reduce((acc, key) => {
      if (key === "total_depth") {
        acc[key] = totalDepth;
      } else {
        acc[key] = numericFields.includes(key)
          ? formData[key] === ""
            ? 0
            : Number(formData[key])
          : formData[key];
      }
      return acc;
    }, {});

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setSubmitError(err?.response?.data?.detail || "Failed to save report");
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label, name, props = {}, hint) => (
    <div className={styles.field}>
      <label htmlFor={`der-${name}`}>
        {label} {props.required && <span className={styles.required}>*</span>}
      </label>
      <input id={`der-${name}`} name={name} value={formData[name]} onChange={handleChange} {...props} />
      {hint && <span className={styles.hint}>{hint}</span>}
      {errors[name] && <span className={styles.errorMsg}>{errors[name]}</span>}
    </div>
  );

  const isEdit = Boolean(initialData?.id);

  /* ================= RENDER ================= */
  return (
    <form className={styles.formContainer} onSubmit={handleSubmit}>
      <h3>{isEdit ? "Edit Daily Execution Report" : "New Daily Execution Report"}</h3>
      <p className={styles.formSub}>
        {isEdit
          ? "Update the draft report. Submitted reports can only be edited by an admin."
          : "Log today's drilling execution. Depths total automatically."}
      </p>

      {/* ================= 1. PROJECT & SITE ================= */}
      <div className={styles.section}>
        <h4><span className={styles.stepNo}>1</span> Project &amp; Site</h4>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Project *</label>
            <SearchSelect
              value={formData.project_id}
              onChange={(id) => {
                setFormData((p) => ({ ...p, project_id: id, vendor_id: "" }));
                setErrors((p) => ({ ...p, project_id: "" }));
              }}
              items={projects}
              getKey={(p) => `${p.project_code} — ${p.name}`}
              getSub={(p) => p.location || ""}
              placeholder="Search projects…"
            />
            {errors.project_id && <span className={styles.errorMsg}>{errors.project_id}</span>}
          </div>

          <div className={styles.field}>
            <label>Vendor *</label>
            <SearchSelect
              value={formData.vendor_id}
              onChange={(id) => {
                setFormData((p) => ({ ...p, vendor_id: id }));
                setErrors((p) => ({ ...p, vendor_id: "" }));
              }}
              items={filteredVendors}
              getKey={vendorName}
              getSub={(v) => [v.vendor_code, v.city].filter(Boolean).join(" · ")}
              placeholder={selectedProject ? "Search vendors…" : "Select a project first"}
              disabled={!selectedProject}
            />
            {errors.vendor_id && <span className={styles.errorMsg}>{errors.vendor_id}</span>}
          </div>

          {field("Report Date", "report_date", { type: "date", max: today, required: true })}

          {!isEdit && (
            <div className={styles.field}>
              <label htmlFor="der-status">Save as</label>
              <select id="der-status" name="status" value={formData.status} onChange={handleChange}>
                <option value="SUBMITTED">Submitted</option>
                <option value="DRAFT">Draft (submit later)</option>
              </select>
            </div>
          )}
        </div>

          {selectedProject && (
            <div className={styles.infoPanel}>
              <div><span>Client</span><strong>{formData.client || "-"}</strong></div>
              <div><span>Client Representative</span><strong>{formData.client_person_name || "-"}</strong></div>
              <div><span>Site Location</span><strong>{formData.site_location || "-"}</strong></div>
            </div>
          )}

          {selectedProject && (
            <div className={styles.snapPanel}>
              <div className={styles.snapHead}>
                <div>
                  <strong>{projSnap?.project_code || selectedProject.project_code} — {projSnap?.name || selectedProject.name}</strong>
                  <span>
                    {[projSnap?.client_name || selectedProject.client_name,
                      projSnap?.location || selectedProject.location].filter(Boolean).join(" · ") || "-"}
                  </span>
                </div>
                <em>{projSnapBusy ? "…" : (projSnap?.status || selectedProject.status || "-")}</em>
              </div>
              <div className={styles.snapFacts}>
                <div><span>Budget</span><strong>{projSnap?.project_budget != null ? `${Number(projSnap.project_budget).toLocaleString("en-IN")} ${projSnap?.currency || "INR"}` : "-"}</strong></div>
                <div><span>Progress</span><strong>{projSnap?.progress ?? selectedProject.progress ?? 0}%</strong></div>
                <div><span>Boreholes</span><strong>{projSnap?.completed_boreholes ?? 0} / {projSnap?.total_boreholes ?? "-"}</strong></div>
                <div><span>Schedule</span><strong>{[projSnap?.planned_start_date, projSnap?.planned_end_date].filter(Boolean).join(" → ") || projSnap?.date || selectedProject.date || "-"}</strong></div>
              </div>
              <div className={styles.snapTeams}>
                {[
                  ["Supervisors", (projSnap?.supervisors || selectedProject.supervisors || []).map((s) => s.full_name).filter(Boolean)],
                  ["Vendors", (projSnap?.vendors || selectedProject.vendors || []).map((v) => v.vendor_name).filter(Boolean)],
                  ["Machinery", (projSnap?.machinery || selectedProject.machinery || []).map((m) => m.machine_name).filter(Boolean)],
                ].map(([label, names]) => (
                  <div key={label}>
                    <span>{label} ({names.length})</span>
                    <div className={styles.snapChips}>
                      {names.slice(0, 4).map((n) => <i key={n}>{n}</i>)}
                      {names.length > 4 && <i>+{names.length - 4} more</i>}
                      {names.length === 0 && <i>—</i>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* ================= 2. BOREHOLE & RIG ================= */}
      <div className={styles.section}>
        <h4><span className={styles.stepNo}>2</span> Borehole &amp; Rig</h4>
        <div className={styles.formGrid}>
          {field("Borehole No", "borehole_no", { placeholder: "e.g. BH-12", required: true })}
          {field("Rig No", "rig_no", { placeholder: "e.g. RIG-03", required: true })}
          <div className={styles.field}>
            <label htmlFor="der-type_of_rig">Rig Type *</label>
            <select id="der-type_of_rig" name="type_of_rig" value={formData.type_of_rig} onChange={handleChange} required>
              <option value="">Select…</option>
              {RIG_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            {errors.type_of_rig && <span className={styles.errorMsg}>{errors.type_of_rig}</span>}
          </div>
          {field("Chainage", "chainage", { placeholder: "e.g. 0+250", required: true })}
          {field("Borehole Started", "borehole_started", { type: "date" })}
          {field("Borehole Ended", "borehole_ended", { type: "date" })}
        </div>
      </div>

      {/* ================= 3. DEPTHS ================= */}
      <div className={styles.section}>
        <h4><span className={styles.stepNo}>3</span> Depths (metres)</h4>
        <div className={styles.formGrid}>
          {field("Depth Started", "depth_started", { type: "number", min: 0, step: "0.01" })}
          {field("Soil Depth", "soil_depth", { type: "number", min: 0, step: "0.01" })}
          {field("Soft Rock Depth", "soft_rock_depth", { type: "number", min: 0, step: "0.01" })}
          {field("Hard Rock Depth", "hard_rock_depth", { type: "number", min: 0, step: "0.01" })}
        </div>
        <div className={styles.totalBar}>
          <span>Total Depth (auto)</span>
          <strong>{totalDepth.toFixed(2)} m</strong>
        </div>
      </div>

      {/* ================= 4. DAY SUMMARY ================= */}
      <div className={styles.section}>
        <h4><span className={styles.stepNo}>4</span> Day Summary</h4>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="der-weather_condition">Weather</label>
            <select id="der-weather_condition" name="weather_condition" value={formData.weather_condition} onChange={handleChange}>
              <option value="">Select…</option>
              {WEATHER.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="der-work_status">Work Status</label>
            <select id="der-work_status" name="work_status" value={formData.work_status} onChange={handleChange}>
              {WORK_STATUS.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          {field("Hours Worked", "hours_worked", { type: "number", min: 0, step: "0.5", placeholder: "e.g. 8" })}
          {field("Manpower Count", "manpower_count", { type: "number", min: 0, step: 1, placeholder: "e.g. 6" })}
          {field("Client Person Name", "client_person_name", { placeholder: "Who inspected today", required: true })}
          {field("Client Person Designation", "client_person_designation", { placeholder: "e.g. Site Inspector" })}
          <div className={`${styles.field} ${styles.fullRow}`}>
            <label htmlFor="der-delay_reason">Delay Reason</label>
            <input id="der-delay_reason" name="delay_reason" value={formData.delay_reason} onChange={handleChange} placeholder="Leave empty if no delay" />
          </div>
          <div className={`${styles.field} ${styles.fullRow}`}>
            <label htmlFor="der-remarks">Remarks</label>
            <textarea id="der-remarks" name="remarks" value={formData.remarks} onChange={handleChange} placeholder="Day notes, issues, safety observations..." />
          </div>
        </div>
      </div>

      {submitError && <div className={styles.formError}>{submitError}</div>}

      <button type="submit" className={styles.submitBtn} disabled={submitting}>
        <FiCheck />
        {submitting ? "Saving…" : isEdit ? "Update Report" : "Create Report"}
      </button>
    </form>
  );
}

// ---------------- SEARCHABLE SINGLE SELECT ----------------
function SearchSelect({ value, onChange, items, getKey, getSub, placeholder, disabled }) {
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

  const selected = (items || []).find((i) => i.id === Number(value));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter(
      (i) =>
        (!q ||
          getKey(i)?.toLowerCase().includes(q) ||
          getSub(i)?.toLowerCase().includes(q))
    );
  }, [items, search, getKey, getSub]);

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
        onChange(filtered[highlight].id);
        setSearch("");
        setOpen(false);
      } else {
        setOpen(true);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={styles.searchSelectBox} ref={boxRef}>
      <div
        className={`${styles.searchSelectValue} ${disabled ? styles.disabled : ""}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        role="combobox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span className={styles.ssAvatar}>{(getKey(selected) || "?").charAt(0).toUpperCase()}</span>
            <span className={styles.ssText}>
              <strong>{getKey(selected)}</strong>
              {getSub(selected) && <small>{getSub(selected)}</small>}
            </span>
          </>
        ) : (
          <span className={styles.ssPlaceholder}>{placeholder || "Select…"}</span>
        )}
        <span className={styles.ssCaret}>▾</span>
      </div>

      {open && !disabled && (
        <div className={styles.searchSelectDrop}>
          <input
            autoFocus
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKey}
            placeholder="Type to search… (↑↓ + Enter)"
            aria-label="Search options"
          />
          <div className={styles.ssList} role="listbox">
            {filtered.length === 0 && (
              <div className={styles.ssEmpty}>No matches found</div>
            )}
            {filtered.slice(0, 50).map((i, idx) => (
              <div
                key={i.id}
                role="option"
                aria-selected={Number(value) === i.id}
                className={`${styles.ssItem} ${idx === highlight ? styles.ssHighlight : ""} ${Number(value) === i.id ? styles.ssSelected : ""}`}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => {
                  onChange(i.id);
                  setSearch("");
                  setOpen(false);
                }}
              >
                <span className={styles.ssAvatar}>{(getKey(i) || "?").charAt(0).toUpperCase()}</span>
                <span className={styles.ssText}>
                  <strong>{getKey(i)}</strong>
                  {getSub(i) && <small>{getSub(i)}</small>}
                </span>
                {Number(value) === i.id && <span className={styles.ssTick}>✓</span>}
              </div>
            ))}
            {filtered.length > 50 && (
              <div className={styles.ssEmpty}>Showing first 50 — refine your search</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
