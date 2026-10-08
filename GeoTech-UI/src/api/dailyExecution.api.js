import api from "./axios";

/* ===============================
   DAILY EXECUTION REPORTS API
   =============================== */

// CREATE
export const createDailyReport = (data) => api.post("/daily-execution", data);
  
  

// GET ALL (SUPERADMIN → all, SUPERVISOR → assigned only)
export const getAllDailyReports = ({
  page = 1,
  limit = 20,
  projectId,
  project_id,
  reportDate,
  report_date,
  vendorId,
  vendor_id,
} = {}) => {
  const params = { page, limit };

  if (projectId || project_id) params.project_id = projectId || project_id;
  if (reportDate || report_date) params.report_date = reportDate || report_date;
  if (vendorId || vendor_id) params.vendor_id = vendorId || vendor_id;

  return api.get("/daily-execution/", { params });
};

// GET PROJECT REPORTS
export const getProjectReports = (projectId) =>
  api.get(`/daily-execution/project/${projectId}`);

// GET BY ID
export const getDailyReportById = (id) =>
  api.get(`/daily-execution/${id}`);



// UPDATE
export const updateDailyReport = (id, data) =>
  api.put(`/daily-execution/${id}`, data);

// SUBMIT DRAFT
export const submitDailyReport = (id) =>
  api.post(`/daily-execution/${id}/submit`);

// ADD CHILD ROWS
export const addDERManpower = (id, data) =>
  api.post(`/daily-execution/${id}/manpower`, data);
export const addDEREquipment = (id, data) =>
  api.post(`/daily-execution/${id}/equipment`, data);
export const addDERVendorActivity = (id, data) =>
  api.post(`/daily-execution/${id}/vendor-activity`, data);

// DELETE (SUPERADMIN only OR creator – backend enforced)
export const deleteDailyReport = (id) =>
  api.delete(`/daily-execution/${id}`);

// PENDING REPORTS (SUPERADMIN)
export const getPendingReports = () =>
  api.get("/daily-execution/pending");

// EDIT REQUESTS — supervisor asks, admin approves/rejects
export const requestDEREdit = (reportId, message) =>
  api.post(`/daily-execution/${reportId}/edit-requests`, { message });
export const listDEREditRequests = (params) =>
  api.get("/daily-execution/edit-requests", { params });
export const reviewDEREdit = (requestId, { approve, note }) =>
  api.post(`/daily-execution/edit-requests/${requestId}/review`, {
    approve,
    note: note || null,
  });
