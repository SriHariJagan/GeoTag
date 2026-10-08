import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiUser, FiMail, FiPhone, FiBriefcase, FiMapPin,
  FiAward, FiTool, FiFileText, FiActivity, FiShield,
  FiEdit2, FiTrash2, FiPlus, FiCheckCircle, FiClock, FiAlertCircle,
} from "react-icons/fi";
import { useUsers } from "../../store/context/UserContext";
import { useAuth } from "../../store/context/AuthContext";
import Modal from "../../Components/Modal/Modal";
import UserForm from "../../Components/Forms/UserForm";
import Toast from "../../Components/Toast/Toast";
import { useToast } from "../../Components/Toast/useToast";
import { can, PERMISSIONS } from "../../constants/permissions";
import { normalizeRole } from "../../constants/permissions";
import { ROLES } from "../../constants/roles";
import {
  listExperience, addExperience, deleteExperience,
  listEducation, addEducation, deleteEducation,
  listSkills, addSkill, deleteSkill,
  listCertifications, addCertification, deleteCertification,
  listLicenses, addLicense, deleteLicense,
  listDocuments, addDocumentMeta,
  getSupervisorProfile, upsertSupervisorProfile,
  getUserAudit, getUserActivity,
} from "../../api/auth.api";
import { getMyProjects } from "../../api/projects.api";
import styles from "./UserProfile.module.css";

const TABS = [
  "Overview", "Experience", "Education", "Skills",
  "Certifications", "Licenses", "Documents", "Supervisor", "Assignments", "Audit",
];

const photoUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.VITE_API_URL || "";
  const origin = base ? new URL(base, window.location.origin).origin : "";
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
};

const prettyRole = (role) =>
  role ? role.charAt(0) + role.slice(1).toLowerCase() : "—";

const fmtDateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

export default function UserProfile({ userId }) {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  // Embedded "my profile" usage passes userId directly (no :id in route).
  const id = userId ?? paramId;
  const backTo = currentUser?.role === ROLES.SUPERVISOR ? "/supervisor/my-projects" : "/admin/users";
  const {
    fetchDetail, updateUser, fetchEligibility, fetchAssignments,
    assignToProject, endUserAssignment,
  } = useUsers();
  const { toasts, push, dismiss } = useToast();

  const [detail, setDetail] = useState(null);
  const [elig, setElig] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [activity, setActivity] = useState([]);
  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  // sub-resource state
  const [exp, setExp] = useState([]);
  const [edu, setEdu] = useState([]);
  const [skills, setSkills] = useState([]);
  const [certs, setCerts] = useState([]);
  const [lics, setLics] = useState([]);
  const [docs, setDocs] = useState([]);
  const [supProfile, setSupProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [assignForm, setAssignForm] = useState({ project_id: "", notes: "" });

  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;
  const isMonitor = normalizeRole(currentUser?.role) === ROLES.MONITOR;
  // Monitors are strictly read-only — not even their own profile.
  const canEdit = !isMonitor && (can(currentUser, PERMISSIONS.USER_UPDATE) || Number(id) === currentUser?.id);
  const adminLike = can(currentUser, PERMISSIONS.PROJECT_ASSIGN);
  const canViewAudit = adminLike || isMonitor;

  const reload = async () => {
    try {
      setLoading(true);
      setError("");
      const [d, e, a] = await Promise.all([
        fetchDetail(id),
        fetchEligibility(id).catch(() => null),
        fetchAssignments(id).catch(() => []),
      ]);
      setDetail(d);
      setElig(e);
      setAssignments(a || []);
      const [ex, ed, sk, ce, li, dc] = await Promise.all([
        listExperience(id).then((r) => r.data).catch(() => []),
        listEducation(id).then((r) => r.data).catch(() => []),
        listSkills(id).then((r) => r.data).catch(() => []),
        listCertifications(id).then((r) => r.data).catch(() => []),
        listLicenses(id).then((r) => r.data).catch(() => []),
        listDocuments(id).then((r) => r.data).catch(() => []),
      ]);
      setExp(ex); setEdu(ed); setSkills(sk); setCerts(ce); setLics(li); setDocs(dc);
      if (normalizeRole(d.role) === "SUPERVISOR") {
        getSupervisorProfile(id).then((r) => setSupProfile(r.data)).catch(() => setSupProfile(null));
      }
      if (adminLike) {
        getMyProjects().then((r) => setProjects(r.data || [])).catch(() => setProjects([]));
      }
      if (canViewAudit) {
        getUserAudit(id, { page: 1, limit: 100 }).then((r) => setAudit(r.data || [])).catch(() => setAudit([]));
        getUserActivity(id, { page: 1, limit: 100 }).then((r) => setActivity(r.data || [])).catch(() => setActivity([]));
      }
    } catch (err) {
      setError(errMsg(err, "Failed to load profile"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className={styles.page}><div className={styles.stateCard}>Loading profile…</div></div>;
  if (error) return <div className={styles.page}><div className={styles.stateCard}><p>{error}</p><button className={styles.primary} onClick={() => navigate(backTo)}>Back</button></div></div>;
  if (!detail) return null;

  const activeAssignments = assignments.filter((a) => a.status === "ACTIVE");
  const profileFields = [
    detail.first_name, detail.last_name, detail.gender, detail.date_of_birth,
    detail.primary_phone, detail.city, detail.state, detail.country,
    detail.employee_id, detail.designation, detail.department,
    detail.employment_type, detail.joining_date, detail.professional_summary,
  ];
  const completeness = Math.round(
    (profileFields.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length / profileFields.length) * 100
  );

  const tabCount = {
    Experience: exp.length, Education: edu.length, Skills: skills.length,
    Certifications: certs.length, Licenses: lics.length, Documents: docs.length,
    Assignments: assignments.length, Audit: audit.length + activity.length,
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <button className={styles.back} onClick={() => navigate(backTo)}><FiArrowLeft /> {currentUser?.role === ROLES.SUPERVISOR ? "My projects" : "Users"}</button>

      {/* ================= hero ================= */}
      <header className={styles.hero}>
        <span className={styles.avatar}>
          {photoUrl(detail.profile_photo) ? (
            <img src={photoUrl(detail.profile_photo)} alt={detail.full_name} />
          ) : (
            detail.full_name?.charAt(0)?.toUpperCase() || "U"
          )}
          <i className={styles.statusDot} data-active={detail.account_status === "ACTIVE" ? "1" : undefined} />
        </span>
        <div className={styles.heroMain}>
          <h1>{detail.full_name}</h1>
          <p>{detail.designation || "No designation"} · {detail.employee_id || "No employee ID"}</p>
          <div className={styles.badges}>
            <span className={styles.badge} data-tone="role">{prettyRole(detail.role)}</span>
            <span className={`${styles.badge} ${detail.account_status === "ACTIVE" ? styles.green : styles.amber}`}>
              {detail.account_status}
            </span>
            {elig && (
              elig.eligible
                ? <span className={`${styles.badge} ${styles.green}`}><FiCheckCircle /> Assignable</span>
                : <span className={`${styles.badge} ${styles.red}`}><FiAlertCircle /> {elig.reason || "Not eligible"}</span>
            )}
          </div>
        </div>
        {canEdit && <button className={styles.primary} onClick={() => setEditOpen(true)}><FiEdit2 /> Edit Profile</button>}
      </header>

      {/* ================= stats ================= */}
      <div className={styles.statGrid}>
        <Stat icon={<FiUser />} label="Profile complete" value={`${completeness}%`} tone="blue" />
        <Stat icon={<FiBriefcase />} label="Active assignments" value={String(activeAssignments.length)} tone="green" />
        <Stat icon={<FiActivity />} label="Logged operations" value={String(activity.length)} tone="violet" />
        <Stat icon={<FiShield />} label="Account" value={detail.account_status || "—"} tone={detail.account_status === "ACTIVE" ? "green" : "amber"} />
      </div>

      {/* ================= tabs ================= */}
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? styles.tabActive : styles.tab}
            onClick={() => setTab(t)}
          >
            {t}
            {tabCount[t] > 0 && <em>{tabCount[t]}</em>}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          <Section icon={<FiUser />} title="Personal Information" rows={[
            ["First Name", detail.first_name], ["Middle Name", detail.middle_name],
            ["Last Name", detail.last_name], ["Gender", detail.gender],
            ["Date of Birth", detail.date_of_birth], ["Nationality", detail.nationality],
          ]} />
          <Section icon={<FiMail />} title="Contact Information" rows={[
            ["Primary Email (login)", detail.email], ["Secondary Email", detail.secondary_email],
            ["Contact", detail.contact], ["Primary Phone", detail.primary_phone],
            ["Secondary Phone", detail.secondary_phone], ["Country", detail.country],
            ["State", detail.state], ["City", detail.city],
            ["Address 1", detail.address_line1], ["Address 2", detail.address_line2],
            ["Postal Code", detail.postal_code],
          ]} />
          <Section icon={<FiPhone />} title="Emergency Contact" rows={[
            ["Name", detail.emergency_contact_name], ["Relationship", detail.emergency_contact_relationship],
            ["Phone", detail.emergency_contact_phone],
            ["Secondary Phone", detail.emergency_contact_secondary_phone],
            ["Email", detail.emergency_contact_email],
          ]} />
          <Section icon={<FiBriefcase />} title="Employment Information" rows={[
            ["Employee ID", detail.employee_id], ["Designation", detail.designation],
            ["Department", detail.department], ["Employment Type", detail.employment_type],
            ["Joining Date", detail.joining_date], ["Experience (yrs)", detail.years_of_experience],
            ["Specialization", detail.current_specialization],
          ]} />
          <div className={styles.card}>
            <h3><FiFileText className={styles.headIcon} /> Professional Summary</h3>
            <p className={styles.summary}>{detail.professional_summary || "No summary recorded."}</p>
          </div>
        </>
      )}

      {tab === "Experience" && (
        <SubList
          items={exp} onDelete={canEdit ? async (x) => { await deleteExperience(id, x.id); reload(); } : null}
          render={(x) => (<><b>{x.job_title}</b> @ {x.company_name}<br /><span>{x.start_date || "?"} – {x.currently_working ? "Present" : x.end_date || "?"}{x.location ? ` · ${x.location}` : ""}</span></>)}
          form={canEdit ? <MiniForm fields={[["company_name", "Company *"], ["job_title", "Job Title *"], ["location", "Location"]]} onSubmit={async (v) => { await addExperience(id, v); reload(); }} /> : null}
          empty="No experience records."
        />
      )}

      {tab === "Education" && (
        <SubList
          items={edu} onDelete={canEdit ? async (x) => { await deleteEducation(id, x.id); reload(); } : null}
          render={(x) => (<><b>{x.qualification}</b>{x.specialization ? ` — ${x.specialization}` : ""}<br /><span>{x.institution || x.university || ""} {x.start_year || ""}{x.end_year ? `–${x.end_year}` : ""}</span></>)}
          form={canEdit ? <MiniForm fields={[["qualification", "Qualification *"], ["specialization", "Specialization"], ["institution", "Institution"]]} onSubmit={async (v) => { await addEducation(id, v); reload(); }} /> : null}
          empty="No education records."
        />
      )}

      {tab === "Skills" && (
        <SkillsSection
          skills={skills}
          canEdit={canEdit}
          onAdd={async (v) => { await addSkill(id, v); reload(); push("Skill added", "success"); }}
          onDelete={async (x) => { await deleteSkill(id, x.id); reload(); }}
        />
      )}

      {tab === "Certifications" && (
        <SubList
          items={certs} onDelete={canEdit ? async (x) => { await deleteCertification(id, x.id); reload(); } : null}
          render={(x) => (<><b>{x.certification_name}</b> {x.is_expired ? <span className={`${styles.badge} ${styles.red}`}>EXPIRED</span> : null}<br /><span>{x.issuing_organization || ""} · {x.issue_date || "?"} → {x.expiry_date || "?"}</span></>)}
          form={canEdit ? <MiniForm fields={[["certification_name", "Name *"], ["issuing_organization", "Issuer"], ["issue_date", "Issue Date (YYYY-MM-DD)"], ["expiry_date", "Expiry Date (YYYY-MM-DD)"]]} onSubmit={async (v) => { await addCertification(id, v); reload(); }} /> : null}
          empty="No certifications."
        />
      )}

      {tab === "Licenses" && (
        <SubList
          items={lics} onDelete={canEdit ? async (x) => { await deleteLicense(id, x.id); reload(); } : null}
          render={(x) => (<><b>{x.license_name}</b> {x.is_expired ? <span className={`${styles.badge} ${styles.red}`}>EXPIRED</span> : null}<br /><span>{x.issuing_authority || ""} · {x.license_number || ""}</span></>)}
          form={canEdit ? <MiniForm fields={[["license_name", "License *"], ["license_number", "Number"], ["issuing_authority", "Authority"]]} onSubmit={async (v) => { await addLicense(id, v); reload(); }} /> : null}
          empty="No licenses."
        />
      )}

      {tab === "Documents" && (
        <div className={styles.card}>
          <h3><FiFileText className={styles.headIcon} /> Professional Documents</h3>
          <p className={styles.muted}>Metadata only — file storage is an explicit next phase. New records are stored as PENDING.</p>
          {docs.length === 0 && <p className={styles.muted}>No documents.</p>}
          <div className={styles.docGrid}>
            {docs.map((d) => (
              <div key={d.id} className={styles.docRow}>
                <FiFileText />
                <div><b>{d.document_type}</b><span>{d.file_name || "no file"} · {d.storage_status}</span></div>
              </div>
            ))}
          </div>
          {canEdit && <MiniForm fields={[["document_type", "Type (RESUME|DEGREE|LICENSE|ID|OTHER) *"], ["file_name", "File name"]]} onSubmit={async (v) => { await addDocumentMeta(id, v); reload(); }} />}
        </div>
      )}

      {tab === "Supervisor" && (
        <div className={styles.card}>
          <h3><FiAward className={styles.headIcon} /> Supervisor Information</h3>
          {normalizeRole(detail.role) !== "SUPERVISOR" ? (
            <p className={styles.muted}>Supervisor fields apply only when role is SUPERVISOR. Change the role from the user list to enable this section.</p>
          ) : (
            <>
              {supProfile ? (
                <dl className={styles.grid}>
                  <Fact label="Site Experience" value={supProfile.site_experience_years} />
                  <Fact label="Drilling Experience" value={supProfile.drilling_experience_years} />
                  <Fact label="Specializations" value={supProfile.specializations} />
                  <Fact label="Availability" value={supProfile.current_availability} />
                </dl>
              ) : <p className={styles.muted}>No supervisor profile yet.</p>}
              {adminLike && (
                <MiniForm
                  fields={[["supervisor_experience_years", "Supervisor Exp (yrs)"], ["site_experience_years", "Site Exp (yrs)"], ["specializations", "Specializations (comma-separated)"], ["current_availability", "Availability"]]}
                  onSubmit={async (v) => { await upsertSupervisorProfile(id, v); reload(); push("Supervisor profile saved", "success"); }}
                />
              )}
            </>
          )}
        </div>
      )}

      {tab === "Assignments" && (
        <div className={styles.card}>
          <h3><FiMapPin className={styles.headIcon} /> Project Assignments</h3>
          {assignments.length === 0 && <p className={styles.muted}>No assignments. History is preserved here when assignments change.</p>}
          <div className={styles.assignGrid}>
            {assignments.map((a) => (
              <div key={a.id} className={styles.assignRow}>
                <div><b>Project #{a.project_id}</b><span>{a.assignment_role}</span></div>
                <span className={`${styles.badge} ${a.status === "ACTIVE" ? styles.green : styles.amber}`}>{a.status}</span>
                {a.status === "ACTIVE" && adminLike && (
                  <button className={styles.mini} onClick={async () => { await endUserAssignment(a.id, "Completed"); reload(); }}>End</button>
                )}
              </div>
            ))}
          </div>
          {adminLike && (
            <form
              className={styles.assignForm}
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await assignToProject({ project_id: Number(assignForm.project_id), user_id: Number(id), notes: assignForm.notes });
                  setAssignForm({ project_id: "", notes: "" });
                  reload();
                  push("Supervisor assigned", "success");
                } catch (err) {
                  push(errMsg(err, "Assignment failed"), "error");
                }
              }}
            >
              <select value={assignForm.project_id} onChange={(e) => setAssignForm((p) => ({ ...p, project_id: e.target.value }))} required>
                <option value="">Select project</option>
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.project_code || p.id} — {p.name}</option>))}
              </select>
              <input placeholder="Notes (optional)" value={assignForm.notes} onChange={(e) => setAssignForm((p) => ({ ...p, notes: e.target.value }))} />
              <button type="submit" className={styles.primary}>Assign (ACTIVE supervisors only)</button>
            </form>
          )}
        </div>
      )}

      {tab === "Audit" && (
        <div className={styles.auditWrap}>
          <div className={styles.card}>
            <h3><FiActivity className={styles.headIcon} /> Operations performed by this user <em className={styles.count}>{activity.length}</em></h3>
            {activity.length === 0 && <p className={styles.muted}>No logged operations yet. Reads are not logged — only creates, updates, approvals and assignments.</p>}
            <div className={styles.timeline}>
              {activity.map((a) => (
                <div key={a.id} className={styles.tItem}>
                  <span className={styles.tDot} />
                  <div className={styles.tMain}>
                    <strong>{prettyAction(a.action)}</strong>
                    <span>{a.target_type ? `${a.target_type} #${a.target_id ?? "—"}` : "system"}{a.meta_info ? ` · ${shortMeta(a.meta_info)}` : ""}</span>
                  </div>
                  <span className={styles.tTime}><FiClock /> {fmtDateTime(a.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.card}>
            <h3><FiShield className={styles.headIcon} /> Changes to this account <em className={styles.count}>{audit.length}</em></h3>
            {audit.length === 0 && <p className={styles.muted}>No account changes recorded.</p>}
            <div className={styles.timeline}>
              {audit.map((a) => (
                <div key={a.id} className={styles.tItem}>
                  <span className={styles.tDot} data-alt="1" />
                  <div className={styles.tMain}>
                    <strong>{prettyAction(a.action)}</strong>
                    <span>by user #{a.actor_id ?? "—"}{a.meta_info ? ` · ${shortMeta(a.meta_info)}` : ""}</span>
                  </div>
                  <span className={styles.tTime}><FiClock /> {fmtDateTime(a.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)}>
        <UserForm
          initialData={detail}
          onSubmit={async (payload) => {
            await updateUser(detail.id, payload);
            setEditOpen(false);
            reload();
            push("Profile updated", "success");
          }}
        />
      </Modal>
    </div>
  );
}

function Stat({ icon, label, value, tone }) {
  return (
    <div className={styles.stat} data-tone={tone}>
      <span className={styles.statIcon}>{icon}</span>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}

function Section({ icon, title, rows }) {
  return (
    <div className={styles.card}>
      <h3>{icon} {title}</h3>
      <dl className={styles.grid}>
        {rows.map(([k, v]) => (
          <Fact key={k} label={k} value={v} />
        ))}
      </dl>
    </div>
  );
}

function Fact({ label, value }) {
  const empty = value === null || value === undefined || String(value).trim() === "";
  return (
    <div className={styles.fact} data-empty={empty ? "1" : undefined}>
      <dt>{label}</dt>
      <dd>{empty ? "—" : String(value)}</dd>
    </div>
  );
}

function prettyAction(a) {
  return String(a || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortMeta(meta) {
  try {
    const o = typeof meta === "string" ? JSON.parse(meta) : meta;
    return Object.entries(o).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ");
  } catch {
    return String(meta).slice(0, 120);
  }
}

function SubList({ items, render, form, onDelete, empty }) {
  return (
    <div className={styles.card}>
      {items.length === 0 && <p className={styles.muted}>{empty}</p>}
      <div className={styles.subGrid}>
        {items.map((x) => (
          <div key={x.id} className={styles.subRow}>
            <div className={styles.subMain}>{render(x)}</div>
            {onDelete && <button className={styles.miniDanger} onClick={() => onDelete(x)} aria-label="Delete record"><FiTrash2 /></button>}
          </div>
        ))}
      </div>
      {form}
    </div>
  );
}

const PROFICIENCY_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];

const levelRank = (p) => {
  const i = PROFICIENCY_LEVELS.indexOf(String(p || "").toUpperCase());
  return i === -1 ? 0 : i + 1;
};
const prettyLevel = (p) => {
  const s = String(p || "").toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
};

function SkillsSection({ skills, canEdit, onAdd, onDelete }) {
  const sorted = [...(skills || [])].sort(
    (a, b) =>
      levelRank(b.proficiency) - levelRank(a.proficiency) ||
      (Number(b.years_of_experience) || 0) - (Number(a.years_of_experience) || 0)
  );
  const top = sorted[0];
  return (
    <div className={styles.card}>
      <h3><FiTool className={styles.headIcon} /> Skills <em className={styles.count}>{skills.length}</em></h3>
      {skills.length === 0 && <p className={styles.muted}>No skills recorded yet — add the first one below.</p>}
      {top && skills.length > 1 && (
        <p className={styles.summary}>
          Strongest area: <b>{top.skill}</b> · {prettyLevel(top.proficiency)}{top.years_of_experience != null ? ` · ${top.years_of_experience} yrs` : ""}
        </p>
      )}
      <div className={styles.skillGridPro}>
        {sorted.map((x, i) => {
          const lvl = levelRank(x.proficiency);
          return (
            <div key={x.id} className={styles.skillCard} data-top={i === 0 && skills.length > 1 ? "1" : undefined}>
              <div className={styles.skillTop}>
                <span className={styles.skillIcon}><FiTool /></span>
                <div className={styles.skillName}>
                  <b>{x.skill}</b>
                  <span>{x.years_of_experience != null && x.years_of_experience !== "" ? `${x.years_of_experience} yrs experience` : "Experience not set"}</span>
                </div>
                {canEdit && (
                  <button className={styles.miniDanger} onClick={() => onDelete(x)} aria-label={`Delete ${x.skill}`}>
                    <FiTrash2 />
                  </button>
                )}
              </div>
              <div className={styles.skillMeta}>
                <span className={styles.levelPill} data-level={lvl}>{prettyLevel(x.proficiency)}</span>
                {i === 0 && skills.length > 1 && <span className={styles.topTag}><FiAward /> Top skill</span>}
              </div>
              <div className={styles.levelBar} role="img" aria-label={`${prettyLevel(x.proficiency)} — ${lvl} of 4`}>
                {[1, 2, 3, 4].map((n) => (
                  <i key={n} data-on={n <= lvl ? "1" : undefined} data-level={lvl} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {canEdit && (
        <MiniForm
          fields={[
            ["skill", "Skill *"],
            ["proficiency", "Proficiency *", { type: "select", options: PROFICIENCY_LEVELS.map((l) => ({ value: l, label: prettyLevel(l) })) }],
            ["years_of_experience", "Years", { type: "number", min: 0, step: 1, placeholder: "e.g. 8" }],
          ]}
          onSubmit={onAdd}
        />
      )}
    </div>
  );
}

function MiniForm({ fields, onSubmit }) {
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={styles.miniForm}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(vals);
          setVals({});
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map(([name, label, spec]) => (
        <label key={name} className={styles.miniField}>
          <span>{label}</span>
          {spec?.type === "select" ? (
            <select
              value={vals[name] || ""}
              onChange={(e) => setVals((p) => ({ ...p, [name]: e.target.value }))}
            >
              <option value="">Select…</option>
              {(spec.options || []).map((o) => (
                <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
              ))}
            </select>
          ) : (
            <input
              type={spec?.type || "text"}
              min={spec?.min}
              step={spec?.step}
              placeholder={spec?.placeholder}
              value={vals[name] || ""}
              onChange={(e) => setVals((p) => ({ ...p, [name]: e.target.value }))}
            />
          )}
        </label>
      ))}
      <button type="submit" className={styles.miniPrimary} disabled={busy}><FiPlus /> {busy ? "Adding…" : "Add"}</button>
    </form>
  );
}
