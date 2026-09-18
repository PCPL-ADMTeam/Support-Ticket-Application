const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { parsePagination, buildPagedResult } = require("../utils/pagination");
const { recordAudit } = require("../utils/audit");

const userListSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  avatarUrl: true,
  createdAt: true,
  role: { select: { id: true, name: true, label: true } },
  teamMemberships: { select: { team: { select: { id: true, name: true } } } },
};

async function listUsers(query) {
  const { page, limit, skip, take } = parsePagination(query);
  const where = {
    ...(query.role ? { role: { name: query.role } } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive === "true" } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: userListSelect, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.user.count({ where }),
  ]);

  return buildPagedResult(rows, total, { page, limit });
}

async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: userListSelect });
  if (!user) throw new ApiError(404, "User not found");
  return user;
}

async function createUser(actorId, payload) {
  const { name, email, password, roleName, teamIds = [] } = payload;

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw new ApiError(400, `Unknown role: ${roleName}`);

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new ApiError(409, "A user with this email already exists");

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      roleId: role.id,
      teamMemberships: teamIds.length
        ? { create: teamIds.map((teamId) => ({ team: { connect: { id: teamId } } })) }
        : undefined,
    },
    select: userListSelect,
  });

  await recordAudit({ userId: actorId, action: "USER_CREATED", entityType: "User", entityId: user.id, newValues: { name, email, roleName } });
  return user;
}

async function updateUser(actorId, id, payload) {
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "User not found");

  const data = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;
  if (payload.roleName !== undefined) {
    const role = await prisma.role.findUnique({ where: { name: payload.roleName } });
    if (!role) throw new ApiError(400, `Unknown role: ${payload.roleName}`);
    data.roleId = role.id;
  }

  if (payload.teamIds !== undefined) {
    await prisma.teamMember.deleteMany({ where: { userId: id } });
    if (payload.teamIds.length) {
      await prisma.teamMember.createMany({
        data: payload.teamIds.map((teamId) => ({ userId: id, teamId })),
        skipDuplicates: true,
      });
    }
  }

  const user = await prisma.user.update({ where: { id }, data, select: userListSelect });

  await recordAudit({
    userId: actorId,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: id,
    oldValues: { name: before.name, isActive: before.isActive },
    newValues: payload,
  });

  return user;
}

// Deactivation instead of hard delete — preserves referential integrity for
// tickets/comments/history a user is linked to.
async function deactivateUser(actorId, id) {
  if (actorId === id) throw new ApiError(400, "You cannot deactivate your own account");
  const user = await prisma.user.update({ where: { id }, data: { isActive: false }, select: userListSelect });
  await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit({ userId: actorId, action: "USER_DEACTIVATED", entityType: "User", entityId: id });
  return user;
}

async function updateOwnProfile(userId, payload) {
  const data = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.avatarUrl !== undefined) data.avatarUrl = payload.avatarUrl;
  return prisma.user.update({ where: { id: userId }, data, select: userListSelect });
}

// Lightweight list for populating "assignee" dropdowns (agents/admins only).
async function listAssignableAgents() {
  return prisma.user.findMany({
    where: { isActive: true, role: { name: { in: ["AGENT", "ADMIN"] } } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deactivateUser,
  updateOwnProfile,
  listAssignableAgents,
};
