import api from "./axios";

export const ticketsApi = {
  list: (params) => api.get("/tickets", { params }),
  getById: (id) => api.get(`/tickets/${id}`),
  create: (payload) =>
    api.post("/tickets", payload, payload instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined),
  update: (id, payload) => api.patch(`/tickets/${id}`, payload),
  transferDepartment: (id, payload) => api.patch(`/tickets/${id}/transfer-department`, payload),
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
  // Backend-streamed (see ticket.service.js#streamAttachment) — the
  // endpoint requires the same Bearer auth as every other API call, which
  // a plain <img src>/<a href> can't attach, so callers fetch the bytes as
  // a Blob via this (through the same authenticated axios instance) and
  // build an object URL from the response instead.
  downloadAttachment: (ticketId, attachmentId) =>
    api.get(`/tickets/${ticketId}/attachments/${attachmentId}/download`, { responseType: "blob" }),
  deleteAttachment: (ticketId, attachmentId) => api.delete(`/tickets/${ticketId}/attachments/${attachmentId}`),
};
