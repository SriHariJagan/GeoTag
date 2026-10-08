import { createContext, useContext, useState, useCallback } from "react";
import * as procurementAPI from "../../api/procurement.api";

const ProcurementContext = createContext();

export const ProcurementProvider = ({ children }) => {
  const [rfqs, setRfqs] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [rfqTotal, setRfqTotal] = useState(0);
  const [woTotal, setWoTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const totalOf = (res, rows) => {
    const n = Number(res?.headers?.["x-total-count"]);
    return Number.isFinite(n) && n >= 0 ? n : (rows || []).length;
  };

  const loadRFQs = useCallback(async (params) => {
    try {
      setLoading(true);
      setError(null);
      const res = await procurementAPI.listRFQs(params);
      setRfqs(res.data || []);
      setRfqTotal(totalOf(res, res.data));
      return res.data || [];
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkOrders = useCallback(async (params) => {
    try {
      setLoading(true);
      setError(null);
      const res = await procurementAPI.listWorkOrders(params);
      setWorkOrders(res.data || []);
      setWoTotal(totalOf(res, res.data));
      return res.data || [];
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssignments = useCallback(async (params) => {
    const res = await procurementAPI.listVendorAssignments(params);
    setAssignments(res.data || []);
    return res.data || [];
  }, []);

  return (
    <ProcurementContext.Provider
      value={{
        rfqs,
        workOrders,
        assignments,
        rfqTotal,
        woTotal,
        loading,
        error,
        loadRFQs,
        loadWorkOrders,
        loadAssignments,
      }}
    >
      {children}
    </ProcurementContext.Provider>
  );
};

export const useProcurement = () => useContext(ProcurementContext);
