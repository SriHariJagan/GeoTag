// src/context/ExpendituresContext.jsx — V3 project expenditures (real API, no mocks)

import {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import * as expenditureAPI from "../../api/expenditures.api";

const ExpendituresContext = createContext();

export const ExpendituresProvider = ({ children }) => {
  const [expenditures, setExpenditures] = useState([]);
  const [totals, setTotals] = useState(null);
  const [listTotal, setListTotal] = useState(0);

  const [loadingExpenditures, setLoadingExpenditures] = useState(false);
  const [errorExpenditures, setErrorExpenditures] = useState(null);

  const loadExpenditures = useCallback(async (params) => {
    try {
      setLoadingExpenditures(true);
      setErrorExpenditures(null);
      const { rows, total } = await expenditureAPI.listExpenditures(params);
      setExpenditures(rows);
      setListTotal(total);
      return rows;
    } catch (err) {
      setErrorExpenditures(err);
      throw err;
    } finally {
      setLoadingExpenditures(false);
    }
  }, []);

  const loadProjectExpenditures = useCallback(async (projectId, params) => {
    const res = await expenditureAPI.getProjectExpenditures(projectId, params);
    const rows = res || [];
    setExpenditures(rows);
    return rows;
  }, []);

  const loadTotals = useCallback(async (projectId) => {
    const data = await expenditureAPI.getProjectTotals(projectId);
    setTotals(data || null);
    return data;
  }, []);

  const addExpenditure = useCallback(async (payload) => {
    const data = await expenditureAPI.createExpenditure(payload);
    return data;
  }, []);

  const editExpenditure = useCallback(async (id, payload) => {
    const data = await expenditureAPI.updateExpenditure(id, payload);
    return data;
  }, []);

  const removeExpenditure = useCallback(async (id) => {
    const data = await expenditureAPI.deleteExpenditure(id);
    setExpenditures((prev) => prev.filter((x) => x.id !== id));
    return data;
  }, []);

  const submitOne = useCallback(async (id) => {
    const data = await expenditureAPI.submitExpenditure(id);
    return data;
  }, []);

  const approveOne = useCallback(async (id, reason) => {
    const data = await expenditureAPI.approveExpenditure(id, reason);
    return data;
  }, []);

  const rejectOne = useCallback(async (id, reason) => {
    const data = await expenditureAPI.rejectExpenditure(id, reason);
    return data;
  }, []);

  return (
    <ExpendituresContext.Provider
      value={{
        expenditures,
        totals,
        listTotal,
        loadingExpenditures,
        errorExpenditures,
        loadExpenditures,
        loadProjectExpenditures,
        loadTotals,
        addExpenditure,
        editExpenditure,
        removeExpenditure,
        submitExpenditure: submitOne,
        approveExpenditure: approveOne,
        rejectExpenditure: rejectOne,
      }}
    >
      {children}
    </ExpendituresContext.Provider>
  );
};

export const useExpenditures = () =>
  useContext(ExpendituresContext);
