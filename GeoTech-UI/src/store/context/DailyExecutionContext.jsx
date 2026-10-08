import { createContext, useContext, useState, useCallback } from "react";
import {
  getAllDailyReports,
  createDailyReport,
  updateDailyReport,
  deleteDailyReport,
  submitDailyReport,
} from "../../api/dailyExecution.api";

export const DERContext = createContext();

export const DERProvider = ({ children }) => {
  const [dailyReports, setDailyReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  /* ---------------- LOAD ---------------- */
  const loadReports = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const res = await getAllDailyReports(filters);
      setDailyReports(res.data || []);
      const t = Number(res.headers?.["x-total-count"]);
      setTotal(Number.isFinite(t) && t >= 0 ? t : (res.data || []).length);
    } catch (err) {
      console.error("Failed to load reports", err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---------------- CREATE ---------------- */
  const createReport = async (data) => {
    console.log("Creating report with data:", data);
    await createDailyReport(data);
    await loadReports();
  };

  /* ---------------- UPDATE ---------------- */
  const updateReportById = async (id, data) => {
    await updateDailyReport(id, data);
    await loadReports();
  };

  /* ---------------- DELETE ---------------- */
  const deleteReportById = async (id) => {
    await deleteDailyReport(id);
    await loadReports();
  };

  /* ---------------- SUBMIT DRAFT ---------------- */
  const submitReportById = async (id) => {
    await submitDailyReport(id);
    await loadReports();
  };

  return (
    <DERContext.Provider
      value={{
        dailyReports,
        total,
        loading,
        loadReports,
        createReport,
        updateReport: updateReportById,
        deleteReport: deleteReportById,
        submitReport: submitReportById,
      }}
    >
      {children}
    </DERContext.Provider>
  );
};

export const useDER = () => useContext(DERContext);
