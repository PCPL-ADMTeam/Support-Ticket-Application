const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");

const teamSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  members: { select: { user: { select: { id: true, name: true, email: true } } } },
  _count: { select: { tickets: true } },
};

async function listTeams() {
  return prisma.team.findMany({ select: teamSelect, orderBy: { name: "asc" } });
}

async function getTeamById(id) {
  const team = await prisma.team.findUnique({ where: { id }, select: teamSelect });
  if (!team) throw new ApiError(404, "Team not found");
  return team;
}

async function createTeam(actorId, { name, description, memberIds = [] }) {
  const team = await prisma.team.create({
    data: {
      name,
      description,
      members: memberIds.length ? { create: memberIds.map((userId) => ({ userId })) } : undefined,
    },
    select: teamSelect,
  });
  await recordAudit({ userId: actorId, action: "TEAM_CREATED", entityType: "Team", entityId: team.id, newValues: { name } });
  return team;
}

async function updateTeam(actorId, id, { name, description, memberIds }) {
  const data = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;

  if (memberIds !== undefined) {
    await prisma.teamMember.deleteMany({ where: { teamId: id } });
    if (memberIds.length) {
      await prisma.teamMember.createMany({
        data: memberIds.map((userId) => ({ teamId: id, userId })),
        skipDuplicates: true,
      });
    }
  }

  const team = await prisma.team.update({ where: { id }, data, select: teamSelect });
  await recordAudit({ userId: actorId, action: "TEAM_UPDATED", entityType: "Team", entityId: id, newValues: { name, description } });
  return team;
}

async function deleteTeam(actorId, id) {
  await prisma.team.delete({ where: { id } });
  await recordAudit({ userId: actorId, action: "TEAM_DELETED", entityType: "Team", entityId: id });
}

module.exports = { listTeams, getTeamById, createTeam, updateTeam, deleteTeam };
