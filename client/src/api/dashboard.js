import api from "./axios";

export const dashboardApi = {
  getStats: (params) => api.get("/dashboard/stats", { params }),
};
