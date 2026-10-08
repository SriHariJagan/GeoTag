import api from "./axios";

// -------------------- Projects APIs --------------------

// Get all projects for current user (superadmin or supervisor)
export const getMyProjects = () => api.get("/projects/my-projects");

// Get a project by ID
export const getProjectById = (id) => api.get(`/projects/${id}/`);

// Create a new project
// Data can include supervisor_ids & machine_ids
export const createProject = (data) => api.post("/projects/", data);

// Update an existing project by ID
export const updateProject = (id, data) => api.put(`/projects/${id}`, data);

// Delete a project by ID
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// Note: Assign supervisor & machine is handled in updateProject
// So we remove the separate endpoints:

// Project lifecycle + assignments (V3)
export const changeProjectStatus = (id, status, reason) =>
  api.patch(`/projects/${id}/status`, { status, reason });
export const listProjectAssignments = (projectId) =>
  api.get(`/projects/${projectId}/assignments`);
export const getProjectAudit = (projectId) =>
  api.get(`/projects/${projectId}/audit`);

// Project search autocomplete (V4: typing GEO-2026 shows existing projects)
export const searchProjects = (q, limit = 20) =>
  api.get("/projects/search", { params: { q, limit } });
export const getProjectDetails = (id) => api.get(`/projects/details/${id}`);
// Enforced team assignment (backend validates eligibility/acceptance/availability)
export const assignSupervisor = (projectId, supervisorId) =>
  api.post(`/projects/${projectId}/supervisors`, null, { params: { supervisor_id: supervisorId } });
export const assignVendor = (projectId, vendorId) =>
  api.post(`/projects/${projectId}/vendors`, null, { params: { vendor_id: vendorId } });
export const assignMachine = (projectId, machineId, force = false) =>
  api.post(`/projects/${projectId}/machines`, null, { params: { machine_id: machineId, force } });
// Unified audit timeline (project + WO + RFQ events)
export const getProjectTimeline = (projectId) =>
  api.get(`/projects/${projectId}/timeline`);
// Server-computed cost ledger: machinery/day + extras + weekly + totals
export const getProjectCostLedger = (projectId) =>
  api.get(`/projects/${projectId}/cost-ledger`);
// Server-computed supervisor attendance + machinery cost for a project
export const getProjectAttendance = (projectId) =>
  api.get(`/projects/${projectId}/supervisor-attendance`);
