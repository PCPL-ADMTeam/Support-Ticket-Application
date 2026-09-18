import api from "./axios";

export const usersApi = {
  list: (params) => api.get("/users", { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (payload) => api.post("/users", payload),
  update: (id, payload) => api.patch(`/users/${id}`, payload),
  deactivate: (id) => api.delete(`/users/${id}`),
  updateOwnProfile: (payload) => api.patch("/users/me/profile", payload),
  assignableAgents: () => api.get("/users/assignable-agents"),
};
