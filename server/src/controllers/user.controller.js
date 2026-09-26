const userService = require("../services/user.service");
const entraService = require("../services/entra.service");
const userDepartmentAccessService = require("../services/userDepartmentAccess.service");
const ApiError = require("../utils/ApiError");

async function list(req, res) {
  res.json({ success: true, ...(await userService.listUsers(req.query)) });
}

async function getById(req, res) {
  res.json({ success: true, data: await userService.getUserById(req.params.id) });
}

async function create(req, res) {
  const user = await userService.createUser(req.user.id, req.body);
  res.status(201).json({ success: true, data: user });
}

async function update(req, res) {
  const user = await userService.updateUser(req.user.id, req.params.id, req.body);
  res.json({ success: true, data: user });
}

async function deactivate(req, res) {
  const user = await userService.deactivateUser(req.user.id, req.params.id);
  res.json({ success: true, data: user });
}

// Real hard delete — distinct from `deactivate` above, which is what the
// existing DELETE /:id route actually does (soft-delete via isActive).
async function remove(req, res) {
  await userService.deleteUser(req.user.id, req.params.id);
  res.json({ success: true, message: "User deleted" });
}

async function updateProfile(req, res) {
  const user = await userService.updateOwnProfile(req.user.id, req.body);
  res.json({ success: true, data: user });
}

async function assignableEmployees(req, res) {
  res.json({ success: true, data: await userService.listAssignableEmployees(req.user, req.query) });
}

// Custom CC search (any authenticated role) — see
// user.service.js#searchActiveEmployees.
const SEARCHABLE_ROLES = ["ADMIN", "MANAGER", "TEAMLEAD", "EMPLOYEE"];

async function searchEmployees(req, res) {
  const role = SEARCHABLE_ROLES.includes(req.query.role) ? req.query.role : undefined;
  res.json({ success: true, data: await userService.searchActiveEmployees(req.query.query, { role }) });
}

// The caller's own accessible departments — a non-management role (or a
// MANAGER/TEAMLEAD with no grants yet) simply gets an empty array, not an
// error, since this is read as part of normal Dashboard/Tickets page load.
async function myDepartmentAccess(req, res) {
  const roleName = req.user.role?.name;
  const departments = (roleName === "MANAGER" || roleName === "TEAMLEAD")
    ? await userDepartmentAccessService.getUserDepartments(req.user.id)
    : [];
  res.json({ success: true, data: departments });
}

// Admin-only: a specific Manager/Team Lead's current department access, to
// pre-populate the Users page "Department Access" dialog before saving a
// replacement set.
async function getDepartmentAccess(req, res) {
  const departments = await userDepartmentAccessService.getUserDepartments(req.params.id);
  res.json({ success: true, data: departments });
}

// Role-aware: enforces "exactly one department" for a TEAMLEAD and allows
// any number for a MANAGER — see
// userDepartmentAccessService.replaceUserDepartmentAccess, which reads the
// TARGET user's actual role from the database rather than trusting which UI
// control the frontend happened to submit.
async function replaceDepartmentAccess(req, res) {
  const departments = await userDepartmentAccessService.replaceUserDepartmentAccess(
    req.user.id,
    req.params.id,
    Array.isArray(req.body.departmentIds) ? req.body.departmentIds : []
  );
  res.json({ success: true, data: departments });
}

// ADMIN-only CloudReady/Entra corporate directory lookup, for mapping a
// Helpdesk user to their Entra account (User.entraObjectId). Never returns
// a Graph access token — only the normalized user list.
async function entraDirectory(_req, res) {
  if (!entraService.isConfigured()) {
    throw new ApiError(503, "CloudReady Entra ID is not configured on this server (missing CLOUDREADY_* environment variables).");
  }
  const users = await entraService.listUsers();
  res.json({ success: true, data: users });
}

module.exports = {
  list,
  getById,
  create,
  update,
  deactivate,
  remove,
  updateProfile,
  assignableEmployees,
  searchEmployees,
  myDepartmentAccess,
  getDepartmentAccess,
  replaceDepartmentAccess,
  entraDirectory,
};
