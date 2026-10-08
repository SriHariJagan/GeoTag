import api from "./axios";

export const getVendors = (params) => api.get("/vendors/", { params });
export const getMyVendorOrgs = () => api.get("/vendors/me/organizations");
export const getVendorById = (id) => api.get(`/vendors/${id}`);
export const createVendor = (data) => api.post("/vendors/", data);
export const updateVendor = (id, data) => api.put(`/vendors/${id}`, data);
export const deleteVendor = (id) => api.delete(`/vendors/${id}`);
export const changeVendorStatus = (id, status, reason) =>
  api.patch(`/vendors/${id}/status`, { status, reason });
export const getVendorAudit = (id) => api.get(`/vendors/${id}/audit`);
export const linkVendorUser = (id, data) => api.post(`/vendors/${id}/users`, data);
export const listVendorUsers = (id) => api.get(`/vendors/${id}/users`);

const child = (name) => ({
  [`listVendor${name}`]: (id) => api.get(`/vendors/${id}/${name.toLowerCase()}`),
  [`addVendor${name}`]: (id, data) =>
    api.post(`/vendors/${id}/${name.toLowerCase()}`, data),
  [`deleteVendor${name}`]: (id, recId) =>
    api.delete(`/vendors/${id}/${name.toLowerCase()}/${recId}`),
});

export const {
  listVendorContacts,
  addVendorContacts,
  deleteVendorContacts,
} = child("Contacts");
export const {
  listVendorExperiences,
  addVendorExperiences,
  deleteVendorExperiences,
} = child("Experiences");
export const {
  listVendorReferences,
  addVendorReferences,
  deleteVendorReferences,
} = child("References");
export const {
  listVendorCapabilities,
  addVendorCapabilities,
  deleteVendorCapabilities,
} = child("Capabilities");
export const {
  listVendorEquipment,
  addVendorEquipment,
  deleteVendorEquipment,
} = child("Equipment");
export const {
  listVendorCertifications,
  addVendorCertifications,
  deleteVendorCertifications,
} = child("Certifications");
export const {
  listVendorLicenses,
  addVendorLicenses,
  deleteVendorLicenses,
} = child("Licenses");
export const {
  listVendorDocuments,
  addVendorDocuments,
  deleteVendorDocuments,
} = child("Documents");
