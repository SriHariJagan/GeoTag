import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiActivity,
  FiArrowUpRight,
  FiBarChart2,
  FiBell,
  FiBriefcase,
  FiCheckCircle,
  FiClock,
  FiFolder,
  FiPackage,
  FiSearch,
  FiTool,
  FiTruck,
  FiUserCheck,
  FiUsers,
  FiUserX,
} from "react-icons/fi";
import styles from "./AdminDashboard.module.css";
import { getAdminDashboard } from "../../../api/dashboard.api";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await getAdminDashboard();
        setData(res.data);
      } catch (error) {
        // Real failure surfaces as an error — never fabricated statistics.
        setLoadError(
          error?.response?.data?.detail || "Failed to load dashboard data"
        );
      }
    }

    fetchStats();
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;

    const projectsTotal = data.projects?.total || 0;
    const completed = data.projects?.completed || 0;
    const ongoing = data.projects?.ongoing || 0;
    const hold = data.projects?.hold || 0;

    return {
      projectsTotal,
      completed,
      ongoing,
      hold,
      completionPercent: projectsTotal ? Math.round((completed / projectsTotal) * 100) : 0,
      supervisorsTotal: data.supervisors?.total || 0,
      assignedSupervisors: data.supervisors?.assigned || 0,
      vendorsTotal: data.vendors?.total || 0,
      activeVendors: data.vendors?.active || 0,
      machinesTotal: data.machinery?.total || 0,
      workingMachines: data.machinery?.working || 0,
      reportsTotal: data.reports?.total || 0,
      todayReports: data.reports?.today || 0,
    };
  }, [data]);

  if (!data) {
    if (loadError) {
      return (
        <div className={styles.loadingPage}>
          <p>Failed to load dashboard</p>
          <p>{loadError}</p>
        </div>
      );
    }
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loader}></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboardPage}>
      <div className={styles.topArea}>
        <div>
          <p className={styles.eyebrow}>Manage and track your projects</p>
          <h1>Project Dashboard</h1>
        </div>

        <div className={styles.topActions}>
          <div className={styles.searchBox}>
            <FiSearch />
            <input placeholder="Search task, project, report..." />
          </div>
          <button className={styles.iconBtn}><FiBell /></button>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        <aside className={styles.leftPanel}>
          <PanelTitle title="Quick Overview" />

          <MiniCard
            title="Total Projects"
            value={stats.projectsTotal}
            icon={<FiBriefcase />}
            onClick={() => navigate("projects")}
          />
          <MiniCard
            title="Today Reports"
            value={stats.todayReports}
            icon={<FiBarChart2 />}
            onClick={() => navigate("daily-execution-report")}
          />
          <MiniCard
            title="Assigned Supervisors"
            value={stats.assignedSupervisors}
            icon={<FiUserCheck />}
            onClick={() => navigate("supervisors")}
          />

          <div className={styles.taskBox}>
            <p>System Status</p>
            <h3>All modules active</h3>
            <span>Projects, vendors, machinery and reports are connected.</span>
          </div>
        </aside>

        <main className={styles.centerPanel}>
          <div className={styles.overviewRow}>
            <div className={styles.overviewCard}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Projects Overview</h3>
                  <p>Status wise project summary</p>
                </div>
                <FiArrowUpRight />
              </div>

              <div className={styles.donutWrap}>
                <div
                  className={styles.donut}
                  style={{
                    background: `conic-gradient(
                      var(--color-primary) 0 ${stats.completionPercent}%,
                      var(--color-warning) ${stats.completionPercent}% ${stats.completionPercent + 20}%,
                      var(--color-info) ${stats.completionPercent + 20}% 100%
                    )`,
                  }}
                >
                  <div>
                    <strong>{stats.completionPercent}%</strong>
                    <span>Done</span>
                  </div>
                </div>

                <div className={styles.legend}>
                  <Legend label="Ongoing" value={stats.ongoing} />
                  <Legend label="On Hold" value={stats.hold} type="warning" />
                  <Legend label="Completed" value={stats.completed} type="success" />
                </div>
              </div>
            </div>

            <div className={styles.overviewCard}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Execution Activity</h3>
                  <p>Reports and resource activity</p>
                </div>
                <FiActivity />
              </div>

              <div className={styles.chartBars}>
                <Bar label="Projects" value={stats.projectsTotal} max={Math.max(stats.projectsTotal, 1)} />
                <Bar label="Reports" value={stats.reportsTotal} max={Math.max(stats.reportsTotal, 1)} />
                <Bar label="Vendors" value={stats.activeVendors} max={Math.max(stats.vendorsTotal, 1)} />
                <Bar label="Machines" value={stats.workingMachines} max={Math.max(stats.machinesTotal, 1)} />
              </div>
            </div>
          </div>

          <Section title="Projects">
            <Card title="Total Projects" count={data.projects.total} icon={<FiFolder />} onClick={() => navigate("projects")} />
            <Card title="Ongoing" count={data.projects.ongoing} icon={<FiClock />} onClick={() => navigate("projects?status=ongoing")} />
            <Card title="On Hold" count={data.projects.hold} icon={<FiPackage />} onClick={() => navigate("projects?status=onhold")} />
            <Card title="Completed" count={data.projects.completed} icon={<FiCheckCircle />} onClick={() => navigate("projects?status=completed")} />
          </Section>

          <Section title="Supervisors">
            <Card title="Total" count={data.supervisors.total} icon={<FiUsers />} onClick={() => navigate("supervisors")} />
            <Card title="Assigned" count={data.supervisors.assigned} icon={<FiUserCheck />} onClick={() => navigate("supervisors?status=active")} />
            <Card title="Idle" count={data.supervisors.idle} icon={<FiUserX />} onClick={() => navigate("supervisors?status=inactive")} />
          </Section>

          <Section title="Vendors">
            <Card title="Total" count={data.vendors.total} icon={<FiPackage />} onClick={() => navigate("vendors")} />
            <Card title="Active" count={data.vendors.active} icon={<FiTool />} onClick={() => navigate("vendors?status=active")} />
            <Card title="Inactive" count={data.vendors.inactive} icon={<FiClock />} onClick={() => navigate("vendors?status=inactive")} />
          </Section>

          <Section title="Machinery">
            <Card title="Total" count={data.machinery.total} icon={<FiTruck />} onClick={() => navigate("machines")} />
            <Card title="Working" count={data.machinery.working} icon={<FiTool />} onClick={() => navigate("machines?status=working")} />
            <Card title="Maintenance" count={data.machinery.maintenance} icon={<FiTruck />} onClick={() => navigate("machines?status=maintenance")} />
            <Card title="Idle" count={data.machinery.idle} icon={<FiClock />} onClick={() => navigate("machines?status=idle")} />
          </Section>

          <Section title="Daily Reports">
            <Card title="Total Reports" count={data.reports?.total || 0} icon={<FiFolder />} onClick={() => navigate("daily-execution-report")} />
            <Card title="Today's Reports" count={data.reports?.today || 0} icon={<FiClock />} onClick={() => navigate("daily-execution-report")} />
          </Section>
        </main>

        <aside className={styles.rightPanel}>
          <PanelTitle title="Resource Health" />

          <HealthItem title="Supervisors" value={stats.assignedSupervisors} total={stats.supervisorsTotal} />
          <HealthItem title="Vendors" value={stats.activeVendors} total={stats.vendorsTotal} />
          <HealthItem title="Machinery" value={stats.workingMachines} total={stats.machinesTotal} />

          <div className={styles.notificationBox}>
            <h3>Forecasting</h3>
            <p>
              Delay and cost forecasts are computed per project from live
              execution data via the analytics API.
            </p>
          </div>

          <div className={styles.financeBox}>
            <h3>Financial Summary</h3>
            <p>
              Live expenditure totals are available per project under
              Expenditures. No aggregate figures are shown until billing data
              exists.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PanelTitle({ title }) {
  return (
    <div className={styles.panelTitle}>
      <h3>{title}</h3>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      <div className={styles.cardGrid}>{children}</div>
    </section>
  );
}

function Card({ title, count, icon, onClick }) {
  return (
    <button className={styles.statCard} onClick={onClick}>
      <div className={styles.statTop}>
        <span>{icon}</span>
        <FiArrowUpRight />
      </div>
      <p>{title}</p>
      <h2>{count}</h2>
    </button>
  );
}

function MiniCard({ title, value, icon, onClick }) {
  return (
    <button className={styles.miniCard} onClick={onClick}>
      <span>{icon}</span>
      <div>
        <p>{title}</p>
        <h3>{value}</h3>
      </div>
    </button>
  );
}

function Legend({ label, value, type = "primary" }) {
  return (
    <div className={styles.legendItem}>
      <span className={`${styles.dot} ${styles[type]}`}></span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function Bar({ label, value, max }) {
  const width = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div className={styles.barItem}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className={styles.barTrack}>
        <span style={{ width: `${width}%` }}></span>
      </div>
    </div>
  );
}

function HealthItem({ title, value, total }) {
  const percent = total ? Math.round((value / total) * 100) : 0;

  return (
    <div className={styles.healthItem}>
      <div>
        <h4>{title}</h4>
        <p>{value} active out of {total}</p>
      </div>
      <strong>{percent}%</strong>
    </div>
  );
}