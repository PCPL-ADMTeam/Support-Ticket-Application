import api from "./axios";

export const usersApi = {
  list: (params) => api.get("/users", { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (payload) => api.post("/users", payload),
  update: (id, payload) => api.patch(`/users/${id}`, payload),
  deactivate: (id) => api.delete(`/users/${id}`),
  activate: (id) => api.patch(`/users/${id}`, { isActive: true }),
  remove: (id) => api.delete(`/users/${id}/permanent`),
  updateOwnProfile: (payload) => api.patch("/users/me/profile", payload),
  assignableAgents: (params) => api.get("/users/assignable-agents", { params }),
};
