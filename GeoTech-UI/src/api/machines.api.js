import api from "./axios";

export const getMachines = (params) => api.get("/machines/", { params });

export const createMachine = (data) => api.post("/machines", data);

export const updateMachine = (id, data) =>
  api.put(`/machines/${id}`, data);

export const deleteMachine = (id) =>
  api.delete(`/machines/${id}`);

export const assignMachineToProject = (machineId, projectId) =>
  api.put(`/machines/${machineId}/assign/${projectId}`);
