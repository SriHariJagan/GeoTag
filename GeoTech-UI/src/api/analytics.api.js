import api from "./axios";

export const delayRisk = (projectId) =>
  api.get(`/analytics/projects/${projectId}/delay-risk`);
export const costRisk = (projectId) =>
  api.get(`/analytics/projects/${projectId}/cost-risk`);
export const dashboardInsights = () => api.get("/analytics/dashboard/insights");
