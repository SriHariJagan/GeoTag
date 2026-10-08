import { useEffect, useMemo, useState } from "react";
import { FiBriefcase, FiFilter, FiSearch, FiX } from "react-icons/fi";
import { useProjects } from "../../../../store/context/ProjectContext";
import { useExpenditures } from "../../../../store/context/ExpendituresContext";
import Modal from "../../../../Components/Modal/Modal";
import Toast from "../../../../Components/Toast/Toast";
import { useToast } from "../../../../Components/Toast/useToast";
import { EXPENSE_CATEGORIES, getProjectExpenditures } from "../../../../api/expenditures.api";
import styles from "./ExpendituresSupervisor.module.css";

export default function ExpendituresSupervisor() {
  const { projects, loadProjects } = useProjects();
  const {
    expenditures, loadingExpenditures, loadProjectExpenditures,
    addExpenditure, editExpenditure, submitExpenditure,
  } = useExpenditures();
  const { toasts, push, dismiss } = useToast();

  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    expense_category: "FUEL",
    description: "",
    amount: "",
  });
  // Multi-row entry: record several expenses in one go.
  const blankRow = () => ({
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    expense_date: new Date().toISOString().slice(0, 10),
    expense_category: "FUEL",
    description: "",
    amount: "",
    state: "idle",
    error: "",
  });
  const [rows, setRows] = useState([blankRow()]);
  const [savingAll, setSavingAll] = useState(false);
  // Project picked inside the modal — can differ from the toolbar filter.
  const [modalProjectId, setModalProjectId] = useState("");
  const [prevList, setPrevList] = useState([]);
  const [prevLoading, setPrevLoading] = useState(false);

  const selectedProject = useMemo(
    () => (projects || []).find((p) => String(p.id) === String(projectId)),
    [projects, projectId]
  );

  useEffect(() => {
    loadProjects().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (projects.length && !projectId) setProjectId(String(projects[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  useEffect(() => {
    if (projectId) loadProjectExpenditures(projectId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filteredExpenditures = useMemo(() => {
    const q = search.trim().toLowerCase();
    let data = expenditures;
    if (q) {
      data = data.filter((x) =>
        (x.description || "").toLowerCase().includes(q) ||
        (x.expense_category || "").toLowerCase().includes(q) ||
        (x.vendor_name || "").toLowerCase().includes(q)
      );
    }
    if (status) {
      data = data.filter((x) => x.status === status);
    }
    return data;
  }, [expenditures, search, status]);

  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;

  const submit = async (e) => {
    e.preventDefault();
    // Single-edit path keeps the old behaviour.
    if (editing) {
      try {
        await editExpenditure(editing.id, {
          project_id: Number(projectId),
          ...form,
          amount: Number(form.amount),
        });
        setOpen(false);
        push("Saved as draft", "success");
        loadProjectExpenditures(projectId).catch(() => {});
      } catch (err) {
        push(errMsg(err, "Save failed"), "error");
      }
      return;
    }
    // Multi-row path: validate everything first, then save row by row.
    const today = new Date().toISOString().slice(0, 10);
    let invalid = 0;
    setRows((prev) =>
      prev.map((r) => {
        if (!r.expense_date || !(Number(r.amount) > 0)) {
          invalid += 1;
          return {
            ...r,
            state: "error",
            error: !r.expense_date ? "Date required" : "Amount must be greater than 0",
          };
        }
        return { ...r, state: "idle", error: "" };
      })
    );
    if (invalid > 0) {
      push(`Fix ${invalid} row(s) before saving`, "error");
      return;
    }
    if (!modalProjectId) {
      push("Select a project first", "error");
      return;
    }
    setSavingAll(true);
    let saved = 0;
    for (const r of rows) {
      setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, state: "saving", error: "" } : x)));
      try {
        await addExpenditure({
          project_id: Number(modalProjectId),
          expense_date: r.expense_date,
          expense_category: r.expense_category,
          description: r.description,
          amount: Number(r.amount),
        });
        saved += 1;
        setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, state: "done" } : x)));
      } catch (err) {
        setRows((prev) =>
          prev.map((x) => (x.key === r.key ? { ...x, state: "error", error: errMsg(err, "Save failed") } : x))
        );
      }
    }
    setSavingAll(false);
    if (String(modalProjectId) === String(projectId)) {
      loadProjectExpenditures(projectId).catch(() => {});
    }
    refreshPreview();
    if (saved === rows.length) {
      setOpen(false);
      setRows([blankRow()]);
      push(`${saved} expense(s) saved as draft`, "success");
    } else {
      push(`${saved} of ${rows.length} saved — fix the failed rows and save again`, "error");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setRows([blankRow()]);
    setModalProjectId(projectId || (projects[0] ? String(projects[0].id) : ""));
    setOpen(true);
  };

  // History preview for the modal project — check before recording.
  useEffect(() => {
    if (!open || editing || !modalProjectId) { setPrevList([]); return; }
    let alive = true;
    setPrevLoading(true);
    getProjectExpenditures(modalProjectId)
      .then((list) => alive && setPrevList(Array.isArray(list) ? list : []))
      .catch(() => alive && setPrevList([]))
      .finally(() => alive && setPrevLoading(false));
    return () => { alive = false; };
  }, [open, editing, modalProjectId]);

  const prevSummary = useMemo(() => {
    const by = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0 };
    const sum = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0 };
    prevList.forEach((x) => {
      const s = x.status || "DRAFT";
      if (by[s] == null) { by[s] = 0; sum[s] = 0; }
      by[s] += 1;
      sum[s] += Number(x.amount) || 0;
    });
    const recent = [...prevList]
      .sort((a, b) => String(b.expense_date || "").localeCompare(String(a.expense_date || "")))
      .slice(0, 5);
    return { by, sum, recent, total: prevList.length };
  }, [prevList]);

  const refreshPreview = () => {
    if (!modalProjectId) return;
    getProjectExpenditures(modalProjectId)
      .then((list) => setPrevList(Array.isArray(list) ? list : []))
      .catch(() => {});
  };

  const rowsTotal = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows]
  );

  const mine = expenditures.filter((x) => x.status === "DRAFT");

  const hasFilters = search || status;

  const clearAll = () => {
    setSearch("");
    setStatus("");
  };

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <div className={styles.header}>
        <div>
          <h1>My Expenditures</h1>
          <p>Record site expenses for assigned projects. Only drafts are editable.</p>
        </div>
        <button className={styles.primary} onClick={openCreate}>
          Record Expenses
        </button>
      </div>

      {selectedProject && (
        <div className={styles.projStrip}>
          <div>
            <strong>{selectedProject.project_code} — {selectedProject.name}</strong>
            <span>{selectedProject.client_name || "-"} · {selectedProject.location || "-"}</span>
          </div>
          <span className={styles.projStatus}>{selectedProject.status || "-"}</span>
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.filterBox}>
          <FiBriefcase />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            type="text"
            placeholder="Search description, category, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterBox}>
          <FiFilter />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button className={styles.clearBtn} onClick={clearAll}>
            <FiX />
            Clear
          </button>
        )}
      </div>

      {loadingExpenditures && <p>Loading…</p>}
      {!loadingExpenditures && filteredExpenditures.length === 0 && (
        <p className={styles.muted}>No expenditures found.</p>
      )}
      {filteredExpenditures.map((x) => (
        <div key={x.id} className={styles.card}>
          <div className={styles.expCardHead}>
            <h3>{x.expense_category}</h3>
            <span className={styles.expAmount}>{x.amount} {x.currency}</span>
          </div>
          <p>{x.description || "-"} · {x.expense_date}</p>
          <span className={`${styles.badge} ${x.status === "APPROVED" ? styles.badgeGreen : x.status === "REJECTED" ? styles.badgeRed : x.status === "SUBMITTED" ? styles.badgeDefault : styles.badgeAmber}`}>
            {x.status}
          </span>{" "}
          {x.status === "DRAFT" && (
            <>
              <button className={styles.small} onClick={() => { setEditing(x); setForm({ expense_date: x.expense_date, expense_category: x.expense_category, description: x.description || "", amount: String(x.amount) }); setOpen(true); }}>Edit</button>{" "}
              <button className={styles.small} onClick={async () => { try { await submitExpenditure(x.id); push("Submitted for approval", "success"); loadProjectExpenditures(projectId).catch(() => {}); } catch (err) { push(errMsg(err, "Submit failed"), "error"); } }}>Submit</button>
            </>
          )}
        </div>
      ))}
      {mine.length > 0 && <p className={styles.muted}>{mine.length} draft(s) awaiting submission.</p>}
      <Modal isOpen={open} onClose={() => setOpen(false)} size="lg">
        {editing ? (
          <form className={styles.expForm} onSubmit={submit}>
            <h3>Edit Expense</h3>
            <div className={styles.expGrid}>
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
                <label>Amount *</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div className={styles.expField}>
                <label>Description</label>
                <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="What was this spent on?" />
              </div>
            </div>
            <button type="submit" className={styles.primary}>Update</button>
          </form>
        ) : (
          <form className={styles.expForm} onSubmit={submit}>
            <h3>Record Expenses</h3>
            <label className={styles.expProjPick}>
              <span>Project * — pick it, check its history, then record below</span>
              <select value={modalProjectId} onChange={(e) => setModalProjectId(e.target.value)} required>
                <option value="">Select project…</option>
                {(projects || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>
                ))}
              </select>
            </label>
            {modalProjectId && (
              <div className={styles.expHist}>
                <div className={styles.expHistHead}>
                  <strong>
                    {prevLoading
                      ? "Loading project history…"
                      : `${prevSummary.total} record(s) on this project`}
                  </strong>
                  {!prevLoading && prevSummary.total > 0 && (
                    <span>
                      {["DRAFT", "SUBMITTED", "APPROVED"].map((s) => (
                        prevSummary.by[s] ? (
                          <i key={s} className={styles.expHistPill}>
                            {prevSummary.by[s]} {s.toLowerCase()} · ₹{prevSummary.sum[s].toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </i>
                        ) : null
                      ))}
                    </span>
                  )}
                </div>
                {!prevLoading && prevSummary.recent.length > 0 && (
                  <ul className={styles.expHistList}>
                    {prevSummary.recent.map((x) => (
                      <li key={x.id}>
                        <b>{x.expense_category}</b>
                        <span>{x.description || "—"}</span>
                        <span>{x.expense_date || ""}</span>
                        <strong>₹{Number(x.amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
                        <em>{x.status}</em>
                      </li>
                    ))}
                  </ul>
                )}
                {!prevLoading && prevSummary.total === 0 && (
                  <p className={styles.muted}>No expenses recorded on this project yet — yours will be the first.</p>
                )}
              </div>
            )}
            <div className={styles.expTable} role="table" aria-label="Expenses to record">
              <div className={styles.expColHead} role="row" aria-hidden>
                <span>#</span>
                <span>Date *</span>
                <span>Category *</span>
                <span>Description</span>
                <span>Amount (₹) *</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div key={r.key} className={styles.expRow} data-state={r.state} role="row">
                  <span className={styles.expRowNum}>{i + 1}</span>
                  <input
                    type="date" aria-label={`Row ${i + 1} date`} title="Date"
                    value={r.expense_date} max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, expense_date: e.target.value, state: "idle", error: "" } : x)))} required
                  />
                  <select
                    aria-label={`Row ${i + 1} category`} title="Category"
                    value={r.expense_category}
                    onChange={(e) => setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, expense_category: e.target.value } : x)))}
                  >
                    {EXPENSE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                  <input
                    aria-label={`Row ${i + 1} description`} title="Description"
                    value={r.description}
                    onChange={(e) => setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, description: e.target.value } : x)))}
                    placeholder="What was this spent on?"
                  />
                  <span className={styles.amtWrap}>
                    <i>₹</i>
                    <input
                      type="number" min="0" step="0.01" aria-label={`Row ${i + 1} amount`} title="Amount"
                      value={r.amount}
                      onChange={(e) => setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, amount: e.target.value, state: "idle", error: "" } : x)))}
                      placeholder="0.00" required
                    />
                  </span>
                  <button
                    type="button"
                    className={styles.rowDel}
                    disabled={rows.length <= 1 || savingAll}
                    title={rows.length <= 1 ? "At least one row is required" : `Remove row ${i + 1}`}
                    aria-label={`Remove row ${i + 1}`}
                    onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  >
                    <FiX />
                  </button>
                  {(r.state === "saving" || r.state === "done" || r.state === "error") && (
                    <span className={styles.rowState} data-ok={r.state === "done" ? "1" : undefined} data-err={r.state === "error" ? "1" : undefined}>
                      {r.state === "saving" ? "Saving…" : r.state === "done" ? "Saved ✓" : r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.expFoot}>
              <button type="button" className={styles.addRowBtn} disabled={savingAll} onClick={() => setRows((prev) => [...prev, blankRow()])}>
                + Add expense row
              </button>
              <span className={styles.expTotal}>
                <span>{rows.length} row{rows.length === 1 ? "" : "s"} · Total</span>
                <b>₹{rowsTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b>
              </span>
              <button type="submit" className={styles.saveAllBtn} disabled={savingAll || rows.length === 0}>
                {savingAll ? "Saving…" : `Save all (${rows.length})`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
