import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  FiArrowLeft, FiSearch, FiDollarSign, FiCheckCircle, FiClock,
  FiFileText, FiPieChart, FiTrendingUp, FiXCircle, FiLayers,
  FiTool, FiUsers, FiClipboard, FiEye, FiCalendar, FiMapPin,
  FiTruck, FiBox, FiPlus, FiEdit2, FiTrash2, FiSend,
} from "react-icons/fi";
import { useExpenditures } from "../../../../../store/context/ExpendituresContext";
import { useAuth } from "../../../../../store/context/AuthContext";
import { can, normalizeRole, PERMISSIONS } from "../../../../../constants/permissions";
import { getProjectById, getProjectCostLedger } from "../../../../../api/projects.api";
import { listWorkOrders } from "../../../../../api/procurement.api";
import { getProjectReports } from "../../../../../api/dailyExecution.api";
import { EXPENSE_CATEGORIES } from "../../../../../api/expenditures.api";
import { getVendors } from "../../../../../api/vendors.api";
import Modal from "../../../../../Components/Modal/Modal";
import ConfirmDialog from "../../../../../Components/Modal/ConfirmDialog";
import Toast from "../../../../../Components/Toast/Toast";
import { useToast } from "../../../../../Components/Toast/useToast";
import styles from "./ExpenditureDetailed.module.css";

const inr = (v, cur = "INR") =>
  `${(Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${cur}`;

const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.data)) return v.data;
  if (Array.isArray(v?.items)) return v.items;
  if (Array.isArray(v?.records)) return v.records;
  return [];
};

const parseMachines = (wo) => {
  try {
    const raw = wo.team_machines_json;
    const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : raw || [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const vendorLabel = (v) =>
  v?.legal_business_name || v?.vendor_company || v?.contact_person || `Vendor #${v?.id}`;

const EMPTY_EXP = {
  expense_date: new Date().toISOString().slice(0, 10),
  expense_category: "MATERIAL",
  description: "",
  amount: "",
  vendor_id: "",
  work_order_id: "",
  payment_method: "",
  reference_number: "",
};

const CATEGORY_TONE = {
  MATERIAL: "blue",
  LABOR: "violet",
  EQUIPMENT: "amber",
  FUEL: "orange",
  TRANSPORT: "cyan",
  VENDOR: "indigo",
  SUBCONTRACT: "pink",
  SITE_EXPENSE: "green",
  MISCELLANEOUS: "slate",
};

const TABS = ["Overview", "Machinery", "Vendors", "Site spend", "Work orders", "Records"];

export default function ExpenditureDetailed() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toasts, push, dismiss } = useToast();
  const {
    expenditures, totals, loadingExpenditures,
    loadProjectExpenditures, loadTotals,
    addExpenditure, editExpenditure, removeExpenditure,
    submitExpenditure, approveExpenditure, rejectExpenditure,
  } = useExpenditures();

  const [project, setProject] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [reports, setReports] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [tab, setTab] = useState("Overview");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selMachine, setSelMachine] = useState(null);
  const [selVendor, setSelVendor] = useState(null);
  const [expOpen, setExpOpen] = useState(false);
  const [expForm, setExpForm] = useState(EMPTY_EXP);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ---- permissions ----
  const canReview = can(user, PERMISSIONS.EXPENDITURE_APPROVE);
  const canCreate = can(user, PERMISSIONS.EXPENDITURE_CREATE);
  const isSuper = normalizeRole(user?.role) === "SUPERADMIN";
  const canEditRow = (x) => canReview || (x.status === "DRAFT" && x.created_by === user?.id);
  const canDeleteRow = (x) => {
    if (!canReview) return false;
    if (x.status === "APPROVED" && !isSuper) return false;
    return true;
  };
  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;

  const reloadLedger = () => {
    getProjectCostLedger(projectId).then((r) => setLedger(r.data)).catch(() => {});
  };
  const refreshAll = () => {
    loadProjectExpenditures(projectId).catch(() => {});
    loadTotals(projectId).catch(() => {});
    reloadLedger();
  };

  useEffect(() => {
    loadProjectExpenditures(projectId).catch(() => {});
    loadTotals(projectId).catch(() => {});
    getProjectById(projectId).then((r) => setProject(r.data)).catch(() => setProject(null));
    getProjectCostLedger(projectId).then((r) => setLedger(r.data)).catch(() => setLedger(null));
    listWorkOrders({ project_id: Number(projectId) })
      .then((r) => setWorkOrders(asArray(r.data)))
      .catch(() => setWorkOrders([]));
    getProjectReports(projectId)
      .then((r) => setReports(asArray(r.data)))
      .catch(() => setReports([]));
    getVendors().then((r) => setVendors(asArray(r.data))).catch(() => setVendors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const currency = project?.currency || ledger?.currency || expenditures[0]?.currency || "INR";
  const budget = Number(project?.project_budget ?? ledger?.budget ?? 0);

  // ---- machinery (WO rate × DER days, server-computed) ----
  const machines = ledger?.machinery || [];
  const machineryCost = Number(ledger?.totals?.machinery_total ?? machines.reduce((s, x) => s + Number(x.amount || 0), 0));

  // ---- site spend ----
  const approved = Number(totals?.approved_total || 0);
  const byStatus = totals?.by_status || {};
  const pending = Number(byStatus.SUBMITTED || 0) + Number(byStatus.DRAFT || 0);
  const trueCost = machineryCost + approved;
  const balance = budget - trueCost;
  const util = budget > 0 ? Math.min(100, (trueCost / budget) * 100) : 0;

  // ---- vendor vs site split ----
  const vendorExps = useMemo(() => (expenditures || []).filter((x) => x.vendor_id != null || x.vendor_name), [expenditures]);
  const siteExps = useMemo(() => (expenditures || []).filter((x) => x.vendor_id == null && !x.vendor_name), [expenditures]);

  const vendorGroups = useMemo(() => {
    const map = new Map();
    for (const x of vendorExps) {
      const key = x.vendor_name || `Vendor #${x.vendor_id}`;
      if (!map.has(key)) map.set(key, { name: key, vendor_id: x.vendor_id, rows: [], approved: 0, total: 0 });
      const g = map.get(key);
      g.rows.push(x);
      g.total += Number(x.amount || 0);
      if (x.status === "APPROVED") g.approved += Number(x.amount || 0);
    }
    return [...map.values()].sort((a, b) => b.approved - a.approved);
  }, [vendorExps]);

  const siteByCat = useMemo(() => {
    const map = new Map();
    for (const x of siteExps) {
      const k = x.expense_category || "MISCELLANEOUS";
      if (!map.has(k)) map.set(k, { name: k, rows: [], approved: 0, total: 0 });
      const g = map.get(k);
      g.rows.push(x);
      g.total += Number(x.amount || 0);
      if (x.status === "APPROVED") g.approved += Number(x.amount || 0);
    }
    return [...map.values()].sort((a, b) => b.approved - a.approved);
  }, [siteExps]);

  const woCommitments = useMemo(() => {
    const list = workOrders.length > 0 ? workOrders : ledger?.contract?.work_orders || [];
    return list;
  }, [workOrders, ledger]);
  const awardedTotal = Number(
    ledger?.contract?.awarded_total ??
    woCommitments.reduce((s, w) => s + Number(w.grand_total ?? w.contract_value ?? 0), 0)
  );

  const categories = useMemo(() => {
    const entries = Object.entries(totals?.by_category || {});
    const max = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));
    return entries
      .map(([k, v]) => ({ name: k, total: Number(v) || 0, max }))
      .sort((a, b) => b.total - a.total);
  }, [totals]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (expenditures || [])
      .filter((x) => (status === "ALL" ? true : x.status === status))
      .filter((x) =>
        !query
          ? true
          : (x.description || "").toLowerCase().includes(query) ||
            (x.expense_category || "").toLowerCase().includes(query) ||
            (x.vendor_name || "").toLowerCase().includes(query) ||
            String(x.id).includes(query)
      )
      .slice()
      .sort((a, b) => String(b.expense_date || "").localeCompare(String(a.expense_date || "")));
  }, [expenditures, q, status]);

  const openDrill = (t, sel) => {
    if (sel?.machine_id != null) setSelMachine(sel.machine_id);
    if (sel?.vendor) setSelVendor(sel.vendor);
    setTab(t);
  };

  const selMachineRow = machines.find((x) => x.machine_id === selMachine) || null;

  // find the work order behind a ledger rate_source like "WO GEOTECH/WO/…/WO-07"
  const woForRateSource = (rateSource) => {
    if (!rateSource || rateSource === "master" || rateSource === "unset") return null;
    const token = String(rateSource).replace(/^WO\s+/, "").trim();
    return (
      woCommitments.find((w) => (w.work_order_number || w.number) === token) ||
      woCommitments.find((w) => token && (w.work_order_number || w.number || "").includes(token.split("/").pop())) ||
      null
    );
  };

  // ---- expense add / edit / delete ----
  const openCreate = () => {
    setExpForm({ ...EMPTY_EXP });
    setExpOpen(true);
  };
  const submitExpForm = async (e) => {
    e.preventDefault();
    if (!expForm.expense_date || !expForm.expense_category || expForm.amount === "") {
      push("Date, category and amount are required", "error");
      return;
    }
    setCreating(true);
    try {
      await addExpenditure({
        project_id: Number(projectId),
        expense_date: expForm.expense_date,
        expense_category: expForm.expense_category,
        description: expForm.description || null,
        amount: Number(expForm.amount),
        currency,
        vendor_id: expForm.vendor_id ? Number(expForm.vendor_id) : null,
        work_order_id: expForm.work_order_id ? Number(expForm.work_order_id) : null,
        payment_method: expForm.payment_method || null,
        reference_number: expForm.reference_number || null,
      });
      setExpOpen(false);
      push("Draft expense recorded", "success");
      refreshAll();
    } catch (err) {
      push(errMsg(err, "Save failed"), "error");
    } finally {
      setCreating(false);
    }
  };
  const saveInlineEdit = async (id, values) => {
    setSavingId(id);
    try {
      await editExpenditure(id, {
        project_id: Number(projectId),
        expense_date: values.expense_date,
        expense_category: values.expense_category,
        description: values.description || null,
        amount: Number(values.amount),
        currency,
        vendor_id: values.vendor_id ? Number(values.vendor_id) : null,
        work_order_id: values.work_order_id ? Number(values.work_order_id) : null,
        payment_method: values.payment_method || null,
        reference_number: values.reference_number || null,
      });
      push(`Expense #${id} updated`, "success");
      setEditingId(null);
      refreshAll();
    } catch (err) {
      push(errMsg(err, "Update failed"), "error");
    } finally {
      setSavingId(null);
    }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeExpenditure(deleteTarget.id);
      push(`Expense #${deleteTarget.id} deleted`, "success");
      setDeleteTarget(null);
      refreshAll();
    } catch (err) {
      push(errMsg(err, "Delete failed"), "error");
    } finally {
      setDeleting(false);
    }
  };
  const act = async (fn, ok) => {
    try {
      await fn();
      push(ok, "success");
      refreshAll();
    } catch (err) {
      push(errMsg(err, "Action failed"), "error");
    }
  };
  const onReject = (x) => {
    const reason = window.prompt(`Reject expense #${x.id}? Give a reason:`, "Not justified");
    if (reason == null) return;
    act(() => rejectExpenditure(x.id, reason || "Not justified"), "Rejected");
  };

  const rowHandlers = {
    canEditRow, canDeleteRow, canReview,
    editingId, savingId,
    vendors, workOrders: woCommitments,
    onEdit: (x) => setEditingId(x.id),
    onCancelEdit: () => setEditingId(null),
    onSaveEdit: saveInlineEdit,
    onDelete: setDeleteTarget,
    onSubmit: (x) => act(() => submitExpenditure(x.id), "Submitted for approval"),
    onApprove: (x) => act(() => approveExpenditure(x.id), "Approved"),
    onReject,
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <button className={styles.back} onClick={() => navigate("/admin/expenditures")}>
        <FiArrowLeft /> Expenditures
      </button>

      {/* ================= PROJECT HEADER ================= */}
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.eyebrow}>Project budget dashboard · #{projectId}</span>
          <h1>{project ? `${project.project_code} — ${project.name}` : `Project #${projectId}`}</h1>
          <p className={styles.heroSub}>
            {[project?.client_name, project?.location, project?.status].filter(Boolean).join("  ·  ") ||
              "Budget, machinery earning, vendor and site spend — one page."}
          </p>
          <div className={styles.heroMeta}>
            <span><FiCalendar /> {project?.planned_start_date || project?.date || "Start —"}</span>
            <span><FiMapPin /> {project?.location || "—"}</span>
            <span><FiUsers /> {reports.length} day report(s)</span>
          </div>
          {budget > 0 && (
            <div className={styles.budgetBar}>
              <div className={styles.budgetTop}>
                <span>Budget used · {util.toFixed(1)}% (machinery + approved site spend)</span>
                <strong>{inr(trueCost, currency)} of {inr(budget, currency)}</strong>
              </div>
              <div className={styles.track}>
                <span style={{ width: `${util}%` }} data-over={balance < 0 ? "1" : undefined} />
              </div>
              <span className={styles.balance} data-neg={balance < 0 ? "1" : undefined}>
                {balance < 0 ? `Over budget by ${inr(Math.abs(balance), currency)}` : `Balance ${inr(balance, currency)}`}
              </span>
            </div>
          )}
        </div>
        <div className={styles.heroSide}>
          <div className={styles.heroAmount}>
            <span>Total project cost</span>
            <strong>{inr(trueCost, currency)}</strong>
            <em>{inr(machineryCost, currency)} machinery + {inr(approved, currency)} approved</em>
          </div>
          <div className={styles.heroBtns}>
            {canCreate && (
              <button className={styles.heroBtn} onClick={openCreate}><FiPlus /> Record expense</button>
            )}
            <Link className={styles.ledgerLink} to={`/admin/projects/${projectId}`}>Open project →</Link>
          </div>
        </div>
      </header>

      {/* ================= KPI STRIP ================= */}
      <div className={styles.kpiGrid}>
        <Kpi tone="blue" icon={<FiDollarSign />} label="Sanctioned budget" value={budget > 0 ? inr(budget, currency) : "Not set"} sub={project?.project_code || "Set in project master"} />
        <Kpi tone="amber" icon={<FiTool />} label="Machinery earned" value={inr(machineryCost, currency)} sub={`${machines.length} machine(s) × utilized days`} />
        <Kpi tone="green" icon={<FiCheckCircle />} label="Approved site spend" value={inr(approved, currency)} sub={`${expenditures.length} record(s) · ${inr(pending, currency)} pending`} />
        <Kpi tone={balance < 0 && budget > 0 ? "red" : "violet"} icon={<FiTrendingUp />} label="Balance" value={budget > 0 ? inr(balance, currency) : inr(awardedTotal, currency)} sub={budget > 0 ? "Budget less true cost" : "Awarded WO value"} />
      </div>

      {/* ================= TABS ================= */}
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t} className={styles.tab} data-active={tab === t ? "1" : undefined} onClick={() => setTab(t)}>
            {t}
            {t === "Machinery" && machines.length > 0 && <em>{machines.length}</em>}
            {t === "Vendors" && vendorGroups.length > 0 && <em>{vendorGroups.length}</em>}
            {t === "Work orders" && woCommitments.length > 0 && <em>{woCommitments.length}</em>}
          </button>
        ))}
      </div>

      {/* ================= OVERVIEW ================= */}
      {tab === "Overview" && (
        <>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3><FiPieChart className={styles.headIcon} /> How project cost is built</h3>
            </div>
            <div className={styles.formulaGrid}>
              <div className={styles.formula}>
                <span>Machinery earned</span>
                <strong>{inr(machineryCost, currency)}</strong>
                <em>WO rate/day × DER utilized days</em>
              </div>
              <span className={styles.formulaOp}>+</span>
              <div className={styles.formula}>
                <span>Approved site spend</span>
                <strong>{inr(approved, currency)}</strong>
                <em>Supervisor + vendor bills, approved only</em>
              </div>
              <span className={styles.formulaOp}>=</span>
              <div className={styles.formula} data-accent="1">
                <span>True project cost</span>
                <strong>{inr(trueCost, currency)}</strong>
                <em>{budget > 0 ? `of ${inr(budget, currency)} budget` : "budget not set"}</em>
              </div>
            </div>
          </section>

          <div className={styles.twoCol}>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h3><FiTool className={styles.headIcon} /> Machinery cost</h3>
                <button className={styles.linkBtn} onClick={() => setTab("Machinery")}>Details →</button>
              </div>
              {machines.length === 0 ? <p className={styles.muted}>No machine utilization in daily execution yet.</p> : (
                <div className={styles.list}>
                  {machines.slice(0, 4).map((x) => (
                    <button key={x.machine_id} className={styles.clickRow} onClick={() => openDrill("Machinery", { machine_id: x.machine_id })}>
                      <span className={styles.rowMain}>
                        <strong>{x.machine_name}</strong>
                        <span className={styles.rowMeta}>{inr(x.rate_per_day, currency)}/day ({x.rate_source}) × {x.days} day(s)</span>
                      </span>
                      <strong className={styles.amount}>{inr(x.amount, currency)}</strong>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h3><FiUsers className={styles.headIcon} /> Vendor spend</h3>
                <button className={styles.linkBtn} onClick={() => setTab("Vendors")}>Details →</button>
              </div>
              {vendorGroups.length === 0 ? <p className={styles.muted}>No vendor-linked spend yet.</p> : (
                <div className={styles.list}>
                  {vendorGroups.slice(0, 4).map((g) => (
                    <button key={g.name} className={styles.clickRow} onClick={() => openDrill("Vendors", { vendor: g.name })}>
                      <span className={styles.rowMain}>
                        <strong>{g.name}</strong>
                        <span className={styles.rowMeta}>{g.rows.length} bill(s)</span>
                      </span>
                      <strong className={styles.amount}>{inr(g.approved, currency)}</strong>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3><FiLayers className={styles.headIcon} /> Site spend by category</h3>
              <button className={styles.linkBtn} onClick={() => setTab("Records")}>All records →</button>
            </div>
            {categories.length === 0 ? <p className={styles.muted}>No spend recorded yet.</p> : (
              <div className={styles.catGrid}>
                {categories.slice(0, 6).map((c) => (
                  <div key={c.name} className={styles.catRow}>
                    <div className={styles.catTop}>
                      <span className={styles.catName}><FiLayers /> {c.name}</span>
                      <strong>{inr(c.total, currency)}</strong>
                    </div>
                    <div className={styles.miniTrack}>
                      <span style={{ width: `${(c.total / c.max) * 100}%` }} data-tone={CATEGORY_TONE[c.name] || "slate"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ================= MACHINERY ================= */}
      {tab === "Machinery" && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3><FiTool className={styles.headIcon} /> Machinery earning — WO rate × supervisor attendance</h3>
            <span className={styles.hint}>{inr(machineryCost, currency)} total</span>
          </div>
          <p className={styles.explain}>
            Each machine earns its work-order rate for every distinct day a supervisor marks it utilized
            in a daily execution report. Accepted-WO rate wins; otherwise the machine master rate applies.
            To change a machine's earning, edit the work-order rate or the day report — the total recomputes.
          </p>
          {machines.length === 0 && <p className={styles.muted}>No utilization yet — log machines in daily execution reports.</p>}
          <div className={styles.machineGrid}>
            {machines.map((x) => (
              <button
                key={x.machine_id}
                className={styles.machineCard}
                data-active={selMachine === x.machine_id ? "1" : undefined}
                onClick={() => setSelMachine(selMachine === x.machine_id ? null : x.machine_id)}
              >
                <span className={styles.machineTop}>
                  <strong>{x.machine_name}</strong>
                  {x.rate_missing ? <span className={styles.status} data-tone="bad">NO RATE</span> : <span className={styles.status} data-tone="good">{x.rate_source}</span>}
                </span>
                <span className={styles.formulaLine}>{inr(x.rate_per_day, currency)}/day × {x.days} day(s) = <b>{inr(x.amount, currency)}</b></span>
                <span className={styles.rowMeta}>Click for day-wise breakup + rate controls →</span>
              </button>
            ))}
          </div>

          {selMachineRow && (
            <MachineDetail
              row={selMachineRow}
              currency={currency}
              wo={woForRateSource(selMachineRow.rate_source)}
              canEditWo={can(user, PERMISSIONS.WORK_ORDER_CREATE)}
              onClose={() => setSelMachine(null)}
              onOpenWo={(id) => navigate(`/admin/work-orders/${id}`)}
              onOpenWos={() => setTab("Work orders")}
              onOpenMachines={() => navigate("/admin/machines")}
            />
          )}
        </section>
      )}

      {/* ================= VENDORS ================= */}
      {tab === "Vendors" && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3><FiUsers className={styles.headIcon} /> Vendor expenditures</h3>
            <span className={styles.hint}>{inr(vendorGroups.reduce((s, g) => s + g.approved, 0), currency)} approved</span>
          </div>
          {vendorGroups.length === 0 && <p className={styles.muted}>No vendor-linked bills yet. Bills get linked when a vendor is chosen on the expense.</p>}
          <div className={styles.list}>
            {vendorGroups.map((g) => (
              <div key={g.name}>
                <button className={styles.clickRow} data-active={selVendor === g.name ? "1" : undefined} onClick={() => setSelVendor(selVendor === g.name ? null : g.name)}>
                  <span className={styles.rowMain}>
                    <strong>{g.name}</strong>
                    <span className={styles.rowMeta}>{g.rows.length} bill(s) · {inr(g.total, currency)} claimed</span>
                  </span>
                  <strong className={styles.amount}>{inr(g.approved, currency)}</strong>
                </button>
                {selVendor === g.name && (
                  <div className={styles.detail}>
                    <div className={styles.detailHead}>
                      <h4>{g.name} — {g.rows.length} bill(s)</h4>
                      <div className={styles.detailBtns}>
                        {g.vendor_id && <Link className={styles.ledgerLink2} to={`/admin/vendors/${g.vendor_id}`}>Open vendor profile →</Link>}
                        {canCreate && <button className={styles.smallBtn} onClick={openCreate}><FiPlus /> Add bill</button>}
                      </div>
                    </div>
                    {g.rows.slice(0, 8).map((x) => (
                      <RecordRow key={x.id} x={x} currency={x.currency || currency} handlers={rowHandlers} />
                    ))}
                    {g.rows.length > 8 && <p className={styles.muted}>+ {g.rows.length - 8} more — see Records tab.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================= SITE SPEND ================= */}
      {tab === "Site spend" && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3><FiTruck className={styles.headIcon} /> Supervisor / site expenditures</h3>
            <div className={styles.detailBtns}>
              <span className={styles.hint}>{inr(siteExps.filter((x) => x.status === "APPROVED").reduce((s, x) => s + Number(x.amount || 0), 0), currency)} approved</span>
              {canCreate && <button className={styles.smallBtn} onClick={openCreate}><FiPlus /> Record expense</button>}
            </div>
          </div>
          <p className={styles.explain}>Field spend logged by supervisors with no vendor attached — fuel, consumables, camp, transport.</p>
          {siteByCat.length === 0 && <p className={styles.muted}>No site spend recorded.</p>}
          {siteByCat.map((g) => (
            <div key={g.name} className={styles.catBlock}>
              <div className={styles.catTop}>
                <span className={styles.catName}><FiBox /> {g.name} · {g.rows.length}</span>
                <strong>{inr(g.approved, currency)} <em className={styles.claimed}>/ {inr(g.total, currency)} claimed</em></strong>
              </div>
              {g.rows.slice(0, 5).map((x) => (
                <RecordRow key={x.id} x={x} currency={x.currency || currency} handlers={rowHandlers} />
              ))}
            </div>
          ))}
        </section>
      )}

      {/* ================= WORK ORDERS ================= */}
      {tab === "Work orders" && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3><FiClipboard className={styles.headIcon} /> Work orders — what we agreed to pay</h3>
            <span className={styles.hint}>Awarded {inr(awardedTotal, currency)}</span>
          </div>
          {woCommitments.length === 0 && <p className={styles.muted}>No work orders for this project yet.</p>}
          <div className={styles.list}>
            {woCommitments.map((w) => {
              const team = parseMachines(w);
              return (
                <div key={w.id ?? w.number} className={styles.woRow}>
                  <span className={styles.rowMain}>
                    <strong>{w.work_order_number || w.number || `WO #${w.id}`}</strong>
                    <span className={styles.rowMeta}>
                      {[w.vendor_name, w.status].filter(Boolean).join(" · ")}
                      {team.length > 0 && ` · ${team.length} machine(s): ${team.map((t) => `${t.machine_id}@${inr(t.rate_per_day, currency)}/d`).join(", ")}`}
                    </span>
                  </span>
                  <strong className={styles.amount}>{inr(w.grand_total ?? w.contract_value ?? w.grandTotal ?? 0, w.currency || currency)}</strong>
                  {w.id && <button className={styles.smallBtn} onClick={() => navigate(`/admin/work-orders/${w.id}`)}><FiEye /> Open</button>}
                </div>
              );
            })}
          </div>
          <p className={styles.footNote}>
            Machine rates inside an <b>accepted</b> work order override master rates in the machinery-earning
            calculation above. That is the link between work orders, supervisor attendance, and project budget.
          </p>
        </section>
      )}

      {/* ================= RECORDS ================= */}
      {tab === "Records" && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3><FiFileText className={styles.headIcon} /> All expense records</h3>
            <div className={styles.detailBtns}>
              <span className={styles.hint}>{filtered.length} shown</span>
              {canCreate && <button className={styles.smallBtn} onClick={openCreate}><FiPlus /> Record expense</button>}
            </div>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <FiSearch />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, vendor, category, #id…" />
              {q && <button onClick={() => setQ("")} aria-label="Clear search"><FiXCircle /></button>}
            </div>
            <div className={styles.pills}>
              {["ALL", "APPROVED", "SUBMITTED", "DRAFT", "REJECTED"].map((s) => (
                <button key={s} className={styles.pill} data-active={status === s ? "1" : undefined} onClick={() => setStatus(s)}>
                  {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          {loadingExpenditures && <p className={styles.muted}>Loading…</p>}
          {!loadingExpenditures && filtered.length === 0 && (
            <p className={styles.muted}>
              {(expenditures || []).length === 0 ? "No expenditures recorded for this project yet." : "No records match this filter."}
            </p>
          )}
          <div className={styles.list}>
            {filtered.map((x) => (
              <RecordRow key={x.id} x={x} currency={x.currency || currency} handlers={rowHandlers} />
            ))}
          </div>
          <p className={styles.footNote}>
            Only <b>APPROVED</b> records count toward project cost. Machinery earning above is computed
            separately (rate × utilized days) and added to approved site spend for the true project cost.
          </p>
        </section>
      )}

      {/* ================= record expense modal ================= */}
      <Modal isOpen={expOpen} onClose={() => setExpOpen(false)} size="lg">
        <form className={styles.expForm} onSubmit={submitExpForm}>
          <h3>{`Record expense · ${project?.project_code || `Project #${projectId}`}`}</h3>
          <div className={styles.expGrid}>
            <div className={styles.expField}>
              <label>Date *</label>
              <input type="date" value={expForm.expense_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpForm((p) => ({ ...p, expense_date: e.target.value }))} required />
            </div>
            <div className={styles.expField}>
              <label>Category *</label>
              <select value={expForm.expense_category} onChange={(e) => setExpForm((p) => ({ ...p, expense_category: e.target.value }))}>
                {EXPENSE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div className={styles.expField}>
              <label>Amount ({currency}) *</label>
              <input type="number" min="0" step="0.01" value={expForm.amount} onChange={(e) => setExpForm((p) => ({ ...p, amount: e.target.value }))} required placeholder="0.00" />
            </div>
            <div className={styles.expField}>
              <label>Vendor (optional)</label>
              <select value={expForm.vendor_id} onChange={(e) => setExpForm((p) => ({ ...p, vendor_id: e.target.value }))}>
                <option value="">Site / supervisor spend (no vendor)</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{vendorLabel(v)}</option>
                ))}
              </select>
            </div>
            <div className={styles.expField}>
              <label>Work order (optional)</label>
              <select value={expForm.work_order_id} onChange={(e) => setExpForm((p) => ({ ...p, work_order_id: e.target.value }))}>
                <option value="">Not linked</option>
                {woCommitments.filter((w) => w.id).map((w) => (
                  <option key={w.id} value={w.id}>{w.work_order_number || w.number || `WO #${w.id}`} · {w.status || ""}</option>
                ))}
              </select>
            </div>
            <div className={styles.expField}>
              <label>Payment method</label>
              <input value={expForm.payment_method} onChange={(e) => setExpForm((p) => ({ ...p, payment_method: e.target.value }))} placeholder="Cash / UPI / Bank transfer" />
            </div>
            <div className={`${styles.expField} ${styles.expFull}`}>
              <label>Description</label>
              <input value={expForm.description} onChange={(e) => setExpForm((p) => ({ ...p, description: e.target.value }))} placeholder="What was this spent on?" />
            </div>
            <div className={`${styles.expField} ${styles.expFull}`}>
              <label>Reference #</label>
              <input value={expForm.reference_number} onChange={(e) => setExpForm((p) => ({ ...p, reference_number: e.target.value }))} placeholder="Bill / receipt number" />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.secondary} onClick={() => setExpOpen(false)}>Cancel</button>
            <button type="submit" className={styles.primaryDark} disabled={creating}>{creating ? "Saving…" : "Save draft"}</button>
          </div>
        </form>
      </Modal>

      {/* ================= delete confirm ================= */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Delete expense #${deleteTarget?.id}?`}
        message={
          deleteTarget
            ? `${deleteTarget.expense_category} · ${inr(deleteTarget.amount, deleteTarget.currency || currency)} · ${deleteTarget.status}. This is permanent and audited.`
            : null
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
      />
    </div>
  );
}

function Kpi({ tone, icon, label, value, sub }) {
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

function MachineDetail({ row, currency, wo, canEditWo, onClose, onOpenWo, onOpenWos, onOpenMachines }) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <h4>{row.machine_name} — {row.days} day(s) · {inr(row.amount, currency)}</h4>
        <button className={styles.linkBtn} onClick={onClose}>Close ✕</button>
      </div>
      <p className={styles.rowMeta}>
        Rate {inr(row.rate_per_day, currency)}/day from <b>{row.rate_source}</b>
        {row.rate_missing && " — set a master rate or WO rate, else earning stays 0."}
      </p>
      <div className={styles.dateChips}>
        {(row.dates || []).map((d) => <span key={d} className={styles.dateChip}><FiCalendar /> {d}</span>)}
      </div>
      <div className={styles.manageRow}>
        <span className={styles.hint}>Change this earning:</span>
        {wo?.id ? (
          <button className={styles.smallBtn} onClick={() => onOpenWo(wo.id)}><FiEdit2 /> Edit WO rate ({wo.work_order_number || wo.number || `WO #${wo.id}`})</button>
        ) : (
          <button className={styles.smallBtn} onClick={onOpenWos}><FiClipboard /> Set rate via work order</button>
        )}
        <button className={styles.smallBtn} onClick={onOpenMachines}><FiTool /> Master rates</button>
      </div>
      {wo?.id == null && canEditWo === false && (
        <p className={styles.muted}>Work-order rates need a procurement role — ask an admin.</p>
      )}
    </div>
  );
}

function RecordRow({ x, currency, handlers }) {
  const {
    canEditRow, canDeleteRow, canReview,
    editingId, savingId, vendors, workOrders,
    onEdit, onCancelEdit, onSaveEdit,
    onDelete, onSubmit, onApprove, onReject,
  } = handlers;
  if (editingId === x.id) {
    return (
      <InlineEditRow
        x={x}
        currency={currency}
        vendors={vendors || []}
        workOrders={workOrders || []}
        saving={savingId === x.id}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
      />
    );
  }
  return (
    <article className={styles.row}>
      <span className={styles.catDot} data-tone={CATEGORY_TONE[x.expense_category] || "slate"} />
      <div className={styles.rowMain}>
        <div className={styles.rowTop}>
          <strong>#{x.id} · {x.expense_category}</strong>
          <span className={styles.status} data-tone={x.status === "APPROVED" ? "good" : x.status === "REJECTED" ? "bad" : x.status === "SUBMITTED" ? "info" : "warn"}>{x.status}</span>
        </div>
        <p className={styles.rowDesc}>{x.description || "No description"}</p>
        <div className={styles.rowMeta}>
          <span>{x.expense_date || "—"}</span>
          {x.vendor_name && <><i>·</i><span>{x.vendor_name}</span></>}
          {x.payment_method && <><i>·</i><span>{x.payment_method}</span></>}
          {x.reference_number && <><i>·</i><span>Ref {x.reference_number}</span></>}
          {x.work_order_id && <><i>·</i><span>WO #{x.work_order_id}</span></>}
        </div>
        <div className={styles.rowActions}>
          {canEditRow(x) && <button className={styles.iconAction} onClick={() => onEdit(x)}><FiEdit2 /> Edit</button>}
          {x.status === "DRAFT" && <button className={styles.iconAction} onClick={() => onSubmit(x)}><FiSend /> Submit</button>}
          {x.status === "SUBMITTED" && canReview && (
            <>
              <button className={styles.iconAction} data-ok="1" onClick={() => onApprove(x)}><FiCheckCircle /> Approve</button>
              <button className={styles.iconAction} data-danger="1" onClick={() => onReject(x)}><FiXCircle /> Reject</button>
            </>
          )}
          {canDeleteRow(x) && (
            <button
              className={styles.iconAction}
              data-danger="1"
              title={x.status === "APPROVED" ? "Only SUPERADMIN can delete approved records" : "Delete this record"}
              onClick={() => onDelete(x)}
            >
              <FiTrash2 /> Delete
            </button>
          )}
        </div>
      </div>
      <strong className={styles.amount}>{inr(x.amount, currency)}</strong>
    </article>
  );
}

function InlineEditRow({ x, currency, vendors, workOrders, saving, onSave, onCancel }) {
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
      <span className={styles.catDot} data-tone={CATEGORY_TONE[x.expense_category] || "slate"} />
      <form className={styles.inlineForm} onSubmit={submit}>
        <div className={styles.rowTop}>
          <strong>#{x.id} · editing</strong>
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
            <label>Amount ({currency}) *</label>
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
              {workOrders.filter((w) => w.id).map((w) => (
                <option key={w.id} value={w.id}>{w.work_order_number || w.number || `WO #${w.id}`} · {w.status || ""}</option>
              ))}
            </select>
          </div>
          <div className={styles.expField}>
            <label>Payment</label>
            <input value={f.payment_method} onChange={set("payment_method")} placeholder="Cash / UPI / Bank" />
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
        <div className={styles.rowActions}>
          <button type="submit" className={styles.iconAction} data-ok="1" disabled={saving}>
            <FiCheckCircle /> {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className={styles.iconAction} onClick={onCancel} disabled={saving}>
            <FiXCircle /> Cancel
          </button>
        </div>
      </form>
    </article>
  );
}
