import api from "./axios";

export const departmentsApi = {
  list: () => api.get("/departments"),
  create: (payload) => api.post("/departments", payload),
  update: (id, payload) => api.patch(`/departments/${id}`, payload),
  remove: (id) => api.delete(`/departments/${id}`),
  addManager: (id, managerId) => api.post(`/departments/${id}/managers`, { managerId }),
  removeManager: (id, managerId) => api.delete(`/departments/${id}/managers/${managerId}`),
  setTeamLead: (id, teamLeadId) => api.post(`/departments/${id}/team-lead`, { teamLeadId }),
  removeTeamLead: (id, teamLeadId) => api.delete(`/departments/${id}/team-lead/${teamLeadId}`),
};

export const issuesApi = {
  create: (payload) => api.post("/issues", payload),
  update: (id, payload) => api.patch(`/issues/${id}`, payload),
  remove: (id) => api.delete(`/issues/${id}`),
};
