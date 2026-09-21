import api from "./axios";

export const emailTemplatesApi = {
  list: () => api.get("/email-templates"),
  getById: (id) => api.get(`/email-templates/${id}`),
  update: (id, payload) => api.patch(`/email-templates/${id}`, payload),
  placeholders: () => api.get("/email-templates/placeholders"),
};
