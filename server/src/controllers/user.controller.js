const userService = require("../services/user.service");
const entraService = require("../services/entra.service");
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

// ADMIN-only CloudReady/Entra corporate directory lookup, for mapping a
// Helpdesk USER to their Entra account (User.entraObjectId). Never returns
// a Graph access token — only the normalized user list.
async function entraDirectory(_req, res) {
  if (!entraService.isConfigured()) {
    throw new ApiError(503, "CloudReady Entra ID is not configured on this server (missing CLOUDREADY_* environment variables).");
  }
  const users = await entraService.listUsers();
  res.json({ success: true, data: users });
}

module.exports = { list, getById, create, update, deactivate, remove, updateProfile, assignableEmployees, entraDirectory };
