import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiSearch, FiX, FiPlus, FiCheckCircle, FiClock,
  FiFileText, FiEye, FiEdit2, FiSend, FiXCircle, FiLayers, FiTrash2,
} from "react-icons/fi";
import { useProjects } from "../../../../store/context/ProjectContext";
import { useExpenditures } from "../../../../store/context/ExpendituresContext";
import { useAuth } from "../../../../store/context/AuthContext";
import { can, normalizeRole, PERMISSIONS } from "../../../../constants/permissions";
import Modal from "../../../../Components/Modal/Modal";
import ConfirmDialog from "../../../../Components/Modal/ConfirmDialog";
import Pagination from "../../../../Components/Pagination/Pagination";
import Toast from "../../../../Components/Toast/Toast";
import { useToast } from "../../../../Components/Toast/useToast";
import { EXPENSE_CATEGORIES } from "../../../../api/expenditures.api";
import { getVendors } from "../../../../api/vendors.api";
import { listWorkOrders } from "../../../../api/procurement.api";
import styles from "./ExpendituresAdmin.module.css";

const EMPTY = {
  project_id: "",
  expense_date: new Date().toISOString().slice(0, 10),
  expense_category: "MATERIAL",
  description: "",
  amount: "",
  currency: "INR",
  vendor_id: "",
  work_order_id: "",
  payment_method: "",
  reference_number: "",
};

const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.data)) return v.data;
  if (Array.isArray(v?.items)) return v.items;
  return [];
};

const inr = (v, cur = "INR") =>
  `${(Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${cur}`;

const vendorLabel = (v) =>
  v?.legal_business_name || v?.vendor_company || v?.contact_person || `Vendor #${v?.id}`;

const TONE = {
  MATERIAL: "blue", LABOR: "violet", EQUIPMENT: "amber", FUEL: "orange",
  TRANSPORT: "cyan", VENDOR: "indigo", SUBCONTRACT: "pink",
  SITE_EXPENSE: "green", MISCELLANEOUS: "slate",
};

export default function ExpendituresAdmin() {
  const { projects, loadProjects } = useProjects();
  const {
    expenditures, totals, listTotal, loadingExpenditures, errorExpenditures,
    loadExpenditures, loadTotals, addExpenditure, editExpenditure, removeExpenditure,
    submitExpenditure, approveExpenditure, rejectExpenditure,
  } = useExpenditures();
  const { user } = useAuth();
  const { toasts, push, dismiss } = useToast();
  const navigate = useNavigate();

  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const setView = (fn) => (v) => { fn(v); setPage(1); };
  const setProjectView = setView(setProjectId);
  const setCategoryView = setView(setCategory);
  const setStatusView = setView(setStatus);
  const setSearchView = setView(setSearch);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [editWos, setEditWos] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [wos, setWos] = useState([]);

  const canReview = can(user, PERMISSIONS.EXPENDITURE_APPROVE);
  const isSuper = normalizeRole(user?.role) === "SUPERADMIN";
  const canEdit = (x) => (canReview ? true : x.status === "DRAFT");
  const canDelete = (x) => {
    if (!canReview) return false;
    if (x.status === "APPROVED" && !isSuper) return false;
    return true;
  };

  useEffect(() => {
    loadProjects().catch(() => {});
    getVendors().then((r) => setVendors(asArray(r.data))).catch(() => setVendors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      loadExpenditures({
        project_id: projectId || undefined,
        status: status === "ALL" ? undefined : status,
        category: category || undefined,
        q: search.trim() || undefined,
        page,
        limit: pageSize,
      }).catch(() => {});
    }, search ? 300 : 0);
    if (projectId) loadTotals(projectId).catch(() => {});
    return () => { live = false; clearTimeout(t); };
  }, [projectId, status, category, search, page, pageSize, loadExpenditures, loadTotals]);

  // work orders for the create form's project scope
  useEffect(() => {
    const pid = form.project_id || projectId;
    if (!pid) { setWos([]); return; }
    listWorkOrders({ project_id: Number(pid) })
      .then((r) => setWos(asArray(r.data)))
      .catch(() => setWos([]));
  }, [form.project_id, projectId]);

  // work orders for the row being edited inline
  useEffect(() => {
    if (editingId == null) return;
    const row = (expenditures || []).find((e) => e.id === editingId);
    if (!row) return;
    listWorkOrders({ project_id: Number(row.project_id) })
      .then((r) => setEditWos(asArray(r.data)))
      .catch(() => setEditWos([]));
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const projectMap = useMemo(() => {
    const m = new Map();
    for (const p of projects || []) m.set(String(p.id), p);
    return m;
  }, [projects]);

  const sums = useMemo(() => {
    // Exact totals when scoped to one project; otherwise this page's rows.
    if (totals && projectId) {
      const bs = totals.by_status || {};
      return {
        approved: Number(totals.approved_total || 0),
        pending: Number(bs.SUBMITTED || 0) + Number(bs.DRAFT || 0),
        rejected: Number(bs.REJECTED || 0),
        count: totals.count ?? 0,
      };
    }
    let approved = 0, pending = 0, rejected = 0;
    for (const x of expenditures || []) {
      const a = Number(x.amount || 0);
      if (x.status === "APPROVED") approved += a;
      else if (x.status === "SUBMITTED" || x.status === "DRAFT") pending += a;
      else if (x.status === "REJECTED") rejected += a;
    }
    return { approved, pending, rejected, count: listTotal };
  }, [expenditures, totals, projectId, listTotal]);

  const projectGroups = useMemo(() => {
    if (projectId) return [];
    const map = new Map();
    for (const x of expenditures || []) {
      const k = String(x.project_id);
      if (!map.has(k)) map.set(k, { pid: k, rows: [], approved: 0, pending: 0 });
      const g = map.get(k);
      g.rows.push(x);
      const a = Number(x.amount || 0);
      if (x.status === "APPROVED") g.approved += a;
      else if (x.status === "SUBMITTED" || x.status === "DRAFT") g.pending += a;
    }
    return [...map.values()].sort((a, b) => b.approved - a.approved);
  }, [expenditures, projectId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (expenditures || [])
      .filter((x) => (!category ? true : x.expense_category === category))
      .filter((x) =>
        !q ? true :
          (x.description || "").toLowerCase().includes(q) ||
          (x.expense_category || "").toLowerCase().includes(q) ||
          (x.vendor_name || "").toLowerCase().includes(q) ||
          (x.payment_method || "").toLowerCase().includes(q) ||
          String(x.id).includes(q) ||
          String(x.project_id).includes(q)
      )
      .slice()
      .sort((a, b) => String(b.expense_date || "").localeCompare(String(a.expense_date || "")));
  }, [expenditures, search, category]);

  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;

  const refresh = () => {
    loadExpenditures({
      project_id: projectId || undefined,
      status: status === "ALL" ? undefined : status,
      category: category || undefined,
      q: search.trim() || undefined,
      page,
      limit: pageSize,
    }).catch(() => {});
    if (projectId) loadTotals(projectId).catch(() => {});
  };

  const openCreate = () => {
    setForm({ ...EMPTY, project_id: projectId || "" });
    setOpen(true);
  };

  const saveInlineEdit = async (id, values) => {
    setSavingId(id);
    try {
      const row = (expenditures || []).find((e) => e.id === id);
      await editExpenditure(id, {
        expense_date: values.expense_date,
        expense_category: values.expense_category,
        description: values.description || null,
        amount: Number(values.amount),
        currency: row?.currency || "INR",
        vendor_id: values.vendor_id ? Number(values.vendor_id) : null,
        work_order_id: values.work_order_id ? Number(values.work_order_id) : null,
        payment_method: values.payment_method || null,
        reference_number: values.reference_number || null,
      });
      push(`Expense #${id} updated`, "success");
      setEditingId(null);
      refresh();
    } catch (err) {
      push(errMsg(err, "Update failed"), "error");
    } finally {
      setSavingId(null);
    }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.project_id || !form.expense_date || !form.expense_category || form.amount === "") {
      push("Project, date, category and amount are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        project_id: Number(form.project_id),
        expense_date: form.expense_date,
        expense_category: form.expense_category,
        description: form.description || null,
        amount: Number(form.amount),
        currency: form.currency || "INR",
        vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
        work_order_id: form.work_order_id ? Number(form.work_order_id) : null,
        payment_method: form.payment_method || null,
        reference_number: form.reference_number || null,
      };
      await addExpenditure(payload);
      setOpen(false);
      push("Draft expenditure recorded", "success");      refresh();
    } catch (err) {
      push(errMsg(err, "Save failed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const act = async (fn, ok) => {
    try {
      await fn();
      push(ok, "success");
      refresh();
    } catch (err) {
      push(errMsg(err, "Action failed"), "error");
    }
  };

  const onReject = (x) => {
    const reason = window.prompt(`Reject expense #${x.id}? Give a reason:`, "Not justified");
    if (reason == null) return;
    act(() => rejectExpenditure(x.id, reason || "Not justified"), "Rejected");
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeExpenditure(deleteTarget.id);
      push(`Expense #${deleteTarget.id} deleted`, "success");
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      push(errMsg(err, "Delete failed"), "error");
    } finally {
      setDeleting(false);
    }
  };

  const hasFilters = projectId || category || status !== "ALL" || search;
  const clearAll = () => { setProjectId(""); setCategory(""); setStatus("ALL"); setSearch(""); setPage(1); };
  const cur = expenditures[0]?.currency || "INR";

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />

      {/* ---------- hero ---------- */}
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.eyebrow}>Site spend control</span>
          <h1>Project Expenditures</h1>
          <p>Draft → Submitted → Approved / Rejected. Only approved spend counts toward project cost.</p>
          <div className={styles.heroStats}>
            <span><b>{inr(sums.approved, cur)}</b> approved</span>
            <i />
            <span><b>{inr(sums.pending, cur)}</b> pending</span>
            <i />
            <span><b>{sums.count}</b> record(s)</span>
          </div>
        </div>
        <div className={styles.heroActions}>
          <button className={styles.primary} onClick={openCreate}><FiPlus /> Record expense</button>
          {projectId && (
            <button className={styles.ghost} onClick={() => navigate(`/admin/expenditures/${projectId}`)}>
              <FiEye /> Project dashboard
            </button>
          )}
        </div>
      </header>

      {/* ---------- KPIs ---------- */}
      <div className={styles.statsGrid}>
        <Stat icon={<FiCheckCircle />} tone="green" label="Approved" value={inr(sums.approved, cur)} sub="Counts as project cost" />
        <Stat icon={<FiClock />} tone="amber" label="Pending approval" value={inr(sums.pending, cur)} sub="Draft + submitted" />
        <Stat icon={<FiXCircle />} tone="red" label="Rejected" value={inr(sums.rejected, cur)} sub="Excluded from cost" />
        <Stat icon={<FiFileText />} tone="blue" label="Records" value={String(sums.count)} sub={totals && projectId ? `${Object.keys(totals.by_category || {}).length} categories` : "Across filter"} />
      </div>

      {/* ---------- project cards (all-projects view) ---------- */}
      {!projectId && projectGroups.length > 0 && (
        <section className={styles.projRow}>
          {projectGroups.slice(0, 8).map((g) => {
            const p = projectMap.get(g.pid);
            return (
              <button key={g.pid} className={styles.projCard} onClick={() => navigate(`/admin/expenditures/${g.pid}`)}>
                <span className={styles.projTop}>
                  <strong>{p ? `${p.project_code}` : `Project #${g.pid}`}</strong>
                  <FiEye />
                </span>
                <span className={styles.projName}>{p?.name || `${g.rows.length} record(s)`}</span>
                <span className={styles.projNums}>
                  <b>{inr(g.approved, cur)}</b> approved · {inr(g.pending, cur)} pending
                </span>
              </button>
            );
          })}
        </section>
      )}

      {/* ---------- toolbar ---------- */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            type="text"
            placeholder="Search description, vendor, category, #id, project…"
            value={search}
            onChange={(e) => setSearchView(e.target.value)}
          />
          {search && <button className={styles.xBtn} onClick={() => setSearchView("")} aria-label="Clear search"><FiX /></button>}
        </div>
        <div className={styles.filterBox}>
          <select value={projectId} onChange={(e) => setProjectView(e.target.value)} aria-label="Filter by project">
            <option value="">All projects</option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterBox}>
          <select value={category} onChange={(e) => setCategoryView(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>
        <div className={styles.pills}>
          {["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].map((s) => (
            <button key={s} className={styles.pill} data-active={status === s ? "1" : undefined} onClick={() => setStatusView(s)}>
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {hasFilters && <button className={styles.clearBtn} onClick={clearAll}><FiX /> Clear</button>}
      </div>

      {/* ---------- records ---------- */}
      <section className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <h3>Expense records</h3>
          <p>{filtered.length} on this page · {listTotal ?? filtered.length} total · click a project card for the full budget dashboard</p>
        </div>

        {loadingExpenditures && <p className={styles.padMuted}>Loading…</p>}
        {errorExpenditures && <p className={styles.padMuted}>Failed to load: {errMsg(errorExpenditures, "")}</p>}
        {!loadingExpenditures && !errorExpenditures && filtered.length === 0 && (
          <p className={styles.padMuted}>No expenditures found. Adjust filters or record one.</p>
        )}

        <div className={styles.rows}>
          {filtered.map((x) => {
            const p = projectMap.get(String(x.project_id));
            if (editingId === x.id) {
              return (
                <InlineEditRow
                  key={x.id}
                  x={x}
                  cur={x.currency || cur}
                  vendors={vendors}
                  wos={editWos}
                  saving={savingId === x.id}
                  onSave={saveInlineEdit}
                  onCancel={() => setEditingId(null)}
                />
              );
            }
            return (
              <article key={x.id} className={styles.row}>                <span className={styles.dot} data-tone={TONE[x.expense_category] || "slate"} />
                <div className={styles.rowMain}>
                  <div className={styles.rowTop}>
                    <strong>#{x.id} · {x.expense_category}</strong>
                    <span className={styles.status} data-tone={x.status === "APPROVED" ? "good" : x.status === "REJECTED" ? "bad" : x.status === "SUBMITTED" ? "info" : "warn"}>{x.status}</span>
                  </div>
                  <p className={styles.rowDesc}>{x.description || "No description"}</p>
                  <div className={styles.rowMeta}>
                    <span>{x.expense_date || "—"}</span>
                    <i>·</i>
                    <button className={styles.inlineLink} onClick={() => navigate(`/admin/expenditures/${x.project_id}`)}>
                      {p ? `${p.project_code}` : `Project #${x.project_id}`}
                    </button>
                    {x.vendor_name && <><i>·</i><span>{x.vendor_name}</span></>}
                    {x.payment_method && <><i>·</i><span>{x.payment_method}</span></>}
                    {x.reference_number && <><i>·</i><span>Ref {x.reference_number}</span></>}
                    {x.work_order_id && <><i>·</i><span>WO #{x.work_order_id}</span></>}
                  </div>
                  <div className={styles.actions}>
                    {canEdit(x) && <button className={styles.actBtn} onClick={() => setEditingId(x.id)}><FiEdit2 /> Edit</button>}
                    {x.status === "DRAFT" && <button className={styles.actBtn} onClick={() => act(() => submitExpenditure(x.id), "Submitted for approval")}><FiSend /> Submit</button>}
                    {x.status === "SUBMITTED" && canReview && (
                      <>
                        <button className={styles.actBtn} data-ok="1" onClick={() => act(() => approveExpenditure(x.id), "Approved")}><FiCheckCircle /> Approve</button>
                        <button className={styles.actBtn} data-danger="1" onClick={() => onReject(x)}><FiXCircle /> Reject</button>
                      </>
                    )}
                    <button className={styles.actBtn} onClick={() => navigate(`/admin/expenditures/${x.project_id}`)}><FiLayers /> Ledger</button>
                    {canDelete(x) && (
                      <button
                        className={styles.actBtn}
                        data-danger="1"
                        title={x.status === "APPROVED" ? "Only SUPERADMIN can delete approved records" : "Delete this record"}
                        onClick={() => setDeleteTarget(x)}
                      >
                        <FiTrash2 /> Delete
                      </button>
                    )}
                  </div>
                </div>
                <strong className={styles.amount}>{inr(x.amount, x.currency || cur)}</strong>
              </article>
            );
          })}
        </div>
        <Pagination
          page={page}
          total={listTotal ?? expenditures.length}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      </section>

      {/* ---------- add / edit modal ---------- */}
      <Modal isOpen={open} onClose={() => setOpen(false)} size="lg">
        <form className={styles.expForm} onSubmit={submitForm}>
          <h3>Record expense</h3>
          <div className={styles.expGrid}>
            <div className={styles.expField}>
              <label>Project *</label>
              <select value={form.project_id} onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value, work_order_id: "" }))} required>
                <option value="">Select…</option>
                {(projects || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.expField}>
              <label>Date *</label>
              <input type="date" value={form.expense_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm((p) => ({ ...p, expense_date: e.target.value }))} required />
            </div>
            <div className={styles.expField}>
              <label>Category *</label>
              <select value={form.expense_category} onChange={(e) => setForm((p) => ({ ...p, expense_category: e.target.value }))}>
                {EXPENSE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div className={styles.expField}>
              <label>Amount (INR) *</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required placeholder="0.00" />
            </div>
            <div className={styles.expField}>
              <label>Vendor (optional)</label>
              <select value={form.vendor_id} onChange={(e) => setForm((p) => ({ ...p, vendor_id: e.target.value }))}>
                <option value="">Site / supervisor spend (no vendor)</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{vendorLabel(v)}</option>
                ))}
              </select>
            </div>
            <div className={styles.expField}>
              <label>Work order (optional)</label>
              <select value={form.work_order_id} onChange={(e) => setForm((p) => ({ ...p, work_order_id: e.target.value }))}>
                <option value="">Not linked</option>
                {wos.map((w) => (
                  <option key={w.id} value={w.id}>{w.work_order_number || `WO #${w.id}`} · {w.status}</option>
                ))}
              </select>
            </div>
            <div className={`${styles.expField} ${styles.expFull}`}>
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="What was this spent on?" />
            </div>
            <div className={styles.expField}>
              <label>Payment method</label>
              <input value={form.payment_method} onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))} placeholder="Cash / UPI / Bank transfer" />
            </div>
            <div className={styles.expField}>
              <label>Reference #</label>
              <input value={form.reference_number} onChange={(e) => setForm((p) => ({ ...p, reference_number: e.target.value }))} placeholder="Bill / receipt number" />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.secondary} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={styles.primaryDark} disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Delete expense #${deleteTarget?.id}?`}
        message={
          deleteTarget
            ? `${deleteTarget.expense_category} · ${(Number(deleteTarget.amount) || 0).toLocaleString("en-IN")} ${deleteTarget.currency || "INR"} · ${deleteTarget.status}. This is permanent and audited.`
            : null
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
      />
    </div>
  );
}

function Stat({ icon, tone, label, value, sub }) {
  return (
    <div className={styles.statCard} data-tone={tone}>
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
        <span className={styles.statSub}>{sub}</span>
      </div>
      <span className={styles.statIcon}>{icon}</span>
    </div>
  );
}

function InlineEditRow({ x, cur, vendors, wos, saving, onSave, onCancel }) {
  const [f, setF] = useState({
    expense_date: x.expense_date || "",
    expense_category: x.expense_category || "MATERIAL",
    description: x.description || "",
    amount: x.amount != null ? String(x.amount) : "",
    vendor_id: x.vendor_id != null ? String(x.vendor_id) : "",
    work_order_id: x.work_order_id != null ? String(x.work_order_id) : "",
    payment_method: x.payment_method || "",
    reference_number: x.reference_number || "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    if (!f.expense_date || !f.expense_category || f.amount === "") return;
    onSave(x.id, f);
  };
  return (
    <article className={`${styles.row} ${styles.editingRow}`}>
      <span className={styles.dot} data-tone={TONE[x.expense_category] || "slate"} />
      <form className={styles.inlineForm} onSubmit={submit}>
        <div className={styles.rowTop}>
          <strong>#{x.id} · editing · Project #{x.project_id}</strong>
          <span className={styles.status} data-tone={x.status === "APPROVED" ? "good" : x.status === "REJECTED" ? "bad" : x.status === "SUBMITTED" ? "info" : "warn"}>{x.status}</span>
        </div>
        <div className={styles.expGrid}>
          <div className={styles.expField}>
            <label>Date *</label>
            <input type="date" value={f.expense_date} max={new Date().toISOString().slice(0, 10)} onChange={set("expense_date")} required />
          </div>
          <div className={styles.expField}>
            <label>Category *</label>
            <select value={f.expense_category} onChange={set("expense_category")}>
              {EXPENSE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className={styles.expField}>
            <label>Amount ({cur}) *</label>
            <input type="number" min="0" step="0.01" value={f.amount} onChange={set("amount")} required />
          </div>
          <div className={styles.expField}>
            <label>Vendor</label>
            <select value={f.vendor_id} onChange={set("vendor_id")}>
              <option value="">Site / supervisor spend (no vendor)</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{vendorLabel(v)}</option>
              ))}
            </select>
          </div>
          <div className={styles.expField}>
            <label>Work order</label>
            <select value={f.work_order_id} onChange={set("work_order_id")}>
              <option value="">Not linked</option>
              {wos.map((w) => (
                <option key={w.id} value={w.id}>{w.work_order_number || `WO #${w.id}`} · {w.status}</option>
              ))}
            </select>
          </div>
          <div className={styles.expField}>
            <label>Payment</label>
            <input value={f.payment_method} onChange={set("payment_method")} placeholder="Cash / UPI / Bank transfer" />
          </div>
          <div className={`${styles.expField} ${styles.expFull}`}>
            <label>Description</label>
            <input value={f.description} onChange={set("description")} placeholder="What was this spent on?" />
          </div>
          <div className={`${styles.expField} ${styles.expFull}`}>
            <label>Reference #</label>
            <input value={f.reference_number} onChange={set("reference_number")} placeholder="Bill / receipt number" />
          </div>
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.actBtn} data-ok="1" disabled={saving}>
            <FiCheckCircle /> {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className={styles.actBtn} onClick={onCancel} disabled={saving}>
            <FiXCircle /> Cancel
          </button>
        </div>
      </form>
    </article>
  );
}
