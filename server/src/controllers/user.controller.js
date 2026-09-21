const userService = require("../services/user.service");

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

async function updateProfile(req, res) {
  const user = await userService.updateOwnProfile(req.user.id, req.body);
  res.json({ success: true, data: user });
}

async function assignableUsers(req, res) {
  res.json({ success: true, data: await userService.listAssignableUsers(req.user) });
}

module.exports = { list, getById, create, update, deactivate, updateProfile, assignableUsers };
