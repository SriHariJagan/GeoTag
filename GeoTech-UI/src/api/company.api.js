import api from "./axios";

export const getCompanySettings = () => api.get("/company-settings");
export const updateCompanySettings = (data) => api.put("/company-settings", data);
export const uploadCompanyLogo = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/company-settings/logo", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const companyLogoUrl = () =>
  `${import.meta.env.VITE_API_URL}/company-settings/logo`;
