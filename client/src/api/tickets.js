import api from "./axios";

export const ticketsApi = {
  list: (params) => api.get("/tickets", { params }),
  getById: (id) => api.get(`/tickets/${id}`),
  create: (payload) => api.post("/tickets", payload),
  update: (id, payload) => api.patch(`/tickets/${id}`, payload),
  addComment: (id, payload) => api.post(`/tickets/${id}/comments`, payload),
  bulkUpdate: (payload) => api.post("/tickets/bulk", payload),
  uploadAttachment: (id, file, commentId) => {
    const formData = new FormData();
    formData.append("file", file);
    if (commentId) formData.append("commentId", commentId);
    return api.post(`/tickets/${id}/attachments`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
