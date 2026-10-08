import { createContext, useContext, useState, useCallback } from "react";
import {
  getUsersAdmin,
  getUserDetail,
  createUser,
  updateUser,
  inviteUser,
  deleteUser,
  inviteExistingUser,
  resendInvite,
  revokeInvite,
  changeRole,
  changeStatus,
  getEligibility,
  createAssignment,
  listUserAssignments,
  endAssignment,
} from "../../api/auth.api";

const UserContext = createContext(null);

// User/profile list data. Auth state (token/role) lives in AuthContext.
export const UserProvider = ({ children }) => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async (params) => {
    try {
      setLoading(true);
      setError("");
      const res = await getUsersAdmin(params);
      setUsers(res.data || []);
      const t = Number(res.headers?.["x-total-count"]);
      setTotal(Number.isFinite(t) && t >= 0 ? t : (res.data || []).length);
    } catch (err) {
      // Real API failure surfaces as failure — never dummy data.
      setError(err?.response?.data?.detail || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const addUser = useCallback(
    async (data) => {
      const res = await createUser(data);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const updateExistingUser = useCallback(
    async (id, data) => {
      const res = await updateUser(id, data);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const inviteNewUser = useCallback(
    async (data) => {
      const res = await inviteUser(data);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const inviteExisting = useCallback(
    async (id) => {
      const res = await inviteExistingUser(id);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const resend = useCallback(
    async (id) => {
      const res = await resendInvite(id);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const revoke = useCallback(
    async (id) => {
      const res = await revokeInvite(id);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const setRole = useCallback(
    async (id, role) => {
      const res = await changeRole(id, role);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const setStatus = useCallback(
    async (id, accountStatus, reason) => {
      const res = await changeStatus(id, accountStatus, reason);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const removeUser = useCallback(
    async (id) => {
      const res = await deleteUser(id);
      await loadUsers();
      return res.data;
    },
    [loadUsers]
  );

  const fetchDetail = useCallback(async (id) => {
    const res = await getUserDetail(id);
    return res.data;
  }, []);

  const fetchEligibility = useCallback(async (id) => {
    const res = await getEligibility(id);
    return res.data;
  }, []);

  const assignToProject = useCallback(async (payload) => {
    const res = await createAssignment(payload);
    return res.data;
  }, []);

  const fetchAssignments = useCallback(async (id) => {
    const res = await listUserAssignments(id);
    return res.data;
  }, []);

  const endUserAssignment = useCallback(async (assignmentId, reason) => {
    const res = await endAssignment(assignmentId, reason);
    return res.data;
  }, []);

  return (
    <UserContext.Provider
      value={{
        users,
        total,
        loading,
        error,
        loadUsers,
        addUser,
        updateUser: updateExistingUser,
        inviteNewUser,
        inviteExisting,
        resendInvite: resend,
        revokeInvite: revoke,
        changeRole: setRole,
        changeStatus: setStatus,
        removeUser,
        fetchDetail,
        fetchEligibility,
        assignToProject,
        fetchAssignments,
        endUserAssignment,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUsers = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUsers must be inside UserProvider");
  return ctx;
};
