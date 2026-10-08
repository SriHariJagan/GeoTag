import api from "./axios";

/* V3 project expenditures (legacy /expenditures/* deprecated) */

export const getProjectExpenditures = async (projectId, params) => {
  const { data } = await api.get("/project-expenditures/", {
    params: { project_id: projectId, limit: 100, ...(params || {}) },
  });
  return data;
};

export const listExpenditures = async (params) => {
  const res = await api.get("/project-expenditures/", { params });
  const total = Number(res.headers?.["x-total-count"]);
  return {
    rows: res.data || [],
    total: Number.isFinite(total) && total >= 0 ? total : (res.data || []).length,
  };
};

export const createExpenditure = async (payload) => {
  const { data } = await api.post("/project-expenditures/", payload);
  return data;
};

export const updateExpenditure = async (id, payload) => {
  const { data } = await api.patch(`/project-expenditures/${id}`, payload);
  return data;
};

// DELETE (SUPERADMIN → any, ADMIN → non-approved only; backend enforced)
export const deleteExpenditure = async (id) => {
  const { data } = await api.delete(`/project-expenditures/${id}`);
  return data;
};

export const submitExpenditure = async (id) => {
  const { data } = await api.post(`/project-expenditures/${id}/submit`);
  return data;
};

export const approveExpenditure = async (id, reason) => {
  const { data } = await api.post(`/project-expenditures/${id}/approve`, null, {
    params: { reason },
  });
  return data;
};

export const rejectExpenditure = async (id, reason) => {
  const { data } = await api.post(`/project-expenditures/${id}/reject`, null, {
    params: { reason },
  });
  return data;
};

export const getProjectTotals = async (projectId) => {
  const { data } = await api.get(
    `/project-expenditures/project/${projectId}/totals`
  );
  return data;
};

export const EXPENSE_CATEGORIES = [
  "MATERIAL",
  "LABOR",
  "EQUIPMENT",
  "FUEL",
  "TRANSPORT",
  "VENDOR",
  "SUBCONTRACT",
  "SITE_EXPENSE",
  "MISCELLANEOUS",
];
