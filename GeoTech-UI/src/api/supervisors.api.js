import api from "./axios";

export const getSupervisors = (params) =>
  api.get("/supervisors/", { params });

/** Signed-in supervisor's own attendance + machinery cost (supervisor role only). */
export const getMyAttendance = () =>
  api.get("/supervisors/my-attendance");