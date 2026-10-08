// auth.api.js — authentication + user admin API (centralized).
import api from "./axios";

export const login = (data) => api.post("/users/login", data);
export const authLogin = (data) => api.post("/auth/login", data);
export const authLogout = () => api.post("/auth/logout");

// Forgot password: OTP first, then a one-time reset link.
export const forgotPassword = (email) => api.post("/auth/forgot-password", { email });
export const verifyPasswordOtp = (email, otp) => api.post("/auth/verify-otp", { email, otp });
export const validateResetToken = (token) =>
  api.get("/auth/reset-password/validate", { params: { token } });
export const resetPassword = (token, password) =>
  api.post("/auth/reset-password", { token, password });

export const inviteUser = (data) => api.post("/users/invite", data);

export const acceptInvite = (data) => api.post("/users/invitations/accept", data);
export const acceptInviteLegacy = (data) => api.post("/users/accept-invite", data);
export const validateInvitation = (token) =>
  api.get("/users/invitations/validate", { params: { token } });

export const getUsersAdmin = (params) => api.get("/users/admin", { params });
export const getUserDetail = (id) => api.get(`/users/${id}`);
export const createUser = (data) => api.post("/users/", data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);

export const inviteExistingUser = (id) => api.post(`/users/${id}/invite`);
export const resendInvite = (id) => api.post(`/users/${id}/resend-invite`);
export const revokeInvite = (id) => api.post(`/users/${id}/revoke-invite`);

export const changeRole = (id, role) => api.patch(`/users/${id}/role`, { role });
export const changeStatus = (id, account_status, reason) =>
  api.patch(`/users/${id}/status`, { account_status, reason });

export const getEligibility = (id) => api.get(`/users/${id}/eligibility`);
export const getUserAudit = (id, params) => api.get(`/users/${id}/audit`, { params });
export const getUserActivity = (id, params) => api.get(`/users/${id}/activity`, { params });
export const getAuditLog = (params) => api.get("/users/audit-log", { params });

// Profile sub-resources
export const listExperience = (id) => api.get(`/users/${id}/experience`);
export const addExperience = (id, data) => api.post(`/users/${id}/experience`, data);
export const updateExperience = (id, expId, data) =>
  api.put(`/users/${id}/experience/${expId}`, data);
export const deleteExperience = (id, expId) =>
  api.delete(`/users/${id}/experience/${expId}`);

export const listEducation = (id) => api.get(`/users/${id}/education`);
export const addEducation = (id, data) => api.post(`/users/${id}/education`, data);
export const deleteEducation = (id, eduId) => api.delete(`/users/${id}/education/${eduId}`);

export const listSkills = (id) => api.get(`/users/${id}/skills`);
export const addSkill = (id, data) => api.post(`/users/${id}/skills`, data);
export const deleteSkill = (id, skillId) => api.delete(`/users/${id}/skills/${skillId}`);

export const listCertifications = (id) => api.get(`/users/${id}/certifications`);
export const addCertification = (id, data) => api.post(`/users/${id}/certifications`, data);
export const deleteCertification = (id, certId) =>
  api.delete(`/users/${id}/certifications/${certId}`);

export const listLicenses = (id) => api.get(`/users/${id}/licenses`);
export const addLicense = (id, data) => api.post(`/users/${id}/licenses`, data);
export const deleteLicense = (id, licId) => api.delete(`/users/${id}/licenses/${licId}`);

export const listDocuments = (id) => api.get(`/users/${id}/documents`);
export const addDocumentMeta = (id, data) => api.post(`/users/${id}/documents`, data);

export const getSupervisorProfile = (id) => api.get(`/users/${id}/supervisor-profile`);
export const upsertSupervisorProfile = (id, data) =>
  api.put(`/users/${id}/supervisor-profile`, data);

// Project assignments (foundation)
export const createAssignment = (data) => api.post("/users/assignments", data);
export const listUserAssignments = (id) => api.get(`/users/${id}/assignments`);
export const endAssignment = (assignmentId, reason) =>
  api.post(`/users/assignments/${assignmentId}/end`, null, { params: { reason } });
export const listProjectAssignments = (projectId) =>
  api.get(`/projects/${projectId}/assignments`);
