import React, { useEffect, useMemo, useState } from "react";
import {
  FiUser,
  FiPhone,
  FiBriefcase,
  FiShield,
  FiCheckCircle,
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiMail,
} from "react-icons/fi";
import styles from "./Forms.module.css";
import { ROLES } from "../../constants/roles";
import { EMPLOYMENT_TYPES } from "../../constants/accountStatus";

const STEPS = [
  { label: "Basic", sub: "Name & identity", icon: FiUser },
  { label: "Contact", sub: "Phones & address", icon: FiPhone },
  { label: "Employment", sub: "Job & experience", icon: FiBriefcase },
  { label: "Role & Access", sub: "Permissions", icon: FiShield },
  { label: "Review", sub: "Confirm & create", icon: FiCheckCircle },
];

const EMPTY = {
  email: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  full_name: "",
  gender: "",
  date_of_birth: "",
  nationality: "",
  contact: "",
  secondary_email: "",
  primary_phone: "",
  secondary_phone: "",
  country: "",
  state: "",
  city: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
  employee_id: "",
  designation: "",
  department: "",
  employment_type: "",
  joining_date: "",
  years_of_experience: "",
  professional_summary: "",
  current_specialization: "",
  role: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UserForm({ initialData = null, onSubmit }) {
  const isEdit = Boolean(initialData);
  const [step, setStep] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      const next = { ...EMPTY };
      Object.keys(next).forEach((k) => {
        next[k] = initialData[k] ?? "";
      });
      next.years_of_experience =
        initialData.years_of_experience ?? initialData.years_of_experience === 0 ? String(initialData.years_of_experience) : "";
      setForm(next);
    } else {
      setForm(EMPTY);
    }
    setStep(0);
    setMaxVisited(0);
    setErrors({});
  }, [initialData]);

  const fullNamePreview = useMemo(() => {
    if (form.full_name.trim()) return form.full_name.trim();
    return [form.first_name, form.middle_name, form.last_name]
      .map((s) => (s || "").trim())
      .filter(Boolean)
      .join(" ");
  }, [form]);

  const set = (name, value) => {
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((p) => ({ ...p, [name]: "" }));
  };

  const validateStep = (s) => {
    const e = {};
    if (s === 0) {
      if (!isEdit && !EMAIL_RE.test(form.email.trim())) e.email = "Valid email required";
      if (!fullNamePreview) e.full_name = "Full name (or first + last) required";
      if (form.date_of_birth) {
        const dob = new Date(form.date_of_birth);
        if (Number.isNaN(dob.getTime())) e.date_of_birth = "Invalid date";
        else if (dob > new Date()) e.date_of_birth = "Cannot be in the future";
      }
    }
    if (s === 1) {
      if (form.secondary_email && !EMAIL_RE.test(form.secondary_email.trim()))
        e.secondary_email = "Invalid email";
    }
    if (s === 2) {
      if (form.years_of_experience !== "" && Number(form.years_of_experience) < 0)
        e.years_of_experience = "Cannot be negative";
      if (form.employment_type && !EMPLOYMENT_TYPES.includes(form.employment_type))
        e.employment_type = "Invalid type";
    }
    if (s === 3 && !isEdit && !Object.values(ROLES).includes(form.role))
      e.role = "Select a valid role";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (validateStep(step)) {
      setStep((s) => {
        const n = Math.min(s + 1, STEPS.length - 1);
        setMaxVisited((m) => Math.max(m, n));
        return n;
      });
    }
  };

  const gotoStep = (i) => {
    if (isEdit) return;
    if (i <= maxVisited) {
      setStep(i);
      setErrors({});
    }
  };

  const submit = async (ev) => {
    ev?.preventDefault();
    for (let s = 0; s <= 3; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    const num = (v) => (v === "" || v == null ? undefined : Number(v));
    const clean = (v) => (v === "" ? undefined : v);
    const payload = {
      ...(isEdit ? {} : { email: form.email.trim() }),
      full_name: fullNamePreview,
      first_name: clean(form.first_name.trim()),
      middle_name: clean(form.middle_name.trim()),
      last_name: clean(form.last_name.trim()),
      gender: clean(form.gender),
      date_of_birth: clean(form.date_of_birth),
      nationality: clean(form.nationality.trim()),
      contact: clean(form.contact.trim()) || clean(form.primary_phone.trim()),
      secondary_email: clean(form.secondary_email.trim()),
      primary_phone: clean(form.primary_phone.trim()),
      secondary_phone: clean(form.secondary_phone.trim()),
      country: clean(form.country.trim()),
      state: clean(form.state.trim()),
      city: clean(form.city.trim()),
      address_line1: clean(form.address_line1.trim()),
      address_line2: clean(form.address_line2.trim()),
      postal_code: clean(form.postal_code.trim()),
      emergency_contact_name: clean(form.emergency_contact_name.trim()),
      emergency_contact_relationship: clean(form.emergency_contact_relationship.trim()),
      emergency_contact_phone: clean(form.emergency_contact_phone.trim()),
      employee_id: clean(form.employee_id.trim()),
      designation: clean(form.designation.trim()),
      department: clean(form.department.trim()),
      employment_type: clean(form.employment_type),
      joining_date: clean(form.joining_date),
      years_of_experience: num(form.years_of_experience),
      professional_summary: clean(form.professional_summary),
      current_specialization: clean(form.current_specialization.trim()),
      ...(isEdit ? {} : { role: form.role }),
    };
    try {
      setSubmitting(true);
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label, name, props = {}) => (
    <div className={styles.field}>
      <label htmlFor={`userform-${name}`}>{label}{props.required ? " *" : ""}</label>
      <input id={`userform-${name}`} name={name} value={form[name]} onChange={(e) => set(name, e.target.value)} {...props} />
      {errors[name] && <span className={styles.errorMsg}>{errors[name]}</span>}
    </div>
  );

  const selectField = (label, name, children, required) => (
    <div className={styles.field}>
      <label htmlFor={`userform-${name}`}>{label}{required ? " *" : ""}</label>
      <select id={`userform-${name}`} name={name} value={form[name]} onChange={(e) => set(name, e.target.value)} required={required}>
        {children}
      </select>
      {errors[name] && <span className={styles.errorMsg}>{errors[name]}</span>}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={submit}>
      <h3 className={styles.formTitle}>{isEdit ? "Edit User" : "Create User Profile"}</h3>
      <p className={styles.formSub}>
        {isEdit
          ? "Update profile details, employment info and contact data."
          : "Set up the professional profile. An invitation activates the account later."}
      </p>

      {!isEdit && (
        <>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <p className={styles.hint}>
            Step {step + 1} of {STEPS.length} — {STEPS[step].label}. Experience, education,
            skills and certifications are added from the profile page after creation.
          </p>
          <div className={styles.stepper}>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step || (i < maxVisited && i !== step);
              const active = i === step;
              const clickable = i <= maxVisited && i !== step;
              return (
                <React.Fragment key={s.label}>
                  {i > 0 && (
                    <span className={`${styles.stepConnector} ${i <= step ? styles.done : ""}`} />
                  )}
                  <button
                    type="button"
                    className={`${styles.stepBtn} ${done ? styles.done : ""} ${active ? styles.active : ""} ${clickable ? styles.clickable : ""}`}
                    onClick={() => gotoStep(i)}
                    disabled={!clickable}
                    aria-label={`Go to step ${s.label}`}
                    title={clickable ? `Back to ${s.label}` : s.label}
                  >
                    <span className={styles.stepCircle}>
                      {done ? <FiCheck /> : <Icon />}
                    </span>
                    <span className={styles.stepText}>
                      <strong>{s.label}</strong>
                      <small>{s.sub}</small>
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}

      <div className={styles.stepPanel} key={isEdit ? "edit" : step}>

      {(isEdit || step === 0) && (
        <div className={styles.row}>
          {!isEdit && (
            <div className={styles.full}>
              {field("Primary Email (login identity)", "email", { type: "email", placeholder: "user@example.com", required: true })}
            </div>
          )}
          <div className={styles.full}>
            {field("Full Name", "full_name", { placeholder: "Auto-filled from parts below if empty" })}
          </div>
          {field("First Name", "first_name", { placeholder: "First name" })}
          {field("Last Name", "last_name", { placeholder: "Last name" })}
          {field("Middle Name", "middle_name", { placeholder: "Middle name (optional)" })}
          {selectField("Gender", "gender",
            <>
              <option value="">Select</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
              <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
            </>)}
          {field("Date of Birth", "date_of_birth", { type: "date" })}
          {field("Nationality", "nationality", { placeholder: "Nationality" })}
        </div>
      )}

      {(isEdit || step === 1) && (
        <div className={styles.row}>
          {field("Contact Number", "contact", { placeholder: "+91 98765 43210" })}
          {field("Secondary Email", "secondary_email", { type: "email", placeholder: "Optional" })}
          {field("Primary Phone", "primary_phone", { placeholder: "Optional" })}
          {field("Secondary Phone", "secondary_phone", { placeholder: "Optional" })}
          {field("Country", "country", {})}
          {field("State", "state", {})}
          {field("City", "city", {})}
          {field("Postal Code", "postal_code", {})}
          {field("Address Line 1", "address_line1", {})}
          {field("Address Line 2", "address_line2", {})}
          {field("Emergency Contact Name", "emergency_contact_name", {})}
          {field("Emergency Contact Relationship", "emergency_contact_relationship", {})}
          <div className={styles.full}>
            {field("Emergency Contact Phone", "emergency_contact_phone", {})}
          </div>
        </div>
      )}

      {(isEdit || step === 2) && (
        <div className={styles.row}>
          {field("Employee ID", "employee_id", { placeholder: "Must be unique" })}
          {field("Designation", "designation", { placeholder: "e.g. Site Engineer" })}
          {field("Department", "department", { placeholder: "e.g. Geotechnical" })}
          {field("Current Specialization", "current_specialization", {})}
          {selectField("Employment Type", "employment_type",
            <>
              <option value="">Select</option>
              {EMPLOYMENT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </>)}
          {field("Joining Date", "joining_date", { type: "date" })}
          {field("Years of Experience", "years_of_experience", { type: "number", min: 0, step: 0.5 })}
          <div className={styles.full}>
            <div className={styles.field}>
              <label htmlFor="userform-professional_summary">Professional Summary</label>
              <textarea id="userform-professional_summary" name="professional_summary" value={form.professional_summary} onChange={(e) => set("professional_summary", e.target.value)} rows={3} />
            </div>
          </div>
        </div>
      )}

      {(!isEdit && step === 3) && (
        <div className={styles.row}>
          <div className={styles.full}>
            {selectField("Role", "role",
              <>
                <option value="">Select Role</option>
                <option value={ROLES.SUPERVISOR}>SUPERVISOR — field execution (assignable to projects)</option>
                <option value={ROLES.ADMIN}>ADMIN — user + project management</option>
                <option value={ROLES.MONITOR}>MONITOR — read-only oversight (views + audit logs, no actions)</option>
                <option value={ROLES.SUPERADMIN}>SUPERADMIN — full access</option>
              </>, true)}
            <p className={styles.hint}>Role grants permissions only. Project assignment is done separately, and only ACTIVE supervisors are eligible.</p>
          </div>
        </div>
      )}

      {(!isEdit && step === 4) && (
        <>
          <div className={styles.reviewCard}>
            <div className={styles.reviewHead}>
              <span className={styles.reviewAvatar}>
                {(fullNamePreview || form.email || "U").charAt(0).toUpperCase()}
              </span>
              <div>
                <h4>{fullNamePreview || "Unnamed profile"}</h4>
                <p>{form.email}</p>
              </div>
              <span className={styles.roleBadge}>{form.role || "No role"}</span>
            </div>
            <div className={styles.reviewGrid}>
              <div className={styles.reviewRow}><span>Employee ID</span><strong>{form.employee_id || "-"}</strong></div>
              <div className={styles.reviewRow}><span>Designation</span><strong>{form.designation || "-"}</strong></div>
              <div className={styles.reviewRow}><span>Department</span><strong>{form.department || "-"}</strong></div>
              <div className={styles.reviewRow}><span>Contact</span><strong>{form.contact || form.primary_phone || "-"}</strong></div>
              <div className={styles.reviewRow}><span>Location</span><strong>{[form.city, form.country].filter(Boolean).join(", ") || "-"}</strong></div>
              <div className={styles.reviewRow}><span>Experience</span><strong>{form.years_of_experience !== "" ? `${form.years_of_experience} yrs` : "-"}</strong></div>
            </div>
          </div>
          <p className={styles.reviewNote}>
            <FiMail />
            <span>Saving creates an <b>INVITED</b> profile. Send an invitation from the user list — the account activates only when the user accepts it.</span>
          </p>
        </>
      )}

      </div>

      <div className={styles.formActions}>
        {!isEdit && step > 0 && (
          <button type="button" className={styles.secondaryBtn} onClick={() => setStep((s) => s - 1)}><FiArrowLeft /> Back</button>
        )}
        {!isEdit && step < STEPS.length - 1 && (
          <button type="button" className={styles.submitBtn} onClick={next}>Continue <FiArrowRight /></button>
        )}
        {(isEdit || step === STEPS.length - 1) && (
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? "Saving..." : isEdit ? "Update User" : <><FiCheck /> Create Profile</>}
          </button>
        )}
      </div>
    </form>
  );
}
