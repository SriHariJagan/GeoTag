import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getAdminDashboard } from "../../api/dashboard.api";
import { useAuth } from "./AuthContext";

const DashboardContext = createContext(null);

// Roles the backend /dashboard/ endpoint permits.
const ALLOWED_ROLES = new Set(["SUPERADMIN", "ADMIN", "MONITOR"]);

export const DashboardProvider = ({ children }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await getAdminDashboard();
      setStats(res.data);
    } catch (err) {
      if (err?.response?.status !== 403) {
        console.error("Dashboard error:", err);
      }
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The endpoint is role-gated — don't fire doomed requests for other roles.
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      setStats(null);
      setError(null);
      setLoading(false);
      return;
    }
    loadDashboard();
  }, [user?.id, user?.role, loadDashboard]);

  return (
    <DashboardContext.Provider
      value={{ stats, loading, error, reload: loadDashboard }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used inside DashboardProvider");
  }
  return context;
};
