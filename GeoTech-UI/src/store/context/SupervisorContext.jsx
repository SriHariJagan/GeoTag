import { createContext, useContext, useState, useCallback } from "react";
import { getSupervisors } from "../../api/supervisors.api";
import { cached, queryKey } from "../../utils/queryCache";

const SupervisorContext = createContext();

export const SupervisorProvider = ({ children }) => {
  const [supervisors, setSupervisors] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Real API data only — failures surface as errors, never fake records.
  const loadSupervisors = useCallback(async (params = {}, { force = false } = {}) => {
    try {
      setLoading(true);
      setError(null);
      const query = { page: 1, limit: 100, ...params };
      const payload = await cached(
        queryKey("supervisors:list", query),
        () =>
          getSupervisors(query).then((res) => {
            const rows = res?.data || [];
            const headerTotal = Number(res?.headers?.["x-total-count"]);
            return {
              rows,
              total: Number.isFinite(headerTotal) && headerTotal >= 0
                ? headerTotal
                : rows.length,
            };
          }),
        { force }
      );
      setSupervisors(payload.rows);
      setTotal(payload.total);
      return payload.rows;
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