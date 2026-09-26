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
  // `extra` supports `{ role: "MANAGER" | "TEAMLEAD" | "EMPLOYEE" | "ADMIN" }`
  // to scope results server-side — see SearchableUserSelector, the one
  // shared component every role-scoped user picker (Add Manager/Add Team
  // Lead/Add Employee) goes through, plus Custom CC's own unscoped use.
  search: (query, extra = {}) => api.get("/users/search", { params: { query, ...extra } }),
  myDepartmentAccess: () => api.get("/users/me/department-access"),
  getDepartmentAccess: (id) => api.get(`/users/${id}/department-access`),
  replaceDepartmentAccess: (id, departmentIds) => api.put(`/users/${id}/department-access`, { departmentIds }),
};
