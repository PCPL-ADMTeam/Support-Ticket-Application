import api from "./axios";

export const categoriesApi = {
  list: () => api.get("/categories"),
  create: (payload) => api.post("/categories", payload),
  update: (id, payload) => api.patch(`/categories/${id}`, payload),
  remove: (id) => api.delete(`/categories/${id}`),
};

export const prioritiesApi = {
  list: () => api.get("/priorities"),
  create: (payload) => api.post("/priorities", payload),
  update: (id, payload) => api.patch(`/priorities/${id}`, payload),
  upsertSla: (id, payload) => api.put(`/priorities/${id}/sla`, payload),
};
