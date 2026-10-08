import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiMapPin,
  FiCalendar,
  FiUsers,
  FiTruck,
  FiClipboard,
  FiFileText,
  FiDownload,
  FiEye,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiActivity,
  FiTool,
  FiBarChart2,
  FiX,
} from "react-icons/fi";
import styles from "./ProjectDetails.module.css";
import {
  getProjectById,
  changeProjectStatus,
  listProjectAssignments,
  getProjectAudit,
  getProjectTimeline,
  assignVendor as assignVendorApi,
  assignMachine as assignMachineApi,
} from "../../api/projects.api";
import {
  listRFQs,
  listWorkOrders,
  listVendorAssignments,
  openAuthedFile,
  downloadAuthedFile,
} from "../../api/procurement.api";
import { getAllDailyReports } from "../../api/dailyExecution.api";
import { getProjectExpenditures } from "../../api/expenditures.api";
import { getProjectCostLedger, getProjectAttendance } from "../../api/projects.api";
import { delayRisk, costRisk } from "../../api/analytics.api";
import { useAuth } from "../../store/context/AuthContext";
import { useUsers } from "../../store/context/UserContext";
import { can, PERMISSIONS } from "../../constants/permissions";
import { ROLES } from "../../constants/roles";
import Toast from "../Toast/Toast";
import { useToast } from "../Toast/useToast";

const TABS = [
  { key: "Overview", icon: <FiActivity /> },
  { key: "Work Orders", icon: <FiClipboard /> },
  { key: "Supervisors", icon: <FiUsers /> },
  { key: "Vendors", icon: <FiTruck /> },
  { key: "Machinery", icon: <FiTool /> },
  { key: "Daily Execution", icon: <FiClock /> },
  { key: "Expenditures", icon: <FiDollarSign /> },
  { key: "Cost Ledger", icon: <FiBarChart2 /> },
  { key: "Attendance", icon: <FiUsers /> },
  { key: "Documents", icon: <FiFileText /> },
  { key: "Audit Timeline", icon: <FiCheckCircle /> },
];

const NEXT_STATUS = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #2563eb, #0ea5e9)",
  "linear-gradient(135deg, #7c3aed, #db2777)",
  "linear-gradient(135deg, #0d9488, #22c55e)",
  "linear-gradient(135deg, #ea580c, #f59e0b)",
  "linear-gradient(135deg, #1d4ed8, #7c3aed)",
];

const avatarBg = (name) =>
  AVATAR_GRADIENTS[((name || "X").charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];

const normStatus = (s) => (s || "").toLowerCase().replace(/[\s_-]/g, "");

const statusClass = (s) => {
  const n = normStatus(s);
  if (["active", "ongoing", "accepted", "approved", "submitted"].includes(n))
    return styles.stActive;
  if (["completed", "closed", "finalized"].includes(n)) return styles.stSuccess;
  if (["onhold", "suspended", "rejected"].includes(n)) return styles.stWarn;
  if (["cancelled", "blacklisted", "deactivated"].includes(n)) return styles.stDanger;
  return styles.stNeutral;
};

const riskClass = (level) => {
  const l = (level || "").toLowerCase();
  if (l === "high") return styles.riskHigh;
  if (l === "medium") return styles.riskMedium;
  return styles.riskLow;
};

export default function ProjectDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { assignToProject, endUserAssignment, fetchEligibility } = useUsers();
  const { toasts, push, dismiss } = useToast();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Overview");
  const [assignments, setAssignments] = useState([]);
  const [rfqs, setRfqs] = useState([]);
  const [wos, setWos] = useState([]);
  const [vendorAssigns, setVendorAssigns] = useState([]);
  const [ders, setDers] = useState([]);
  const [exps, setExps] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [audit, setAudit] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [risk, setRisk] = useState({ delay: null, cost: null });
  const [assignForm, setAssignForm] = useState({ user_id: "", is_primary: false, notes: "" });
  const [userMap, setUserMap] = useState({});
  const [vendorForm, setVendorForm] = useState({ vendor_id: "" });
  const [machineForm, setMachineForm] = useState({ machine_id: "", force: false });
  const [busy, setBusy] = useState(false);

  const canManage = can(user, PERMISSIONS.PROJECT_UPDATE);
  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;
  // Supervisors share this page — keep every link inside their own routes.
  const isSupervisor = user?.role === ROLES.SUPERVISOR;
  const routeBase = isSupervisor ? "/supervisor" : "/admin";
  const projectsHome = isSupervisor ? "/supervisor/my-projects" : "/admin/projects";

  const reload = async () => {
    try {
      const res = await getProjectById(id);
      setProject(res.data);
      const [a, r, w, va, d, x] = await Promise.all([
        listProjectAssignments(id).then((y) => y.data).catch(() => []),
        listRFQs({ project_id: Number(id) }).then((y) => y.data).catch(() => []),
        listWorkOrders({ project_id: Number(id) }).then((y) => y.data).catch(() => []),
        listVendorAssignments({ project_id: Number(id) }).then((y) => y.data).catch(() => []),
        getAllDailyReports({ projectId: Number(id), limit: 20 }).then((y) => y.data).catch(() => []),
        getProjectExpenditures(Number(id)).then((y) => y).catch(() => []),
      ]);
      getProjectCostLedger(id)
        .then((y) => y.data)
        .catch(() => null)
        .then((d) => setLedger(d));
      getProjectAttendance(id)
        .then((y) => y.data)
        .catch(() => null)
        .then((d) => setAttendance(d));
      setAssignments(a || []);
      setRfqs(r || []);
      setWos(w || []);
      setVendorAssigns(va || []);
      setDers(d || []);
      setExps(x || []);
      try {
        const tl = await getProjectTimeline(id).then((y) => y.data).catch(() => []);
        setTimeline(tl || []);
      } catch {
        setTimeline([]);
      }
      try {
        const [dr, cr] = await Promise.all([
          delayRisk(id).then((y) => y.data).catch(() => null),
          costRisk(id).then((y) => y.data).catch(() => null),
        ]);
        setRisk({ delay: dr, cost: cr });
      } catch {
        setRisk({ delay: null, cost: null });
      }
      if (canManage) {
        try {
          const au = await getProjectAudit(id).then((y) => y.data);
          setAudit(au || []);
        } catch {
          setAudit([]);
        }
        try {
          const { getUsersAdmin } = await import("../../api/auth.api");
          const ul = await getUsersAdmin().then((y) => y.data).catch(() => []);
          const m = {};
          (ul || []).forEach((u) => {
            m[u.id] = u.full_name || u.email || `User #${u.id}`;
          });
          setUserMap(m);
        } catch {
          setUserMap({});
        }
      }
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.heroSk}>
          <span className={styles.skBar} style={{ width: "32%" }} />
          <span className={styles.skBar} style={{ width: "48%" }} />
        </div>
        <div className={styles.kpiGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.kpiSk} />
          ))}
        </div>
        <div className={styles.cardSk} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className={styles.page}>
        <div className={styles.stateCard}>
          <span className={styles.stateIcon}><FiX /></span>
          <h3>Project not found</h3>
          <p>It may have been deleted or you lack access.</p>
          <button className={styles.btnPrimary} onClick={() => navigate(projectsHome)}>
            <FiArrowLeft /> Back to projects
          </button>
        </div>
      </div>
    );
  }

  const supervisors = project.supervisors || [];
  const machinery = project.machinery || [];
  const vendors = project.vendors || [];
  const activeAssigns = assignments.filter((a) => a.status === "ACTIVE");
  const activeVendorAssigns = vendorAssigns.filter((a) => a.status === "ACTIVE");
  const activeWos = wos.filter((w) => !["CANCELLED", "CLOSED", "REJECTED"].includes(w.status));
  const totalExp = exps.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  const progressPercentage =
    project.total_boreholes > 0
      ? Math.round((project.completed_boreholes / project.total_boreholes) * 100)
      : Math.round(Number(project.progress) || 0);

  const lifecycleState = (project.status || "").toUpperCase();
  const nextStates = NEXT_STATUS[lifecycleState] || [];
  const base = import.meta.env.VITE_API_URL;

  const tabCount = (key) => {
    switch (key) {
      case "Work Orders": return wos.length;
      case "Supervisors": return activeAssigns.length;
      case "Vendors": return activeVendorAssigns.length;
      case "Machinery": return machinery.length;
      case "Daily Execution": return ders.length;
      case "Expenditures": return exps.length;
      case "Cost Ledger": return ledger?.machinery?.length || 0;
      case "Attendance": return attendance?.supervisors?.length || 0;
      case "Documents": return wos.filter((w) => w.pdf_path).length;
      case "Audit Timeline": return timeline.length;
      default: return null;
    }
  };

  const doLifecycle = async (s) => {
    setBusy(true);
    try {
      await changeProjectStatus(id, s);
      push(`Project → ${s}`, "success");
      reload();
    } catch (err) {
      push(errMsg(err, "Transition failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      <button className={styles.backLink} onClick={() => navigate(projectsHome)}>
        <FiArrowLeft /> {isSupervisor ? "My projects" : "All projects"}
      </button>

      {/* ---------- Hero ---------- */}
      <div className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroEyebrow}>
            <span className={styles.codeChip}>{project.project_code}</span>
            <span className={styles.heroClient}>{project.client_name || "-"}</span>
          </div>
          <h1>{project.name}</h1>
          <div className={styles.heroMeta}>
            <span><FiMapPin /> {project.location || "-"}</span>
            <span><FiCalendar /> {project.date || "-"}</span>
            <span><FiDollarSign /> {(project.project_budget ?? 0).toLocaleString()} {project.currency || "INR"}</span>
          </div>
          <div className={styles.progressWrap}>
            <div className={styles.progressTop}>
              <span>Execution progress</span>
              <b>{progressPercentage}%</b>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${Math.min(100, progressPercentage)}%` }}
              />
            </div>
          </div>
        </div>
        <div className={styles.heroSide}>
          <span className={`${styles.statusPill} ${statusClass(project.status)}`}>
            <span className={styles.dot} />
            {project.status}
          </span>
          {canManage && nextStates.length > 0 && (
            <div className={styles.lifecycle}>
              <span>Move to</span>
              <div className={styles.lifecycleBtns}>
                {nextStates.map((s) => (
                  <button key={s} disabled={busy} onClick={() => doLifecycle(s)}>
                    → {s.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- KPIs ---------- */}
      <div className={styles.kpiGrid}>
        <Kpi icon={<FiClipboard />} label="Work orders" value={`${activeWos.length} / ${wos.length}`} sub="active / total" />
        <Kpi icon={<FiUsers />} label="Supervisors" value={String(supervisors.length)} sub={`${activeAssigns.length} active assignments`} />
        <Kpi icon={<FiTruck />} label="Vendors" value={String(activeVendorAssigns.length)} sub="active assignments" />
        <Kpi icon={<FiTool />} label="Machinery" value={String(machinery.length)} sub="assigned" />
        <Kpi icon={<FiDollarSign />} label="Expenditure" value={totalExp.toLocaleString()} sub={project.currency || "INR"} />
        <Kpi
          icon={<FiAlertTriangle />}
          label="Delay risk"
          value={risk.delay ? risk.delay.risk : "—"}
          sub={risk.delay ? `score ${risk.delay.score}` : "no data"}
          tone={risk.delay ? riskClass(risk.delay.risk) : ""}
        />
        <Kpi
          icon={<FiActivity />}
          label="Cost risk"
          value={risk.cost ? risk.cost.risk : "—"}
          sub={risk.cost ? `score ${risk.cost.score}` : "no data"}
          tone={risk.cost ? riskClass(risk.cost.risk) : ""}
        />
        <Kpi icon={<FiClock />} label="Daily reports" value={String(ders.length)} sub="recent" />
      </div>

      {/* ---------- Tabs ---------- */}
      <div className={styles.tabBar} role="tablist">
        {TABS.map(({ key, icon }) => {
          const c = tabCount(key);
          return (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={`${styles.tabBtn} ${tab === key ? styles.tabOn : ""}`}
              onClick={() => setTab(key)}
            >
              <span className={styles.tabIcon}>{icon}</span>
              {key}
              {c != null && <span className={styles.tabCount}>{c}</span>}
            </button>
          );
        })}
      </div>

      {/* ---------- Overview ---------- */}
      {tab === "Overview" && (
        <div className={styles.grid2}>
          <div className={styles.card}>
            <h3>About this project</h3>
            <p className={styles.desc}>{project.description || "No description recorded."}</p>
            <dl className={styles.facts}>
              <div><dt>Client</dt><dd>{project.client_name || "-"}</dd></div>
              <div><dt>Client representative</dt><dd>{project.engineer_in_charge || "-"}</dd></div>
              <div><dt>Location</dt><dd>{project.location || "-"}</dd></div>
              <div><dt>Budget</dt><dd>{(project.project_budget ?? 0).toLocaleString()} {project.currency || "INR"}</dd></div>
              <div><dt>Type / Priority</dt><dd>{project.project_type || "-"} / {project.priority || "-"}</dd></div>
              <div><dt>Boreholes</dt><dd>{project.completed_boreholes ?? 0} / {project.total_boreholes ?? 0}</dd></div>
              <div><dt>Planned</dt><dd>{project.planned_start_date || "-"} → {project.planned_end_date || "-"}</dd></div>
              <div><dt>Actual</dt><dd>{project.actual_start_date || "-"} → {project.actual_end_date || "-"}</dd></div>
            </dl>
          </div>
          <div className={styles.card}>
            <h3>Forecasting</h3>
            <RiskRow
              label="Delay risk"
              data={risk.delay}
              empty="Delay analytics unavailable for this project."
            />
            <RiskRow
              label="Cost risk"
              data={risk.cost}
              empty="Cost analytics unavailable for this project."
              extra={
                risk.cost ? (
                  <p className={styles.note} style={{ marginTop: 8 }}>
                    Projected {(Number(risk.cost.projected_total_cost) || 0).toLocaleString()}{" "}
                    · overrun probability {Math.round((Number(risk.cost.cost_overrun_probability) || 0) * 100)}%
                    {(risk.cost.abnormal_cost_categories || []).length > 0 &&
                      ` · watch: ${risk.cost.abnormal_cost_categories.join(", ")}`}
                  </p>
                ) : null
              }
            />
          </div>
        </div>
      )}

      {/* ---------- Work Orders ---------- */}
      {tab === "Work Orders" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Work orders{!isSupervisor && " & RFQs"}</h3>
            {canManage && (
              <button className={styles.btnGhost} onClick={() => navigate("/admin/work-orders/new")}>
                + New work order
              </button>
            )}
          </div>
          {(isSupervisor ? wos.length === 0 : wos.length === 0 && rfqs.length === 0) && (
            <Empty text={isSupervisor ? "No work orders yet." : "No work orders or RFQs yet."} />
          )}
          <div className={styles.woList}>
            {wos.map((w) => (
              <div key={w.id} className={styles.woRow} onClick={() => navigate(`${routeBase}/work-orders/${w.id}`)}>
                <div className={styles.woMain}>
                  <strong>{w.work_order_number}</strong>
                  <span className={styles.woSub}>
                    {w.vendor_name || "Multi-vendor"} · {(w.grand_total ?? w.contract_value ?? 0).toLocaleString()} {w.currency}
                  </span>
                </div>
                <span className={`${styles.statusPill} ${statusClass(w.status)}`}>
                  <span className={styles.dot} />{w.status}
                </span>
              </div>
            ))}
            {!isSupervisor && rfqs.map((r) => (
              <div key={`rfq-${r.id}`} className={styles.woRow} onClick={() => navigate(`/admin/procurement/rfqs/${r.id}`)}>
                <div className={styles.woMain}>
                  <strong>RFQ {r.rfq_number}</strong>
                  <span className={styles.woSub}>{r.title} · {r.quotation_count ?? 0} quote(s)</span>
                </div>
                <span className={`${styles.statusPill} ${statusClass(r.status)}`}>
                  <span className={styles.dot} />{r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Supervisors ---------- */}
      {tab === "Supervisors" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Supervisors · {activeAssigns.length} active</h3>
          </div>
          {supervisors.length === 0 && assignments.length === 0 && (
            <Empty text="No supervisors assigned." />
          )}
          <div className={styles.personList}>
            {assignments.map((a) => (
              <div key={a.id} className={styles.personRow}>
                <span className={styles.avatar} style={{ background: avatarBg(userMap[a.user_id] || `user${a.user_id}`) }}>
                  {(userMap[a.user_id] || "U").charAt(0).toUpperCase()}
                </span>
                <div className={styles.personMain}>
                  <strong>{userMap[a.user_id] || `User #${a.user_id}`}</strong>
                  <span className={styles.personSub}>
                    {a.assignment_role} · {a.start_date || "—"} → {a.end_date || "—"}
                  </span>
                </div>
                {a.is_primary && <span className={styles.primaryChip}>Primary</span>}
                <span className={`${styles.statusPill} ${statusClass(a.status)}`}>
                  <span className={styles.dot} />{a.status}
                </span>
                {a.status === "ACTIVE" && canManage && (
                  <button
                    className={styles.btnDangerSm}
                    onClick={async () => {
                      try {
                        await endUserAssignment(a.id, "Assignment ended");
                        push("Assignment ended (history kept)", "success");
                        reload();
                      } catch (err) {
                        push(errMsg(err, "Failed"), "error");
                      }
                    }}
                  >
                    End
                  </button>
                )}
              </div>
            ))}
          </div>
          {canManage && (
            <form
              className={styles.assignForm}
              onSubmit={async (e) => {
                e.preventDefault();
                const elig = await fetchEligibility(assignForm.user_id).catch(() => null);
                if (elig && !elig.eligible) {
                  push(`Not eligible: ${elig.reason}`, "error");
                  return;
                }
                try {
                  await assignToProject({
                    project_id: Number(id),
                    user_id: Number(assignForm.user_id),
                    is_primary: assignForm.is_primary,
                    notes: assignForm.notes || undefined,
                  });
                  setAssignForm({ user_id: "", is_primary: false, notes: "" });
                  push("Supervisor assigned", "success");
                  reload();
                } catch (err) {
                  push(errMsg(err, "Assignment failed"), "error");
                }
              }}
            >
              <input
                placeholder="User ID (active supervisor)"
                value={assignForm.user_id}
                onChange={(e) => setAssignForm((p) => ({ ...p, user_id: e.target.value }))}
                required
              />
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={assignForm.is_primary}
                  onChange={(e) => setAssignForm((p) => ({ ...p, is_primary: e.target.checked }))}
                /> Primary
              </label>
              <input
                placeholder="Notes"
                value={assignForm.notes}
                onChange={(e) => setAssignForm((p) => ({ ...p, notes: e.target.value }))}
              />
              <button type="submit" className={styles.btnPrimary}>Assign</button>
            </form>
          )}
        </div>
      )}

      {/* ---------- Vendors ---------- */}
      {tab === "Vendors" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Vendors · {activeVendorAssigns.length} active</h3>
          </div>
          <p className={styles.note}>Assignments activate only after work-order acceptance.</p>
          <div className={styles.personList}>
            {vendors.map((v) => (
              <div key={`pv-${v.id}`} className={styles.personRow}>
                <span className={styles.avatar} style={{ background: avatarBg(v.vendor_name) }}>
                  <FiTruck />
                </span>
                <div className={styles.personMain}>
                  <strong>{v.vendor_name || `#${v.id}`}</strong>
                  <span className={styles.personSub}>project vendor link</span>
                </div>
              </div>
            ))}
            {vendorAssigns.map((a) => (
              <div key={a.id} className={styles.personRow}>
                <span className={styles.avatar} style={{ background: avatarBg(a.vendor_name) }}>
                  <FiTruck />
                </span>
                <div className={styles.personMain}>
                  <strong>{a.vendor_name || `#${a.vendor_id}`}</strong>
                  <span className={styles.personSub}>WO #{a.work_order_id}</span>
                </div>
                <span className={`${styles.statusPill} ${statusClass(a.status)}`}>
                  <span className={styles.dot} />{a.status}
                </span>
              </div>
            ))}
            {vendors.length === 0 && vendorAssigns.length === 0 && (
              <Empty text="No vendors linked to this project." />
            )}
          </div>
          {canManage && (
            <form
              className={styles.assignForm}
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await assignVendorApi(id, Number(vendorForm.vendor_id));
                  setVendorForm({ vendor_id: "" });
                  push("Vendor assigned (acceptance verified)", "success");
                  reload();
                } catch (err) {
                  push(errMsg(err, "Assignment failed"), "error");
                }
              }}
            >
              <input
                placeholder="Vendor ID (ACCEPTED work order required)"
                value={vendorForm.vendor_id}
                onChange={(e) => setVendorForm({ vendor_id: e.target.value })}
                required
              />
              <button type="submit" className={styles.btnPrimary}>Assign vendor</button>
            </form>
          )}
        </div>
      )}

      {/* ---------- Machinery ---------- */}
      {tab === "Machinery" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Machinery · {machinery.length}</h3>
          </div>
          {machinery.length === 0 && <Empty text="No machines assigned." />}
          <div className={styles.personList}>
            {machinery.map((m) => (
              <div key={m.id} className={styles.personRow}>
                <span className={styles.avatar} style={{ background: avatarBg(m.machine_name) }}>
                  <FiTool />
                </span>
                <div className={styles.personMain}>
                  <strong>{m.machine_name}</strong>
                  <span className={styles.personSub}>assigned to this project</span>
                </div>
              </div>
            ))}
          </div>
          {canManage && (
            <form
              className={styles.assignForm}
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await assignMachineApi(id, Number(machineForm.machine_id), machineForm.force);
                  setMachineForm({ machine_id: "", force: false });
                  push("Machine assigned", "success");
                  reload();
                } catch (err) {
                  push(errMsg(err, "Assignment failed"), "error");
                }
              }}
            >
              <input
                placeholder="Machine ID (available only)"
                value={machineForm.machine_id}
                onChange={(e) => setMachineForm((p) => ({ ...p, machine_id: e.target.value }))}
                required
              />
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={machineForm.force}
                  onChange={(e) => setMachineForm((p) => ({ ...p, force: e.target.checked }))}
                /> Force reassign
              </label>
              <button type="submit" className={styles.btnPrimary}>Assign machine</button>
            </form>
          )}
        </div>
      )}

      {/* ---------- Daily Execution ---------- */}
      {tab === "Daily Execution" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Daily reports · {ders.length} recent</h3>
            <button className={styles.btnGhost} onClick={() => navigate(`${routeBase}/daily-execution-report`)}>
              <FiEye /> Open reports
            </button>
          </div>
          {ders.length === 0 && <Empty text="No reports submitted yet." />}
          <div className={styles.woList}>
            {ders.map((d) => (
              <div
                key={d.id}
                className={styles.woRow}
                onClick={() => navigate(`${routeBase}/daily-execution-report/${d.id}`)}
              >
                <div className={styles.woMain}>
                  <strong>{d.report_date} · {d.borehole_no || d.site_location}</strong>
                  <span className={styles.woSub}>{d.site_location || "-"} · {d.total_depth ?? "-"}m</span>
                </div>
                <span className={`${styles.statusPill} ${statusClass(d.status)}`}>
                  <span className={styles.dot} />{d.status || "SUBMITTED"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Expenditures ---------- */}
      {tab === "Expenditures" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Expenditures · {totalExp.toLocaleString()} {project.currency || "INR"}</h3>
            <button
              className={styles.btnGhost}
              onClick={() => navigate(isSupervisor ? "/supervisor/expenditures" : `/admin/expenditures/${id}`)}
            >
              <FiEye /> {isSupervisor ? "Record expense" : "Open ledger"}
            </button>
          </div>
          {exps.length === 0 && <Empty text="No expenditures recorded." />}
          <div className={styles.woList}>
            {exps.map((x) => (
              <div key={x.id} className={styles.woRowStatic}>
                <div className={styles.woMain}>
                  <strong>{x.expense_category}</strong>
                  <span className={styles.woSub}>
                    {x.expense_date} · {x.description || "-"}
                  </span>
                </div>
                <span className={styles.expAmt}>
                  {(Number(x.amount) || 0).toLocaleString()} {x.currency}
                </span>
                <span className={`${styles.statusPill} ${statusClass(x.status)}`}>
                  <span className={styles.dot} />{x.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Cost Ledger (server-computed) ---------- */}
      {tab === "Cost Ledger" && (
        <div className={styles.page}>
          {!ledger && <Empty text="Cost ledger unavailable for this project." />}
          {ledger && (
            <>
              <div className={styles.kpiGrid}>
                <Kpi icon={<FiTool />} label="Machinery cost" value={`${Number(ledger.totals.machinery_total).toLocaleString()} ${ledger.currency}`} sub="per-day rates × utilized days" />
                <Kpi icon={<FiDollarSign />} label="Extras & expenses" value={`${Number(ledger.totals.expenditure_total).toLocaleString()} ${ledger.currency}`} sub={`${ledger.expenditures.records.length} record(s)`} />
                <Kpi icon={<FiActivity />} label="Total spent to date" value={`${Number(ledger.totals.grand_total).toLocaleString()} ${ledger.currency}`} sub={`budget ${Number(ledger.totals.budget).toLocaleString()}`} />
                <Kpi icon={<FiCheckCircle />} label="Balance" value={`${Number(ledger.totals.balance).toLocaleString()} ${ledger.currency}`} sub="budget less spend" />
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}><h3>Machinery — daily rate × utilized days</h3></div>
                {ledger.machinery.length === 0 && <Empty text="No machinery utilization recorded in daily execution yet." />}
                <div className={styles.woList}>
                  {ledger.machinery.map((m) => (
                    <div key={m.machine_id} className={styles.woRowStatic}>
                      <div className={styles.woMain}>
                        <strong>{m.machine_name}</strong>
                        <span className={styles.woSub}>
                          {Number(m.rate_per_day).toLocaleString()} {ledger.currency}/day · {m.days} day(s) · rate from {m.rate_source}
                        </span>
                        {m.rate_missing && <span className={styles.statusPill + " " + styles.statusDanger}>NO RATE</span>}
                      </div>
                      <span className={styles.expAmt}>{Number(m.amount).toLocaleString()} {ledger.currency}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}><h3>Weekly spend</h3></div>
                {ledger.weekly.length === 0 && <Empty text="No weekly activity yet." />}
                <div className={styles.woList}>
                  {ledger.weekly.map((w) => (
                    <div key={w.week} className={styles.woRowStatic}>
                      <div className={styles.woMain}><strong>Week {w.week}</strong>
                        <span className={styles.woSub}>machinery {Number(w.machinery).toLocaleString()} · extras {Number(w.expenditures).toLocaleString()}</span>
                      </div>
                      <span className={styles.expAmt}>{Number(w.total).toLocaleString()} {ledger.currency}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}><h3>Full history (machinery + extras)</h3></div>
                <div className={styles.woList}>
                  {ledger.history
                    .slice()
                    .sort((a, b) => (a.date < b.date ? 1 : -1))
                    .map((h, i) => (
                      <div key={`${h.kind}-${h.ref ?? i}-${i}`} className={styles.woRowStatic}>
                        <div className={styles.woMain}>
                          <strong>{h.label}</strong>
                          <span className={styles.woSub}>{h.date} · {h.kind}</span>
                        </div>
                        <span className={styles.expAmt}>{Number(h.amount).toLocaleString()} {ledger.currency}</span>
                        <span className={`${styles.statusPill} ${statusClass(h.status === "UTILIZED" ? "ACTIVE" : h.status)}`}>
                          <span className={styles.dot} />{h.status}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- supervisor attendance & machinery cost ---------- */}
      {tab === "Attendance" && (
        <div className={styles.page}>
          {!attendance && <Empty text="Attendance data unavailable for this project." />}
          {attendance && (
            <>
              <div className={styles.kpiGrid}>
                <Kpi icon={<FiUsers />} label="Supervisors" value={String(attendance.totals.supervisors)} sub="filing daily reports" />
                <Kpi icon={<FiClock />} label="Days worked" value={String(attendance.totals.days_worked)} sub={`${attendance.totals.reports} reports`} />
                <Kpi icon={<FiActivity />} label="Field hours" value={`${Number(attendance.totals.hours_worked).toLocaleString()} h`} sub="across all supervisors" />
                <Kpi icon={<FiTool />} label="Machinery cost" value={`${Number(attendance.totals.machinery_cost).toLocaleString()} ${ledger?.currency || "INR"}`} sub="work-order rate × days" />
              </div>

              {attendance.supervisors.map((s) => (
                <div key={s.supervisor_id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <h3>
                      {s.name}
                      <span className={styles.mutedChip}>{s.employee_id}</span>
                    </h3>
                    <span className={styles.expAmt}>
                      {Number(s.machinery_cost).toLocaleString()} {ledger?.currency || "INR"}
                    </span>
                  </div>

                  <div className={styles.attGrid}>
                    <span><i>Days worked</i>{s.days_worked}</span>
                    <span><i>Reports</i>{s.reports}</span>
                    <span><i>Hours</i>{Number(s.hours_worked).toLocaleString()}</span>
                    <span><i>Avg / day</i>{s.avg_hours_per_day} h</span>
                    <span><i>Manpower days</i>{Number(s.manpower_days).toLocaleString()}</span>
                    <span><i>Depth drilled</i>{Number(s.total_depth).toLocaleString()} m</span>
                    <span><i>Cost / day</i>{Number(s.cost_per_day).toLocaleString()}</span>
                  </div>

                  {s.machines.length > 0 && (
                    <table className={styles.attTable}>
                      <thead>
                        <tr><th>Machine</th><th>Rate/day</th><th>Days</th><th>Amount</th><th>Rate from</th></tr>
                      </thead>
                      <tbody>
                        {s.machines.map((m) => (
                          <tr key={m.machine_id}>
                            <td>Machine #{m.machine_id}</td>
                            <td className={styles.num}>{Number(m.rate_per_day).toLocaleString()}</td>
                            <td className={styles.num}>{m.days}</td>
                            <td className={styles.num}>{Number(m.amount).toLocaleString()}</td>
                            <td><span className={styles.mutedChip}>{m.rate_source}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {s.per_project.length > 1 && (
                    <div className={styles.attProjects}>
                      {s.per_project.map((p) => (
                        <span key={p.project_id}>
                          <b>{p.project_code}</b> · {p.days_worked}d · {Number(p.machinery_cost).toLocaleString()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ---------- Documents ---------- */}
      {tab === "Documents" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Signed work-order PDFs</h3>
          </div>
          {wos.filter((w) => w.pdf_path).length === 0 && (
            <Empty text="No generated PDFs yet. Finalized versions are locked and preserved here." />
          )}
          <div className={styles.docGrid}>
            {wos.filter((w) => w.pdf_path).map((w) => (
              <div key={w.id} className={styles.docCard}>
                <span className={styles.docIcon}><FiFileText /></span>
                <div className={styles.docMain}>
                  <strong>{w.work_order_number}</strong>
                  <span>v{w.version} · PDF v{w.pdf_version} · {w.status}</span>
                </div>
<div className={styles.docBtns}>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={async () => {
                      try {
                        await openAuthedFile(`/work-orders/${w.id}/pdf/preview`);
                      } catch (e) {
                        push(e?.response?.data?.detail || "Preview failed", "error");
                      }
                    }}
                  >
                    <FiEye /> Preview
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={async () => {
                      try {
                        await downloadAuthedFile(
                          `/work-orders/${w.id}/pdf/download`,
                          `${w.work_order_number}.pdf`
                        );
                      } catch (e) {
                        push(e?.response?.data?.detail || "Download failed", "error");
                      }
                    }}
                  >
                    <FiDownload /> PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Audit Timeline ---------- */}
      {tab === "Audit Timeline" && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Audit timeline · {timeline.length} events</h3>
          </div>
          {timeline.length === 0 && (
            <Empty text="No audit events (or insufficient permission)." />
          )}
          <ol className={styles.timeline}>
            {timeline.map((a) => (
              <li key={a.id}>
                <span className={styles.tDot} />
                <div className={styles.tBody}>
                  <strong>{(a.action || "").replace(/_/g, " ")}</strong>
                  <span>
                    {a.timestamp ? new Date(a.timestamp).toLocaleString() : ""} ·{" "}
                    {a.target_type} #{a.target_id ?? "-"} ·{" "}
                    {userMap[a.actor_id] ? `${userMap[a.actor_id]} (#${a.actor_id})` : `actor #${a.actor_id ?? "-"}`}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }) {
  return (
    <div className={styles.kpi}>
      <span className={`${styles.kpiIcon} ${tone || ""}`}>{icon}</span>
      <div>
        <span className={styles.kpiLabel}>{label}</span>
        <strong className={styles.kpiValue}>{value}</strong>
        <span className={styles.kpiSub}>{sub}</span>
      </div>
    </div>
  );
}

function RiskRow({ label, data, empty, extra }) {
  if (!data) return <p className={styles.note}>{empty}</p>;
  return (
    <div className={styles.riskRow}>
      <div className={styles.riskTop}>
        <strong>{label}</strong>
        <span className={`${styles.statusPill} ${riskClass(data.risk)}`}>
          <span className={styles.dot} />{data.risk} · {data.score}
        </span>
      </div>
      {extra}
      {(data.reasons || []).length > 0 && (
        <ul className={styles.riskReasons}>
          {(data.reasons || []).slice(0, 4).map((r, i) => (
            <li key={i}>{typeof r === "string" ? r : r.message || r.code || JSON.stringify(r)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ text }) {
  return <p className={styles.emptyLine}>{text}</p>;
}
