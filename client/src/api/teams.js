import api from "./axios";

export const teamsApi = {
  list: () => api.get("/teams"),
  getById: (id) => api.get(`/teams/${id}`),
  create: (payload) => api.post("/teams", payload),
  update: (id, payload) => api.patch(`/teams/${id}`, payload),
  remove: (id) => api.delete(`/teams/${id}`),
};
