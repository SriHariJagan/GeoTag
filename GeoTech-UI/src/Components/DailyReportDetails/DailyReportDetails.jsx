import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft, FiCalendar, FiCheckCircle, FiClock, FiMapPin,
  FiTool, FiTrendingUp, FiUsers, FiZap, FiLayers, FiFlag,
  FiBriefcase, FiCloud, FiPrinter, FiActivity, FiBox, FiMessageSquare,
} from "react-icons/fi";
import { getDailyReportById } from "../../api/dailyExecution.api";
import styles from "./DailyReportDetails.module.css";

const m = (v) => Number(v) || 0;
const m1 = (v) => m(v).toFixed(1);
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export default function DailyReportDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDailyReportById(id)
      .then((res) => setReport(res.data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className={styles.container}><div className={styles.stateCard}>Loading report…</div></div>;
  if (!report) {
    return (
      <div className={styles.container}>
        <div className={styles.stateCard}>
          <h3>Report not found</h3>
          <p>It may have been deleted or you may not have access.</p>
          <button className={styles.btn} onClick={() => navigate(-1)}><FiArrowLeft /> Go back</button>
        </div>
      </div>
    );
  }

  const soil = m(report.soil_depth);
  const soft = m(report.soft_rock_depth);
  const hard = m(report.hard_rock_depth);
  const total = m(report.total_depth) || soil + soft + hard;
  const started = m(report.depth_started);
  const drilledToday = Math.max(0, total - started);
  const pct = (v) => (total > 0 ? (v / total) * 100 : 0);
  const pctR = (v) => Math.round(pct(v));
  const progress = total > 0 ? Math.min(100, Math.round((total / Math.max(total, started || total)) * 100)) : 0;

  const equip = report.equipment || [];
  const manpower = report.manpower || [];
  const activity = report.vendor_activity || [];
  const equipHours = equip.reduce((s, e) => s + m(e.hours_used), 0);
  const avgUtil = equip.length
    ? Math.round(equip.reduce((s, e) => s + m(e.utilization), 0) / equip.length)
    : 0;
  const plannedCrew = manpower.reduce((s, x) => s + m(x.planned_count), 0);
  const actualCrew = manpower.reduce((s, x) => s + m(x.actual_count), 0) || m(report.manpower_count);
  const crewHours = manpower.reduce((s, x) => s + m(x.hours), 0);

  return (
    <div className={styles.container}>
      {/* ---------------- hero header ---------------- */}
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <button className={styles.iconBtn} onClick={() => navigate(-1)} title="Go back" aria-label="Go back">
            <FiArrowLeft />
          </button>
          <div className={styles.heroTitle}>
            <span className={styles.eyebrow}>
              <FiFlag /> Daily execution report · #{report.id ?? id}
            </span>
            <h1>{report.borehole_no || "Borehole report"}</h1>
            <span className={styles.heroSub}>
              {report.project?.name || `Project #${report.project_id ?? "—"}`}
            </span>
          </div>
          <div className={styles.heroActions}>
            <span className={styles.statusChip} data-status={report.work_status}>
              {(report.work_status || "working").toUpperCase()}
            </span>
            <span className={styles.statusChip} data-status={report.status}>
              {report.status || "SUBMITTED"}
            </span>
            <button className={styles.printBtn} onClick={() => window.print()} title="Print report">
              <FiPrinter /> <span>Print</span>
            </button>
          </div>
        </div>
        <div className={styles.metaChips}>
          <Chip icon={<FiCalendar />} label={fmtDate(report.report_date)} />
          <Chip icon={<FiMapPin />} label={report.site_location || "Location —"} />
          <Chip icon={<FiCloud />} label={report.weather_condition || "Weather —"} />
          <Chip icon={<FiClock />} label={report.hours_worked != null ? `${m1(report.hours_worked)} h worked` : "Hours —"} />
        </div>
      </header>

      {/* ---------------- KPI strip ---------------- */}
      <div className={styles.kpiGrid}>
        <Kpi tone="blue" icon={<FiTrendingUp />} label="Total depth (EOD)" value={`${m1(total)} m`} sub={`Started at ${m1(started)} m`} />
        <Kpi tone="green" icon={<FiZap />} label="Drilled today" value={`${m1(drilledToday)} m`} sub={drilledToday > 0 ? "Day's advancement" : "No advancement today"} />
        <Kpi tone="amber" icon={<FiTool />} label="Equipment" value={`${m1(equipHours)} h`} sub={`${equip.length} unit(s) · ${avgUtil}% avg use`} />
        <Kpi tone="violet" icon={<FiUsers />} label="Crew on site" value={String(actualCrew)} sub={plannedCrew ? `Planned ${plannedCrew} · ${crewHours ? `${m1(crewHours)} h` : " shift"}` : "Reported on site"} />
      </div>

      {/* ---------------- depth composition ---------------- */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3><FiLayers className={styles.headIcon} /> Strata encountered</h3>
          <span className={styles.totalPill}>{m1(total)} m total</span>
        </div>

        <div className={styles.depthLayout}>
          {/* visual borehole column */}
          <div className={styles.boreCol}>
            <div className={styles.boreShaft}>
              {pct(soil) > 0 && (
                <div className={`${styles.boreSeg} ${styles.sSoil}`} style={{ height: `${Math.max(pct(soil), 6)}%` }}>
                  <span>Soil</span>
                </div>
              )}
              {pct(soft) > 0 && (
                <div className={`${styles.boreSeg} ${styles.sSoft}`} style={{ height: `${Math.max(pct(soft), 6)}%` }}>
                  <span>Soft rock</span>
                </div>
              )}
              {pct(hard) > 0 && (
                <div className={`${styles.boreSeg} ${styles.sHard}`} style={{ height: `${Math.max(pct(hard), 6)}%` }}>
                  <span>Hard rock</span>
                </div>
              )}
              {total === 0 && <div className={styles.boreEmpty}>No drilling logged</div>}
            </div>
            <div className={styles.boreScale}>
              <span>0 m</span>
              <span>{m1(total)} m</span>
            </div>
          </div>

          {/* breakdown */}
          <div className={styles.depthMain}>
            <div className={styles.stackBar} role="img" aria-label={`Soil ${m1(soil)}m, soft rock ${m1(soft)}m, hard rock ${m1(hard)}m`}>
              {pct(soil) > 0 && <span style={{ width: `${pct(soil)}%` }} className={styles.sSoil} title={`Soil ${m1(soil)} m`} />}
              {pct(soft) > 0 && <span style={{ width: `${pct(soft)}%` }} className={styles.sSoft} title={`Soft rock ${m1(soft)} m`} />}
              {pct(hard) > 0 && <span style={{ width: `${pct(hard)}%` }} className={styles.sHard} title={`Hard rock ${m1(hard)} m`} />}
            </div>

            <div className={styles.strataCards}>
              <StrataCard cls="sSoil" label="Soil" depth={soil} pct={pctR(soil)} hint="Top overburden" />
              <StrataCard cls="sSoft" label="Soft rock" depth={soft} pct={pctR(soft)} hint="Weathered zone" />
              <StrataCard cls="sHard" label="Hard rock" depth={hard} pct={pctR(hard)} hint="Fresh rock" />
            </div>

            <div className={styles.dayFlow}>
              <FlowStep label="Day start" value={`${m1(started)} m`} />
              <span className={styles.flowArrow} aria-hidden>→</span>
              <FlowStep label="Drilled today" value={`+${m1(drilledToday)} m`} accent />
              <span className={styles.flowArrow} aria-hidden>→</span>
              <FlowStep label="End of day" value={`${m1(total)} m`} />
              <div className={styles.progressWrap}>
                <div className={styles.progressTop}>
                  <span>Borehole progress</span><strong>{progress}%</strong>
                </div>
                <div className={styles.progressBar}>
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- borehole + site ---------------- */}
      <div className={styles.twoCol}>
        <section className={styles.card}>
          <div className={styles.cardHead}><h3><FiActivity className={styles.headIcon} /> Borehole particulars</h3></div>
          <div className={styles.factGrid}>
            <Fact label="Rig no" value={report.rig_no} />
            <Fact label="Type of rig" value={report.type_of_rig} />
            <Fact label="Chainage" value={report.chainage} />
            <Fact label="Borehole started" value={report.borehole_started} />
            <Fact label="Borehole ended" value={report.borehole_ended} />
            <Fact label="Site location" value={report.site_location} />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><h3><FiBriefcase className={styles.headIcon} /> Project & client</h3></div>
          <div className={styles.factGrid}>
            <Fact label="Project" value={report.project?.name} sub={report.project_id ? `#${report.project_id}` : ""} />
            <Fact label="Vendor" value={report.vendor?.vendor_name} sub={report.vendor_id ? `#${report.vendor_id}` : ""} />
            <Fact label="Organisation" value={report.client} />
            <Fact label="Contact person" value={report.client_person_name} sub={report.client_person_designation} />
            <Fact label="Site engineer" value={report.site_engineer || report.supervisor_name} />
            <Fact label="Weather" value={report.weather_condition} />
          </div>
        </section>
      </div>

      {/* ---------------- resources ---------------- */}
      <div className={styles.twoCol}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3><FiUsers className={styles.headIcon} /> Manpower deployed</h3>
            {manpower.length > 0 && <span className={styles.countPill}>{actualCrew} on site</span>}
          </div>
          {manpower.length === 0 ? (
            <Empty text="No manpower breakup recorded." />
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>Category / Role</th><th className={styles.num}>Planned</th><th className={styles.num}>Actual</th><th className={styles.num}>Hours</th></tr>
              </thead>
              <tbody>
                {manpower.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <strong className={styles.cellMain}>{x.category || "—"}</strong>
                      <span className={styles.cellSub}>{x.role || ""}</span>
                    </td>
                    <td className={styles.num}>{x.planned_count ?? 0}</td>
                    <td className={styles.num}>
                      <span className={styles.actualBadge}>{x.actual_count ?? 0}</span>
                    </td>
                    <td className={styles.num}>{m1(x.hours)} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3><FiTool className={styles.headIcon} /> Equipment used</h3>
            {equip.length > 0 && <span className={styles.countPill}>{equip.length} unit(s)</span>}
          </div>
          {equip.length === 0 ? (
            <Empty text="No equipment logged for this day." />
          ) : (
            <div className={styles.equipList}>
              {equip.map((x) => (
                <div key={x.id} className={styles.equipRow}>
                  <div className={styles.equipTop}>
                    <strong>{x.equipment_name || (x.machine_id ? `Machine #${x.machine_id}` : "Equipment")}</strong>
                    <ConditionBadge value={x.condition} />
                  </div>
                  <div className={styles.equipMeta}>
                    <span>Qty {x.quantity ?? 1}</span><i>·</i>
                    <span>{m1(x.hours_used)} h</span><i>·</i>
                    <span>{x.utilization != null ? `${m1(x.utilization)}% use` : "Use —"}</span>
                  </div>
                  {x.utilization != null && (
                    <div className={styles.miniBar}><span style={{ width: `${Math.min(100, m(x.utilization))}%` }} /></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------------- vendor activity ---------------- */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3><FiBox className={styles.headIcon} /> Vendor activity</h3>
          {activity.length > 0 && <span className={styles.countPill}>{activity.length} item(s)</span>}
        </div>
        {activity.length === 0 ? (
          <Empty text="No vendor activity recorded." />
        ) : (
          <div className={styles.activityList}>
            {activity.map((x) => (
              <div key={x.id} className={styles.activityRow}>
                <div className={styles.activityTop}>
                  <strong>{x.activity || "Activity"}</strong>
                  <span className={styles.activityQty}>
                    {x.quantity_completed != null ? `${m1(x.quantity_completed)} done` : "—"}
                    {x.progress != null ? ` · ${m1(x.progress)}%` : ""}
                  </span>
                </div>
                {x.progress != null && (
                  <div className={styles.miniBar}><span style={{ width: `${Math.min(100, m(x.progress))}%` }} /></div>
                )}
                {x.remarks && <span className={styles.cellSub}>{x.remarks}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- sign-off + remarks ---------------- */}
      <div className={styles.twoCol}>
        <section className={styles.card}>
          <div className={styles.cardHead}><h3><FiCheckCircle className={styles.headIcon} /> Submitted by</h3></div>
          <div className={styles.person}>
            <span className={styles.avatar}>{(report.creator?.full_name || "?").charAt(0).toUpperCase()}</span>
            <span className={styles.personMain}>
              <strong>{report.creator?.full_name || "—"}</strong>
              <em>{(report.creator?.role || "").toLowerCase() || "field team"}</em>
            </span>
            {report.submitted_at && <span className={styles.stamp}>{new Date(report.submitted_at).toLocaleString()}</span>}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><h3><FiMessageSquare className={styles.headIcon} /> Remarks & notes</h3></div>
          <p className={styles.remarks}>{report.remarks || "No remarks recorded for this day."}</p>
          {report.delay_reason && (
            <p className={styles.delay}>
              <FiZap /> Delay reason: {report.delay_reason}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Chip({ icon, label }) {
  return <span className={styles.chip}>{icon} {label}</span>;
}

function Kpi({ icon, label, value, sub, tone }) {
  return (
    <div className={styles.kpi} data-tone={tone}>
      <span className={styles.kpiIcon}>{icon}</span>
      <div>
        <span className={styles.kpiLabel}>{label}</span>
        <strong className={styles.kpiValue}>{value}</strong>
        <span className={styles.kpiSub}>{sub}</span>
      </div>
    </div>
  );
}

function StrataCard({ cls, label, depth, pct, hint }) {
  return (
    <div className={styles.strata}>
      <span className={`${styles.dot} ${styles[cls]}`} />
      <div className={styles.strataMain}>
        <span className={styles.strataLabel}>{label}</span>
        <strong>{m1(depth)} m · {pct}%</strong>
        <em>{hint}</em>
      </div>
      <div className={styles.strataBar}>
        <span className={styles[cls]} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FlowStep({ label, value, accent }) {
  return (
    <div className={styles.flowStep} data-accent={accent ? "1" : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Fact({ label, value, sub }) {
  if (value == null || value === "") return null;
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong>{String(value)}</strong>
      {sub && <em>{sub}</em>}
    </div>
  );
}

function ConditionBadge({ value }) {
  const v = (value || "").toUpperCase();
  const tone = v === "GOOD" ? "good" : v === "FAIR" ? "fair" : v ? "bad" : "na";
  return <span className={styles.cond} data-tone={tone}>{value || "—"}</span>;
}

function Empty({ text }) {
  return <p className={styles.empty}>{text}</p>;
}
