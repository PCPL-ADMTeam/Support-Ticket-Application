import api from "./axios";

export const auditLogsApi = {
  list: (params) => api.get("/audit-logs", { params }),
};
