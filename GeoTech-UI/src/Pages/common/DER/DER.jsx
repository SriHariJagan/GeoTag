import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiBriefcase,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiTool,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiEdit2,
  FiFilter,
  FiMapPin,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiTrash2,
  FiTruck,
  FiUser,
  FiX,
} from "react-icons/fi";
import { useDER } from "../../../store/context/DailyExecutionContext";
import { useProjects } from "../../../store/context/ProjectContext";
import { useVendors } from "../../../store/context/VendorContext";
import { useAuth } from "../../../store/context/AuthContext";
import { ROLES } from "../../../constants/roles";
import DERForm from "../../../Components/Forms/DERForm";
import { getProjectById, getProjectCostLedger } from "../../../api/projects.api";
import {
  requestDEREdit,
  listDEREditRequests,
  reviewDEREdit,
} from "../../../api/dailyExecution.api";
import styles from "./DER.module.css";
import Modal from "../../../Components/Modal/Modal";
import ConfirmDialog from "../../../Components/Modal/ConfirmDialog";
import Pagination from "../../../Components/Pagination/Pagination";

const PAGE_SIZE = 10;

export default function DER() {
  const {
    dailyReports,
    total: serverTotal,
    loading,
    loadReports,
    updateReport,
    deleteReport,
    createReport,
    submitReport,
  } = useDER();

  const { projects, loadProjects } = useProjects();
  const { vendors, loadVendors } = useVendors();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  // Edit-request workflow (supervisor asks, admin approves/rejects).
  const [editReqs, setEditReqs] = useState([]);
  const [reqTarget, setReqTarget] = useState(null);
  const [reqMsg, setReqMsg] = useState("");
  const [reqBusy, setReqBusy] = useState(false);
  const [reviewNotes, setReviewNotes] = useState({});
  const [reviewBusy, setReviewBusy] = useState(null);
  const [submittingId, setSubmittingId] = useState(null);

  const [filters, setFilters] = useState({
    report_date: "",
    project_id: "",
    site_location: "",
    vendor_id: "",
  });

  const refreshEditReqs = () => {
    listDEREditRequests()
      .then((r) => setEditReqs(r.data || []))
      .catch(() => setEditReqs([]));
  };

  useEffect(() => {
    loadReports({
      page,
      limit: PAGE_SIZE,
      project_id: filters.project_id || undefined,
      report_date: filters.report_date || undefined,
      vendor_id: filters.vendor_id || undefined,
    });
    loadProjects();
    loadVendors();
    refreshEditReqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters.project_id, filters.report_date, filters.vendor_id]);

  // Latest request per report (API returns newest first).
  const reqByReport = useMemo(() => {
    const m = {};
    (editReqs || []).forEach((q) => {
      if (m[q.report_id] == null) m[q.report_id] = q;
    });
    return m;
  }, [editReqs]);

  const ownReport = (r) => Number(r.creator?.id) === Number(user?.id);

  const isAdmin = user?.role === ROLES.SUPERADMIN || user?.role === ROLES.ADMIN;
  const isSupervisor = user?.role === ROLES.SUPERVISOR;
  const canEdit = isAdmin || isSupervisor;
  const canDelete = isAdmin;

  // projects come from getMyProjects — supervisors already see assigned-only.
  // Vendor dropdown is further scoped to vendors linked to those projects.
  const assignedVendorIds = useMemo(() => {
    const ids = new Set();
    (projects || []).forEach((p) =>
      (p.vendors || []).forEach((v) => v?.id != null && ids.add(Number(v.id)))
    );
    return ids;
  }, [projects]);
  const scopedVendors = useMemo(() => {
    if (!isSupervisor || assignedVendorIds.size === 0) return vendors;
    return vendors.filter((v) => assignedVendorIds.has(Number(v.id)));
  }, [vendors, assignedVendorIds, isSupervisor]);

  const handleFilterChange = (e) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      report_date: "",
      project_id: "",
      site_location: "",
      vendor_id: "",
    });
    setPage(1);
  };

  const filteredReports = useMemo(() => {
    // project/date/vendor filter server-side; site_location stays client-side
    return dailyReports.filter((r) => {
      return !filters.site_location || r.site_location === filters.site_location;
    });
  }, [dailyReports, filters.site_location]);

  const reportStats = useMemo(() => {
    const total = serverTotal ?? dailyReports.length;
    const today = new Date().toISOString().slice(0, 10);

    const todayReports = dailyReports.filter(
      (r) => r.report_date === today
    ).length;

    const uniqueProjects = new Set(
      dailyReports.map((r) => r.project_id).filter(Boolean)
    ).size;

    const uniqueSites = new Set(
      dailyReports.map((r) => r.site_location).filter(Boolean)
    ).size;

    return {
      total,
      todayReports,
      uniqueProjects,
      uniqueSites,
    };
  }, [dailyReports]);

  const handleSubmit = (data) => {
    if (selectedReport?.id) {
      updateReport(selectedReport.id, data);
    } else {
      createReport(data);
    }

    setSelectedReport(null);
    setIsEditOpen(false);
  };

  const confirmDelete = () => {
    deleteReport(selectedReport.id);
    setSelectedReport(null);
    setIsDeleteOpen(false);
  };

  const [reqErr, setReqErr] = useState("");
  const sendEditRequest = async (e) => {
    e.preventDefault();
    if (!reqTarget || reqMsg.trim().length < 3 || reqBusy) return;
    setReqBusy(true);
    setReqErr("");
    try {
      await requestDEREdit(reqTarget.id, reqMsg.trim());
      setReqTarget(null);
      setReqMsg("");
      refreshEditReqs();
    } catch (err) {
      setReqErr(err?.response?.data?.detail || err?.message || "Request failed");
    } finally {
      setReqBusy(false);
    }
  };

  const reloadReports = () => {
    loadReports({
      page,
      limit: PAGE_SIZE,
      project_id: filters.project_id || undefined,
      report_date: filters.report_date || undefined,
      vendor_id: filters.vendor_id || undefined,
    });
  };

  const reviewReq = async (q, approve) => {
    const note = (reviewNotes[q.id] || "").trim();
    if (reviewBusy) return;
    setReviewBusy(q.id);
    try {
      await reviewDEREdit(q.id, { approve, note });
      setReviewNotes((p) => ({ ...p, [q.id]: "" }));
      refreshEditReqs();
      reloadReports();
    } catch {
      // keep the note so admin can retry
    } finally {
      setReviewBusy(null);
    }
  };

  const [reqTab, setReqTab] = useState("PENDING");
  const reqCounts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    (editReqs || []).forEach((q) => {
      if (c[q.status] == null) c[q.status] = 0;
      c[q.status] += 1;
    });
    return c;
  }, [editReqs]);
  const visibleReqs = useMemo(
    () => (editReqs || []).filter((q) => reqTab === "ALL" || q.status === reqTab).slice(0, 20),
    [editReqs, reqTab]
  );

  const openCreateForm = () => {
    const defaultProject = isSupervisor
      ? projects.find((p) => (p.supervisors || []).some((s) => Number(s.id) === Number(user.id)))
      : null;

    setSelectedReport({
      project_id: defaultProject?.id || "",
      vendor_id: defaultProject?.vendor_id || "",
      engineer_id: user?.id || "",
    });

    setIsEditOpen(true);
  };

  const hasFilters =
    filters.report_date ||
    filters.project_id ||
    filters.site_location ||
    filters.vendor_id;

  /* ---- project snapshot + spend history (auto-fetch on project select) ---- */
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [ledger, setLedger] = useState(null);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  useEffect(() => {
    const pid = Number(filters.project_id);
    if (!pid) { setSnapshot(null); setLedger(null); return; }
    let alive = true;
    setSnapshotBusy(true);
    setLedgerBusy(true);
    getProjectById(pid)
      .then((r) => alive && setSnapshot(r.data))
      .catch(() => alive && setSnapshot(null))
      .finally(() => alive && setSnapshotBusy(false));
    getProjectCostLedger(pid)
      .then((r) => alive && setLedger(r.data))
      .catch(() => alive && setLedger(null))
      .finally(() => alive && setLedgerBusy(false));
    return () => { alive = false; };
  }, [filters.project_id]);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Daily Site Operations</span>
          <h1>Daily Execution Reports</h1>
          <p>
            Track boreholes, rig activity, vendors, supervisors and daily field
            progress in one organised reporting workspace.
          </p>
        </div>

        <button
          className={styles.addBtn}
          disabled={loading}
          onClick={openCreateForm}
        >
          <FiPlus />
          Create Report
        </button>
      </div>

      <div className={styles.statsGrid}>
        <StatCard
          title="Total Reports"
          value={reportStats.total}
          icon={<FiClipboard />}
        />
        <StatCard
          title="Today's Reports"
          value={reportStats.todayReports}
          icon={<FiCalendar />}
          type="green"
        />
        <StatCard
          title="Projects Covered"
          value={reportStats.uniqueProjects}
          icon={<FiBriefcase />}
          type="blue"
        />
        <StatCard
          title="Sites Covered"
          value={reportStats.uniqueSites}
          icon={<FiMapPin />}
          type="orange"
        />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filterControl}>
          <FiCalendar />
          <input
            type="date"
            name="report_date"
            value={filters.report_date}
            onChange={handleFilterChange}
          />
        </div>

        <div className={styles.filterControl}>
          <FiSearch />
          <select
            name="project_id"
            value={filters.project_id}
            onChange={handleFilterChange}
            aria-label={isSupervisor ? "My projects" : "All projects"}
          >
            <option value="">{isSupervisor ? `My Projects (${projects.length})` : "All Projects"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_code ? `${p.project_code} — ` : ""}{p.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterControl}>
          <FiMapPin />
          <select
            name="site_location"
            value={filters.site_location}
            onChange={handleFilterChange}
          >
            <option value="">All Locations</option>
            {[...new Set(dailyReports.map((r) => r.site_location))]
              .filter(Boolean)
              .map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
          </select>
        </div>

        <div className={styles.filterControl}>
          <FiFilter />
          <select
            name="vendor_id"
            value={filters.vendor_id}
            onChange={handleFilterChange}
          >
            <option value="">All Vendors</option>
            {scopedVendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.legal_business_name || v.vendor_company || v.contact_person || `Vendor #${v.id}`}
              </option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <button onClick={clearFilters} className={styles.clearBtn}>
            <FiX />
            Clear
          </button>
        )}
      </div>

      {isAdmin && (
        <div className={styles.contentCard}>
          <div className={styles.tableHeader}>
            <div>
              <h3>
                <FiSend className={styles.h3Icon} /> Edit requests
                {reqCounts.PENDING > 0 && <span className={styles.reqCount}>{reqCounts.PENDING} to review</span>}
              </h3>
              <p>Supervisors asking to correct submitted reports — approve to unlock it back to draft, or reject with a reason</p>
            </div>
            <div className={styles.reqTotal}>
              <b>{(editReqs || []).length}</b>
              <span>total</span>
            </div>
          </div>
          <div className={styles.reqTabs} role="tablist" aria-label="Filter requests by status">
            {[["PENDING", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Declined"], ["ALL", "All"]].map(([v, label]) => {
              const n = v === "ALL" ? (editReqs || []).length : (reqCounts[v] || 0);
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={reqTab === v}
                  className={reqTab === v ? styles.reqTabOn : styles.reqTab}
                  onClick={() => setReqTab(v)}
                >
                  {label}
                  <em data-zero={n === 0 ? "1" : undefined}>{n}</em>
                </button>
              );
            })}
          </div>
          {visibleReqs.length === 0 && (
            <div className={styles.reqEmpty}>
              <span className={styles.reqEmptyIcon}>
                {reqTab === "PENDING" ? <FiCheckCircle /> : <FiClipboard />}
              </span>
              <h4>
                {reqTab === "PENDING"
                  ? "All caught up"
                  : reqTab === "ALL"
                    ? "No requests yet"
                    : `No ${reqTab === "APPROVED" ? "approved" : "declined"} requests`}
              </h4>
              <p>
                {reqTab === "PENDING"
                  ? "Every supervisor request has been reviewed. New ones will appear here."
                  : reqTab === "ALL"
                    ? "When a supervisor asks to correct a submitted report, it will show up here."
                    : "Switch tabs to see the other states."}
              </p>
            </div>
          )}
          <div className={styles.reqList}>
            {visibleReqs.map((q) => (
              <div key={q.id} className={styles.reqItem} data-status={q.status}>
                <div className={styles.reqTop}>
                  <span className={styles.reqAva}>{(q.requester_name || "?").charAt(0).toUpperCase()}</span>
                  <div className={styles.reqMain}>
                    <strong>
                      {q.requester_name || `user #${q.requested_by}`}
                      <span className={styles.reqTime}> · {q.created_at ? new Date(q.created_at).toLocaleString() : ""}</span>
                    </strong>
                    <span>wants to correct <b>{q.borehole_no || `report #${q.report_id}`}</b></span>
                  </div>
                  <span className={styles.reqPill} data-status={q.status}>
                    {q.status === "PENDING" ? "Pending" : q.status === "APPROVED" ? "Unlocked" : "Declined"}
                  </span>
                </div>
                <div className={styles.reqCtx}>
                  <span>{q.project_name || (q.project_id != null ? `Project #${q.project_id}` : "—")}</span>
                  <span>{q.report_date || ""}</span>
                  <button
                    className={styles.reqOpen}
                    onClick={() => navigate(`/admin/daily-execution-report/${q.report_id}`)}
                  >
                    Open report →
                  </button>
                </div>
                <q className={styles.reqQuote}>“{q.message}”</q>
                {q.status === "PENDING" ? (
                  <div className={styles.reqReview}>
                    <input
                      placeholder="Note for supervisor (required to reject)…"
                      value={reviewNotes[q.id] || ""}
                      onChange={(e) => setReviewNotes((p) => ({ ...p, [q.id]: e.target.value }))}
                    />
                    <div>
                      <button
                        className={styles.reqApprove}
                        disabled={reviewBusy === q.id}
                        onClick={() => reviewReq(q, true)}
                      >
                        Approve & unlock
                      </button>
                      <button
                        className={styles.reqReject}
                        disabled={reviewBusy === q.id || !(reviewNotes[q.id] || "").trim()}
                        title="Type a reason first"
                        onClick={() => reviewReq(q, false)}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.reqOutcome}>
                    {q.status === "APPROVED"
                      ? (q.report_status === "SUBMITTED"
                        ? "Supervisor changed & resubmitted — locked again. They must request afresh for more changes."
                        : "Unlocked back to draft — supervisor is editing, not resubmitted yet.")
                      : "Kept locked."}
                    {q.review_note ? (
                      <span> Admin note: “{q.review_note}”{q.reviewed_at ? ` · ${new Date(q.reviewed_at).toLocaleString()}` : ""}</span>
                    ) : (
                      q.reviewed_at && <span> · {new Date(q.reviewed_at).toLocaleString()}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Execution Report List</h3>
            <p>
              {filteredReports.length} on this page · {serverTotal ?? dailyReports.length}{" "}
              total
            </p>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Supervisor</th>
                <th>Vendor</th>
                <th>Site</th>
                <th>Borehole</th>
                <th>Rig</th>
                <th>Rig Type</th>
                <th>Total Depth</th>
                <th>Date</th>
                <th>Status</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canEdit || canDelete ? 11 : 10}>
                    <div className={styles.loadingState}>
                      <div className={styles.loader}></div>
                      <p>Loading reports...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={canEdit || canDelete ? 11 : 10}>
                    <div className={styles.emptyState}>
                      <FiClipboard />
                      <h3>No reports found</h3>
                      <p>Try changing filters or create a new report.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReports.map((r) => {
                  const projectName =
                    projects.find((p) => p.id === r.project_id)?.name ||
                    (r.project_id != null ? `Project #${r.project_id}` : "-");

                  // r.vendor can be an object ({id, vendor_company/vendor_name}),
                  // a string, or missing — never hand an object to React.
                  const vendorLabel = (v) =>
                    v?.legal_business_name ||
                    v?.vendor_company ||
                    v?.vendor_name ||
                    v?.contact_person ||
                    (v?.id != null ? `Vendor #${v.id}` : null);
                  const vendorName =
                    vendorLabel(vendors.find((v) => v.id === r.vendor_id)) ||
                    (typeof r.vendor === "string"
                      ? r.vendor
                      : vendorLabel(r.vendor)) ||
                    (r.vendor_id != null ? `Vendor #${r.vendor_id}` : "-");

                  return (
                    <tr key={r.id}>
                      <td>
                        <button
                          className={styles.projectLink}
                          onClick={() => navigate(`${r.id}`)}
                        >
                          {projectName}
                        </button>
                      </td>

                      <td>
                        <div className={styles.userCell}>
                          <span>
                            <FiUser />
                          </span>
                          {r?.creator?.full_name ||
                            (typeof r.creator === "string" ? r.creator : null) ||
                            "-"}
                        </div>
                      </td>

                      <td>{vendorName || "-"}</td>

                      <td>
                        <div className={styles.locationCell}>
                          <FiMapPin />
                          {r.site_location || "-"}
                        </div>
                      </td>

                      <td>
                        <span className={styles.codeBadge}>
                          {r.borehole_no || "-"}
                        </span>
                      </td>

                      <td>
                        <span className={styles.rigBadge}>
                          <FiTruck />
                          {r.rig_no || "-"}
                        </span>
                      </td>

                      <td>{r.type_of_rig || "-"}</td>

                      <td>
                        <strong className={styles.depthText}>
                          {r.total_depth || 0}
                        </strong>
                      </td>

                      <td>
                        <div className={styles.dateCell}>
                          <FiCalendar />
                          {r.report_date || "-"}
                        </div>
                      </td>

                      <td>
                        <span className={styles.codeBadge}>{r.status || "SUBMITTED"}</span>
                      </td>

                      {(canEdit || canDelete) && (
                        <td>
                          <div className={styles.actionGroup}>
                            {canEdit &&
                              (r.status === "DRAFT" || isAdmin || !r.status) && (
                              <button
                                className={styles.editBtn}
                                onClick={() => {
                                  setSelectedReport(r);
                                  setIsEditOpen(true);
                                }}
                                title="Edit report"
                              >
                                <FiEdit2 />
                              </button>
                            )}
                            {isSupervisor && r.status === "SUBMITTED" && ownReport(r) && (
                              <div className={styles.reqCell}>
                                <EditRequestAction
                                  req={reqByReport[r.id]}
                                  reportStatus={r.status}
                                  onAsk={() => { setReqTarget(r); setReqMsg(""); }}
                                />
                              </div>
                            )}

                            {r.status === "DRAFT" && (
                              <button
                                className={styles.submitBtn}
                                disabled={submittingId === r.id}
                                onClick={async () => {
                                  setSubmittingId(r.id);
                                  try {
                                    await submitReport(r.id);
                                  } finally {
                                    setSubmittingId(null);
                                  }
                                }}
                                title="Submit this draft report"
                              >
                                <FiSend />
                                {submittingId === r.id ? "Sending…" : "Submit"}
                              </button>
                            )}

                            {canDelete && (
                              <button
                                className={styles.deleteBtn}
                                onClick={() => {
                                  setSelectedReport(r);
                                  setIsDeleteOpen(true);
                                }}
                                title="Delete report"
                              >
                                <FiTrash2 />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        total={serverTotal || 0}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />

      {/* ---------- selected project snapshot (auto-fetched) ---------- */}
      {filters.project_id && (
        <div className={styles.contentCard}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Project Snapshot</h3>
              <p>Auto-loaded details for the selected project</p>
            </div>
            {snapshot && <span className={styles.codeBadge}>{snapshot.project_code}</span>}
          </div>
          {snapshotBusy && <p className={styles.mutedNote}>Loading project details…</p>}
          {!snapshotBusy && !snapshot && (
            <p className={styles.mutedNote}>Project details unavailable (you may not be assigned).</p>
          )}
          {snapshot && (
            <>
              <div className={styles.snapHead}>
                <div>
                  <h4>{snapshot.name}</h4>
                  <span>{snapshot.client_name || "-"} · {snapshot.location || "-"}</span>
                </div>
                <span className={styles.codeBadge}>{snapshot.status || "-"}</span>
              </div>
              <dl className={styles.snapGrid}>
                {[
                  ["Client", snapshot.client_name],
                  ["Location", snapshot.location],
                  ["Schedule", [snapshot.planned_start_date, snapshot.planned_end_date].filter(Boolean).join(" → ") || snapshot.date || "-"],
                  ["Budget", snapshot.project_budget != null ? `${Number(snapshot.project_budget).toLocaleString("en-IN")} ${snapshot.currency || "INR"}` : "-"],
                  ["Progress", `${snapshot.progress ?? 0}%`],
                  ["Boreholes", `${snapshot.completed_boreholes ?? 0} / ${snapshot.total_boreholes ?? "-"}`],
                ].map(([k, v]) => (
                  <div key={k} className={styles.snapItem}>
                    <dt>{k}</dt>
                    <dd>{v || "-"}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.snapTeams}>
                <div>
                  <span>Supervisors ({(snapshot.supervisors || []).length})</span>
                  <div className={styles.chipRow}>
                    {(snapshot.supervisors || []).map((s) => (
                      <span key={s.id} className={styles.chip}>{s.full_name}</span>
                    ))}
                    {(snapshot.supervisors || []).length === 0 && <span className={styles.mutedNote}>—</span>}
                  </div>
                </div>
                <div>
                  <span>Vendors ({(snapshot.vendors || []).length})</span>
                  <div className={styles.chipRow}>
                    {(snapshot.vendors || []).map((v) => (
                      <span key={v.id} className={styles.chip}>{v.vendor_name}</span>
                    ))}
                    {(snapshot.vendors || []).length === 0 && <span className={styles.mutedNote}>—</span>}
                  </div>
                </div>
                <div>
                  <span>Machinery ({(snapshot.machinery || []).length})</span>
                  <div className={styles.chipRow}>
                    {(snapshot.machinery || []).map((m) => (
                      <span key={m.id} className={styles.chip}>{m.machine_name}</span>
                    ))}
                    {(snapshot.machinery || []).length === 0 && <span className={styles.mutedNote}>—</span>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- project spend history ---------- */}
      {filters.project_id && (
        <div className={styles.contentCard}>
          <div className={styles.tableHeader}>
            <div>
              <h3>Project Spend History</h3>
              <p>
                Machinery per-day cost + extra expenses. Amounts are calculated by the server
                from accepted work-order rates and daily execution.
              </p>
            </div>
          </div>
          {ledgerBusy && <p className={styles.mutedNote}>Loading spend history…</p>}
          {!ledgerBusy && !ledger && (
            <p className={styles.mutedNote}>
              Spend history unavailable for this project (you may not be assigned).
            </p>
          )}
          {ledger && (
            <>
              <div className={styles.statsGrid}>
                <StatCard
                  title="Machinery Cost"
                  value={`${Number(ledger.totals.machinery_total).toLocaleString()} ${ledger.currency}`}
                  icon={<FiTool />}
                  type="blue"
                />
                <StatCard
                  title="Extra Expenses"
                  value={`${Number(ledger.totals.expenditure_total).toLocaleString()} ${ledger.currency}`}
                  icon={<FiClipboard />}
                  type="orange"
                />
                <StatCard
                  title="Total Spent"
                  value={`${Number(ledger.totals.grand_total).toLocaleString()} ${ledger.currency}`}
                  icon={<FiDollarSign />}
                  type="green"
                />
                <StatCard
                  title="Balance"
                  value={`${Number(ledger.totals.balance).toLocaleString()} ${ledger.currency}`}
                  icon={<FiCheckCircle />}
                  type={Number(ledger.totals.balance) < 0 ? "orange" : "blue"}
                />
              </div>

              <h4 className={styles.sectionHeading}>Machinery — rate per day × utilized days</h4>
              {ledger.machinery.length === 0 && <p className={styles.mutedNote}>No machinery utilization yet.</p>}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Machinery</th>
                    <th>Rate / day</th>
                    <th>Days</th>
                    <th>Rate Source</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.machinery.map((m) => (
                    <tr key={m.machine_id}>
                      <td>{m.machine_name}</td>
                      <td>{Number(m.rate_per_day).toLocaleString()} {ledger.currency}</td>
                      <td>{m.days}</td>
                      <td>{m.rate_source}{m.rate_missing ? " (no rate)" : ""}</td>
                      <td><strong>{Number(m.amount).toLocaleString()} {ledger.currency}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 className={styles.sectionHeading}>Weekly spend</h4>
              {ledger.weekly.length === 0 && <p className={styles.mutedNote}>No weekly activity yet.</p>}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Machinery</th>
                    <th>Extras</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.weekly.map((w) => (
                    <tr key={w.week}>
                      <td>{w.week}</td>
                      <td>{Number(w.machinery).toLocaleString()}</td>
                      <td>{Number(w.expenditures).toLocaleString()}</td>
                      <td><strong>{Number(w.total).toLocaleString()} {ledger.currency}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 className={styles.sectionHeading}>Full history</h4>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Detail</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.history
                    .slice()
                    .sort((a, b) => (a.date < b.date ? 1 : -1))
                    .map((h, i) => (
                      <tr key={`${h.kind}-${h.ref ?? i}-${i}`}>
                        <td>{h.date}</td>
                        <td>{h.kind}</td>
                        <td>{h.label}</td>
                        <td>{h.status}</td>
                        <td><strong>{Number(h.amount).toLocaleString()} {ledger.currency}</strong></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} size="lg">
        <DERForm initialData={selectedReport} onSubmit={handleSubmit} />
      </Modal>

      <Modal isOpen={!!reqTarget} onClose={() => !reqBusy && setReqTarget(null)}>
        <form className={styles.reqForm} onSubmit={sendEditRequest}>
          <h3>Request correction</h3>
          <p className={styles.mutedNote}>
            {reqTarget?.borehole_no || `Report #${reqTarget?.id}`} · {reqTarget?.report_date || ""} — an admin
            will approve (report unlocks back to draft) or reject with a reason.
          </p>
          <label>
            <span>What needs to change and why? *</span>
            <textarea
              value={reqMsg}
              onChange={(e) => setReqMsg(e.target.value)}
              placeholder="e.g. Wrong rig hours — actual was 6.5h, entered 8h…"
              rows={4}
              required
            />
          </label>
          {reqErr && <p className={styles.reqFormErr}>{reqErr}</p>}
          <div className={styles.reqFormBtns}>
            <button type="button" className={styles.clearBtn} disabled={reqBusy} onClick={() => setReqTarget(null)}>
              Cancel
            </button>
            <button type="submit" className={styles.addBtn} disabled={reqBusy || reqMsg.trim().length < 3}>
              {reqBusy ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Report?"
        message={
          <>
            Are you sure you want to delete this report for project{" "}
            <b>
              {
                projects.find((p) => p.id === selectedReport?.project_id)
                  ?.name
              }
            </b>
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
      />
    </div>
  );
}

function EditRequestAction({ req, reportStatus, onAsk }) {
  // An approval is single-use: once the supervisor edits + resubmits, the
  // report locks again (SUBMITTED) and a fresh request is required.
  const spentApproval = req?.status === "APPROVED" && reportStatus === "SUBMITTED";
  if (!req || req.status === "REJECTED" || spentApproval) {
    return (
      <>
        <button className={styles.reqBtn} onClick={onAsk} title="Ask an admin to unlock this report for correction">
          <FiSend /> {req && !spentApproval ? "Ask again" : "Request edit"}
        </button>
        {req?.status === "REJECTED" && (
          <span className={styles.reqNote} title={req.review_note || "No reason given"}>
            <FiX /> Declined{req.review_note ? ` — “${req.review_note}”` : ""}
          </span>
        )}
        {spentApproval && (
          <span className={styles.reqNote} data-locked="1" title="Resubmitted after the last unlock — locked again">
            <FiClock /> Resubmitted — locked
          </span>
        )}
      </>
    );
  }
  if (req.status === "PENDING") {
    return (
      <span className={styles.reqChip} data-tone="wait" title="An admin will approve or reject with a reason">
        <FiClock /> Awaiting admin
      </span>
    );
  }
  return (
    <span className={styles.reqChip} data-tone="yes">
      <FiCheck /> Unlocked — edit now
    </span>
  );
}

function StatCard({ title, value, icon, type = "blue" }) {
  return (
    <div className={`${styles.statCard} ${styles[type]}`}>
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>
      <span>{icon}</span>
    </div>
  );
}