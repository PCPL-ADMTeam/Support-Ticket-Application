import api from "./axios";

export const departmentsApi = {
  list: () => api.get("/departments"),
  create: (payload) => api.post("/departments", payload),
  update: (id, payload) => api.patch(`/departments/${id}`, payload),
  assignManager: (id, managerId) => api.patch(`/departments/${id}/manager`, { managerId }),
  remove: (id) => api.delete(`/departments/${id}`),
};

export const issuesApi = {
  create: (payload) => api.post("/issues", payload),
  update: (id, payload) => api.patch(`/issues/${id}`, payload),
  remove: (id) => api.delete(`/issues/${id}`),
};
