import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiEdit2,
  FiEye,
  FiMail,
  FiMoreVertical,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiTrash2,
  FiUserCheck,
  FiUsers,
  FiX,
  FiSlash,
  FiCheckCircle,
} from "react-icons/fi";
import { useUsers } from "../../store/context/UserContext";
import { useAuth } from "../../store/context/AuthContext";
import Modal from "../../Components/Modal/Modal";
import UserForm from "../../Components/Forms/UserForm";
import Toast from "../../Components/Toast/Toast";
import { useToast } from "../../Components/Toast/useToast";
import { can, PERMISSIONS } from "../../constants/permissions";
import { ROLES } from "../../constants/roles";
import { ACCOUNT_STATUS } from "../../constants/accountStatus";
import styles from "./Users.module.css";

const statusOf = (u) => u.account_status || (u.is_active ? "ACTIVE" : "INVITED");

export default function Users() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const {
    users = [],
    loading,
    error,
    loadUsers,
    addUser,
    updateUser,
    inviteExisting,
    resendInvite,
    revokeInvite,
    changeRole,
    changeStatus,
    removeUser,
  } = useUsers();
  const { toasts, push, dismiss } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [confirmInviteUser, setConfirmInviteUser] = useState(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [roleUser, setRoleUser] = useState(null);
  const [roleValue, setRoleValue] = useState(ROLES.SUPERVISOR);
  const [statusUser, setStatusUser] = useState(null);
  const [statusValue, setStatusValue] = useState(ACCOUNT_STATUS.SUSPENDED);
  const [inviteStatus, setInviteStatus] = useState({});
  const [actionError, setActionError] = useState("");

  const [filters, setFilters] = useState({ search: "", role: "", status: "" });
  const [sort, setSort] = useState({ key: "created", dir: -1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.role, filters.status, pageSize, users.length]);

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    );

  const canManage = can(currentUser, PERMISSIONS.USER_CREATE);
  const canInvite = can(currentUser, PERMISSIONS.USER_INVITE);
  const canRole = can(currentUser, PERMISSIONS.ROLE_CHANGE);
  const canDisable = can(currentUser, PERMISSIONS.USER_DISABLE);
  const canDelete = can(currentUser, PERMISSIONS.USER_DELETE);

  const handleFilterChange = (e) =>
    setFilters((p) => ({ ...p, [e.target.name]: e.target.value }));
  const clearFilters = () => setFilters({ search: "", role: "", status: "" });
  const uniqueValues = (key) =>
    [...new Set(
      users
        .filter((u) => u.role?.toUpperCase() !== ROLES.SUPERADMIN && u.role?.toUpperCase() !== ROLES.MONITOR)
        .map((u) => u[key])
        .filter(Boolean)
    )];

  const filteredData = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return users
      // System + oversight accounts never appear in the directory
      .filter((u) => u.role?.toUpperCase() !== ROLES.SUPERADMIN)
      .filter((u) => u.role?.toUpperCase() !== ROLES.MONITOR)
      .filter((u) => {
        const st = statusOf(u);
        const matchesSearch =
          !q ||
          (u.full_name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          (u.employee_id || "").toLowerCase().includes(q) ||
          (u.designation || "").toLowerCase().includes(q) ||
          (u.department || "").toLowerCase().includes(q);
        return (
          matchesSearch &&
          (!filters.role || u.role === filters.role) &&
          (!filters.status || filters.status === st)
        );
      });
  }, [users, filters]);

  const sortedData = useMemo(() => {
    const val = (u) => {
      switch (sort.key) {
        case "name":
          return (u.full_name || "").toLowerCase();
        case "email":
          return (u.email || "").toLowerCase();
        case "role":
          return (u.role || "").toUpperCase();
        case "status":
          return statusOf(u);
        case "created":
          return u.created_at || "";
        default:
          return "";
      }
    };
    return [...filteredData].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [filteredData, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedData = useMemo(
    () => sortedData.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedData, safePage, pageSize]
  );

  const stats = useMemo(() => {
    const visible = users.filter(
      (u) => u.role?.toUpperCase() !== "SUPERADMIN" && u.role?.toUpperCase() !== "MONITOR"
    );
    return {
      total: visible.length,
      active: visible.filter((u) => statusOf(u) === "ACTIVE").length,
      invited: visible.filter((u) => statusOf(u) === "INVITED").length,
      suspended: visible.filter(
        (u) => statusOf(u) === "SUSPENDED" || statusOf(u) === "DEACTIVATED"
      ).length,
    };
  }, [users]);

  const apiError = (err, fallback) =>
    err?.response?.data?.detail || err?.message || fallback;

  const handleSubmit = async (payload) => {
    try {
      setActionError("");
      if (selectedUser) await updateUser(selectedUser.id, payload);
      else await addUser(payload);
      setSelectedUser(null);
      setIsModalOpen(false);
      push(selectedUser ? "User updated" : "User profile created (INVITED). Send an invitation to activate.", "success");
    } catch (err) {
      setActionError(apiError(err, "Save failed"));
    }
  };

  const doInvite = async (u, fn, label) => {
    setInviteStatus((p) => ({ ...p, [u.id]: "sending" }));
    try {
      await fn();
      setInviteStatus((p) => ({ ...p, [u.id]: "sent" }));
      push(`Invitation ${label} for ${u.email}`, "success");
    } catch (err) {
      setInviteStatus((p) => ({ ...p, [u.id]: "idle" }));
      push(apiError(err, "Invitation failed"), "error");
    }
  };

  const hasFilters = filters.search || filters.role || filters.status;

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Access Control</span>
          <h1>User Management</h1>
          <p>
            Create professional profiles, send invitations, manage roles and
            account status. Creating a profile does not activate it — only
            accepting an invitation does.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refresh_btn} onClick={loadUsers} disabled={loading}>
            {loading ? (<><span className={styles.spinner} />Refreshing</>) : (<><FiRefreshCw />Refresh</>)}
          </button>
          {canManage && (
            <button className={styles.addBtn} onClick={() => { setSelectedUser(null); setActionError(""); setIsModalOpen(true); }}>
              <FiPlus />Create User
            </button>
          )}
        </div>
      </div>

      <div className={styles.statsGrid}>
        <StatCard title="Total Users" value={stats.total} icon={<FiUsers />} />
        <StatCard title="Active" value={stats.active} icon={<FiUserCheck />} type="green" />
        <StatCard title="Invited" value={stats.invited} icon={<FiMail />} type="blue" />
        <StatCard title="Suspended / Offboard" value={stats.suspended} icon={<FiSlash />} type="orange" />
      </div>

      <div className={styles.toolbar}>
        <div className={`${styles.filterBox} ${styles.searchGrow}`}>
          <FiSearch />
          <input
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            placeholder="Search name, email, employee ID, designation…"
            aria-label="Search users"
          />
          {filters.search && (
            <button
              className={styles.inlineClear}
              onClick={() => setFilters((p) => ({ ...p, search: "" }))}
              aria-label="Clear search"
            >
              <FiX />
            </button>
          )}
        </div>
        <div className={styles.filterBox}>
          <FiShield />
          <select name="role" value={filters.role} onChange={handleFilterChange}>
            <option value="">Select Role</option>
            {uniqueValues("role").map((v) => (<option key={v} value={v}>{v}</option>))}
          </select>
        </div>
        <div className={styles.filterBox}>
          <FiUserCheck />
          <select name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="">Select Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
        </div>
        {hasFilters && (
          <button className={styles.clearBtn} onClick={clearFilters}><FiX />Clear</button>
        )}
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>User List</h3>
            <p>
              Showing{" "}
              {sortedData.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, sortedData.length)} of{" "}
              {sortedData.length} users
            </p>
          </div>
          <label className={styles.pageSizeLabel}>
            Rows
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[8, 12, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortTh label="User" k="name" sort={sort} onSort={toggleSort} />
                <th>Professional</th>
                <SortTh label="Role" k="role" sort={sort} onSort={toggleSort} />
                <SortTh label="Status" k="status" sort={sort} onSort={toggleSort} />
                <SortTh label="Created" k="created" sort={sort} onSort={toggleSort} />
                <th className={styles.actionsCol}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows colSpan="6" rows={pageSize} />
              ) : error ? (
                <tr><td colSpan="6"><div className={styles.emptyState}><span className={styles.emptyIcon}><FiX /></span><h3>Failed to load users</h3><p>{error}</p></div></td></tr>
              ) : pagedData.length === 0 ? (
                <tr><td colSpan="6"><div className={styles.emptyState}><span className={styles.emptyIcon}><FiUsers /></span><h3>No users found</h3><p>Try changing filters or create a new user.</p></div></td></tr>
              ) : (
                pagedData.map((u, idx) => {
                  const st = statusOf(u);
                  const inviteDisabled =
                    u.invite_accepted_at || inviteStatus[u.id] === "sent" || inviteStatus[u.id] === "sending";
                  const isSelf = u.id === currentUser?.id;
                  const canSendInvite = canInvite && !u.invite_accepted_at && st !== "ACTIVE";
                  const canResend = canInvite && !u.invite_accepted_at && u.invited_at;
                  return (
                    <tr key={u.id} className={idx % 2 === 1 ? styles.zebra : ""}>
                      <td>
                        <div className={styles.userCell}>
                          <div className={styles.avatar} style={{ background: avatarBg(u.full_name) }}>
                            {u.full_name?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                          <div className={styles.userMeta}>
                            <strong>{u.full_name || "-"}</strong>
                            <span className={styles.userEmail}><FiMail />{u.email || "-"}</span>
                            <span className={styles.userEmp}>{u.employee_id || "No employee ID"}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={styles.profCell}>
                          <strong>{u.designation || "-"}</strong>
                          <span>
                            {[u.department, u.years_of_experience != null ? `${u.years_of_experience} yrs exp` : null]
                              .filter(Boolean).join(" · ") || "-"}
                          </span>
                        </div>
                      </td>
                      <td><span className={`${styles.tag} ${styles[`role_${(u.role || "").toUpperCase()}`] || ""}`}>{u.role}</span></td>
                      <td>
                        <span className={`${styles.status} ${st === "ACTIVE" ? styles.active : st === "INVITED" ? styles.invited : st === "SUSPENDED" ? styles.pending : styles.disabled}`}>
                          <span className={styles.statusDot} />
                          {st}
                        </span>
                        <span className={styles.inviteSub}>
                          {u.invitation_status || (u.invite_accepted_at ? "ACCEPTED" : u.invited_at ? "SENT" : "—")}
                        </span>
                      </td>
                      <td className={styles.dateCell}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className={styles.actions}>
                          <button className={styles.editBtn} title="View profile" aria-label={`View ${u.email}`} onClick={() => navigate(`/admin/users/${u.id}`)}><FiEye /></button>
                          {canManage && (
                            <button className={styles.editBtn} title="Edit user" aria-label={`Edit ${u.email}`} onClick={() => { setSelectedUser(u); setActionError(""); setIsModalOpen(true); }}><FiEdit2 /></button>
                          )}
                          <div className={styles.menuWrap} ref={openMenu === u.id ? menuRef : null}>
                            <button
                              className={styles.menuBtn}
                              title="More actions"
                              aria-label={`More actions for ${u.email}`}
                              aria-haspopup="menu"
                              aria-expanded={openMenu === u.id}
                              onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                            >
                              <FiMoreVertical />
                            </button>
                            {openMenu === u.id && (
                              <div className={styles.menu} role="menu">
                                <button role="menuitem" onClick={() => { setOpenMenu(null); navigate(`/admin/users/${u.id}`); }}>
                                  <FiEye /> View profile
                                </button>
                                {canSendInvite && (
                                  <button role="menuitem" disabled={inviteDisabled} onClick={() => { setOpenMenu(null); setConfirmInviteUser(u); }}>
                                    <FiMail />
                                    {inviteStatus[u.id] === "sending" ? "Sending…" : inviteStatus[u.id] === "sent" ? "Invitation sent" : "Send invitation"}
                                  </button>
                                )}
                                {canResend && (
                                  <button role="menuitem" onClick={() => { setOpenMenu(null); doInvite(u, () => resendInvite(u.id), "resent"); }}>
                                    <FiMail /> Resend invitation
                                  </button>
                                )}
                                {canResend && (
                                  <button role="menuitem" onClick={async () => {
                                    setOpenMenu(null);
                                    try { await revokeInvite(u.id); push(`Invitation revoked for ${u.email}`, "success"); }
                                    catch (err) { push(apiError(err, "Revoke failed"), "error"); }
                                  }}>
                                    <FiX /> Revoke invitation
                                  </button>
                                )}
                                {canRole && !isSelf && (
                                  <button role="menuitem" onClick={() => { setOpenMenu(null); setRoleUser(u); setRoleValue(u.role); }}>
                                    <FiShield /> Change role
                                  </button>
                                )}
                                {canDisable && !isSelf && st === "ACTIVE" && (
                                  <button role="menuitem" onClick={() => { setOpenMenu(null); setStatusUser(u); setStatusValue(ACCOUNT_STATUS.SUSPENDED); }}>
                                    <FiSlash /> Suspend user
                                  </button>
                                )}
                                {canDisable && !isSelf && (st === "SUSPENDED" || st === "DEACTIVATED") && (
                                  <button role="menuitem" onClick={async () => {
                                    setOpenMenu(null);
                                    try { await changeStatus(u.id, "ACTIVE"); push(`${u.email} activated`, "success"); }
                                    catch (err) { push(apiError(err, "Activation failed"), "error"); }
                                  }}>
                                    <FiCheckCircle /> Activate user
                                  </button>
                                )}
                                {canDelete && !isSelf && (
                                  <button role="menuitem" className={styles.menuDanger} onClick={() => { setOpenMenu(null); setConfirmDeleteUser(u); }}>
                                    <FiTrash2 /> Delete user
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
              ← Prev
            </button>
            {pageNumbers(safePage, totalPages).map((n, i) =>
              n === "…" ? (
                <span key={`gap-${i}`} className={styles.pageGap}>…</span>
              ) : (
                <button
                  key={n}
                  className={`${styles.pageBtn} ${n === safePage ? styles.pageActive : ""}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              )
            )}
            <button className={styles.pageBtn} disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="lg">
        {actionError && <div className={styles.emptyState}><p>{actionError}</p></div>}
        <UserForm initialData={selectedUser} onSubmit={handleSubmit} />
      </Modal>

      <Modal isOpen={!!confirmInviteUser} onClose={() => setConfirmInviteUser(null)}>
        <div className={styles.confirmModal}>
          <div className={styles.modalIcon}><FiMail /></div>
          <h3>Send Invitation</h3>
          <p>Invite <b>{confirmInviteUser?.email}</b> as <b>{confirmInviteUser?.role}</b>? The account stays INVITED until they accept.</p>
          <div className={styles.confirmBtns}>
            <button className={styles.cancelBtn} onClick={() => setConfirmInviteUser(null)}>Cancel</button>
            <button className={styles.confirmBtn} disabled={inviteStatus[confirmInviteUser?.id] === "sending"}
              onClick={async () => {
                const u = confirmInviteUser;
                setConfirmInviteUser(null);
                await doInvite(u, () => (u.invited_at ? resendInvite(u.id) : inviteExisting(u.id)), "sent");
              }}>
              Send Invitation
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!roleUser} onClose={() => setRoleUser(null)}>
        <div className={styles.confirmModal}>
          <div className={styles.modalIcon}><FiShield /></div>
          <h3>Change Role</h3>
          <p>Set role for <b>{roleUser?.email}</b>. Active account does not imply supervisor — assignment is separate.</p>
          <select value={roleValue} onChange={(e) => setRoleValue(e.target.value)}>
            <option value={ROLES.ADMIN}>ADMIN</option>
            <option value={ROLES.SUPERVISOR}>SUPERVISOR</option>
            <option value={ROLES.SUPERADMIN}>SUPERADMIN</option>
          </select>
          <div className={styles.confirmBtns}>
            <button className={styles.cancelBtn} onClick={() => setRoleUser(null)}>Cancel</button>
            <button className={styles.confirmBtn} onClick={async () => {
              try { await changeRole(roleUser.id, roleValue); push("Role updated", "success"); setRoleUser(null); }
              catch (err) { push(apiError(err, "Role change failed"), "error"); }
            }}>Confirm</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!statusUser} onClose={() => setStatusUser(null)}>
        <div className={styles.confirmModal}>
          <div className={styles.modalIcon}><FiSlash /></div>
          <h3>Change Account Status</h3>
          <p>Set status for <b>{statusUser?.email}</b>. Suspended users cannot log in or be assigned.</p>
          <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
            <option value={ACCOUNT_STATUS.SUSPENDED}>SUSPENDED</option>
            <option value={ACCOUNT_STATUS.DEACTIVATED}>DEACTIVATED</option>
            <option value={ACCOUNT_STATUS.ACTIVE}>ACTIVE</option>
          </select>
          <div className={styles.confirmBtns}>
            <button className={styles.cancelBtn} onClick={() => setStatusUser(null)}>Cancel</button>
            <button className={styles.confirmBtn} onClick={async () => {
              try { await changeStatus(statusUser.id, statusValue); push("Status updated", "success"); setStatusUser(null); }
              catch (err) { push(apiError(err, "Status change failed"), "error"); }
            }}>Confirm</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!confirmDeleteUser} onClose={() => setConfirmDeleteUser(null)}>
        <div className={styles.confirmModal}>
          <div className={styles.deleteIcon}><FiTrash2 /></div>
          <h3>Delete User</h3>
          <p>Are you sure you want to delete <b>{confirmDeleteUser?.email}</b>? Users with active assignments cannot be deleted.</p>
          <div className={styles.confirmBtns}>
            <button className={styles.cancelBtn} onClick={() => setConfirmDeleteUser(null)}>Cancel</button>
            <button className={styles.deleteConfirmBtn} onClick={async () => {
              try { await removeUser(confirmDeleteUser.id); setConfirmDeleteUser(null); push("User deleted", "success"); }
              catch (err) { push(apiError(err, "Delete failed"), "error"); }
            }}>Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ title, value, icon, type = "blue" }) {
  return (
    <div className={`${styles.statCard} ${styles[type]}`}>
      <div><p>{title}</p><h2>{value}</h2></div>
      <span>{icon}</span>
    </div>
  );
}

function SkeletonRows({ colSpan, rows }) {
  return (
    <>
      {Array.from({ length: Math.min(rows, 8) }).map((_, i) => (
        <tr key={`sk-${i}`}>
          <td colSpan={colSpan}>
            <div className={styles.skRow} aria-hidden>
              <span className={styles.skAvatar} />
              <span className={styles.skLines}>
                <i style={{ width: `${52 - i * 4}%` }} />
                <i style={{ width: `${30 - i * 2}%` }} />
              </span>
              <span className={styles.skPill} />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function SortTh({ label, k, sort, onSort }) {
  const active = sort?.key === k;
  return (
    <th aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`${styles.sortTh} ${active ? styles.sortActive : ""}`}
        onClick={() => onSort(k)}
        title={`Sort by ${label}`}
      >
        {label}
        <span className={styles.sortIcon} aria-hidden>
          {active ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, current - 1, current, current + 1, total - 1, total]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #2563eb, #0ea5e9)",
  "linear-gradient(135deg, #7c3aed, #db2777)",
  "linear-gradient(135deg, #0d9488, #22c55e)",
  "linear-gradient(135deg, #ea580c, #f59e0b)",
  "linear-gradient(135deg, #1d4ed8, #7c3aed)",
];

function avatarBg(name) {
  const c = (name || "U").charCodeAt(0) || 0;
  return AVATAR_GRADIENTS[c % AVATAR_GRADIENTS.length];
}
