import { useCallback, useEffect, useMemo, useState } from "react";
import { FiSearch, FiRefreshCw, FiUser, FiActivity, FiCalendar } from "react-icons/fi";
import { getAuditLog, getUsersAdmin } from "../../../api/auth.api";
import Pagination from "../../../Components/Pagination/Pagination";
import styles from "./Logs.module.css";

const ACTION_TARGET_OPTIONS = [
  "user", "project", "der", "expenditure", "vendor", "work_order",
  "rfq", "quotation", "assignment", "machine", "company", "system",
];

const fmt = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

export default function Logs() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [usersTotal, setUsersTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: pageSize };
      if (actorId) params.actor_id = actorId;
      if (action.trim()) params.action = action.trim();
      if (targetType) params.target_type = targetType;
      if (fromDate) params.start_date = fromDate;
      if (toDate) params.end_date = toDate;
      const res = await getAuditLog(params);
      setRows(res.data || []);
      const t = Number(res.headers?.["x-total-count"]);
      setTotal(Number.isFinite(t) && t >= 0 ? t : (res.data || []).length);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, actorId, action, targetType, fromDate, toDate]);

  useEffect(() => {
    const t = setTimeout(load, action ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, action]);

  // User directory: backend caps limit at 100, so search via `q` instead of
  // fetching everything. Debounced so typing a name/email finds any user.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = userQuery.trim();
        const usersRes = await getUsersAdmin(q ? { q, limit: 100 } : { limit: 100 });
        if (cancelled) return;
        const list = usersRes.data || [];
        setUsers((prev) => {
          // Keep the currently-selected user visible even if the search excludes them.
          if (actorId && !list.some((u) => String(u.id) === String(actorId))) {
            const kept = prev.find((u) => String(u.id) === String(actorId));
            return kept ? [kept, ...list] : list;
          }
          return list;
        });
        const ut = Number(usersRes.headers?.["x-total-count"]);
        setUsersTotal(Number.isFinite(ut) && ut >= 0 ? ut : list.length);
      } catch {
        if (!cancelled) {
          setUsers([]);
          setUsersTotal(0);
        }
      }
    }, userQuery ? 300 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [userQuery, actorId]);

  // Extra client-side pass so name / email / mobile filtering works
  // instantly on the loaded page even before the backend redeploys.
  const visibleUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase().replace(/[\s-]+/g, "");
    if (!q) return users;
    return users.filter((u) => {
      const hay = [
        u.full_name, u.email, u.employee_id,
        u.primary_phone, u.secondary_phone, u.contact,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase().replace(/[\s-]+/g, ""));
      return hay.some((h) => h.includes(q));
    });
  }, [users, userQuery]);

  // Client-side date fallback (in case backend redeploy lags behind UI).
  const displayRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
    if ((!from || Number.isNaN(from.getTime())) && (!to || Number.isNaN(to.getTime()))) return rows || [];
    return (rows || []).filter((r) => {
      const d = r.timestamp ? new Date(r.timestamp) : null;
      if (!d || Number.isNaN(d.getTime())) return true;
      if (from && !Number.isNaN(from.getTime()) && d < from) return false;
      if (to && !Number.isNaN(to.getTime()) && d > to) return false;
      return true;
    });
  }, [rows, fromDate, toDate]);

  const resetFilters = () => {
    setActorId("");
    setAction("");
    setTargetType("");
    setFromDate("");
    setToDate("");
    setUserQuery("");
    setPage(1);
  };
  const hasFilters = Boolean(actorId || action || targetType || fromDate || toDate || userQuery);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}><FiActivity /> Activity logs</span>
        <h1>Operations Log</h1>
        <p>Every create, update, delete, approval and assignment across the platform — filterable and auditable.</p>
      </header>

      <div className={styles.toolbar}>
        <div className={`${styles.field} ${styles.userField}`}>
          <span><FiUser /> User — name / email / mobile{usersTotal > users.length ? ` (${users.length}/${usersTotal})` : ""}</span>
          <div className={styles.userCombo}>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search name, email, mobile…"
              aria-label="Search users by name, email or mobile number"
            />
            <select value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }} aria-label="Pick user">
              <option value="">All users{usersTotal ? ` (${usersTotal})` : ""}</option>
              {visibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {[u.full_name, u.email].filter(Boolean).join(" — ")}{u.primary_phone ? ` • ${u.primary_phone}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className={styles.field}>
          <span><FiSearch /> Action</span>
          <input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="e.g. EXPENDITURE_APPROVED" />
        </label>
        <label className={styles.field}>
          <span>Area</span>
          <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setPage(1); }}>
            <option value="">All areas</option>
            {ACTION_TARGET_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span><FiCalendar /> From date</span>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        </label>
        <label className={styles.field}>
          <span><FiCalendar /> To date</span>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
        </label>
        <button className={styles.refresh} onClick={load} type="button"><FiRefreshCw /> Refresh</button>
        {hasFilters && (
          <button className={styles.clear} type="button" onClick={resetFilters}>Clear filters</button>
        )}
      </div>

      <section className={styles.card}>
        <div className={styles.countLine}>{total} total {total === 1 ? "entry" : "entries"}</div>
        {loading && <p className={styles.muted}>Loading…</p>}
        {error && <p className={styles.error}>{error}</p>}
        {!loading && !error && displayRows.length === 0 && <p className={styles.muted}>No log entries match your filters.</p>}
        <div className={styles.rows}>
          {displayRows.map((r) => (
            <article key={r.id} className={styles.row}>
              <div className={styles.rowMain}>
                <strong>{r.action}</strong>
                <span>{r.actor_name || r.actor_email || (r.actor_id != null ? `User #${r.actor_id}` : "System")}</span>
                <span className={styles.target}>{r.target_type ? `${r.target_type}${r.target_id != null ? ` #${r.target_id}` : ""}` : "—"}</span>
                {r.meta_info && <code>{r.meta_info}</code>}
              </div>
              <time>{fmt(r.timestamp)}</time>
            </article>
          ))}
        </div>
        <Pagination
          page={page}
          total={total}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      </section>
    </div>
  );
}
