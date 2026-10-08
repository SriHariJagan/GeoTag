import { createContext, useContext, useState, useCallback } from "react";
import { getSupervisors } from "../../api/supervisors.api";

const SupervisorContext = createContext();

export const SupervisorProvider = ({ children }) => {
  const [supervisors, setSupervisors] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Real API data only — failures surface as errors, never fake records.
  const loadSupervisors = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getSupervisors({ page: 1, limit: 100, ...params });
      setSupervisors(res?.data || []);
      const t = Number(res?.headers?.["x-total-count"]);
      setTotal(Number.isFinite(t) && t >= 0 ? t : (res?.data || []).length);
      return res?.data || [];
    } catch (err) {
      setError("Failed to load supervisors");
      setSupervisors([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <SupervisorContext.Provider
      value={{
        supervisors,
        total,
        loading,
        error,
        loadSupervisors,
      }}
    >
      {children}
    </SupervisorContext.Provider>
  );
};

export const useSupervisors = () => useContext(SupervisorContext);