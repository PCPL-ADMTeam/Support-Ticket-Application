const teamService = require("../services/team.service");

async function list(_req, res) {
  res.json({ success: true, data: await teamService.listTeams() });
}

async function getById(req, res) {
  res.json({ success: true, data: await teamService.getTeamById(req.params.id) });
}

async function create(req, res) {
  const team = await teamService.createTeam(req.user.id, req.body);
  res.status(201).json({ success: true, data: team });
}

async function update(req, res) {
  const team = await teamService.updateTeam(req.user.id, req.params.id, req.body);
  res.json({ success: true, data: team });
}

async function remove(req, res) {
  await teamService.deleteTeam(req.user.id, req.params.id);
  res.json({ success: true, message: "Team deleted" });
}

module.exports = { list, getById, create, update, remove };
