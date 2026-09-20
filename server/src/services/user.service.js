const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { parsePagination, buildPagedResult } = require("../utils/pagination");
const { recordAudit } = require("../utils/audit");

// AGENT is always the department manager and USER is never a manager, so
// isManager is fully derived from the role rather than set independently —
// it can never drift out of sync with the role-based business rule.
function deriveIsManager(roleName) {
  return roleName === "AGENT";
}

const userListSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  avatarUrl: true,
  createdAt: true,
  departmentId: true,
  isManager: true,
  entraObjectId: true,
  role: { select: { id: true, name: true, label: true } },
  department: { select: { id: true, name: true } },
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

// entraObjectId is @unique in the DB too, but that raw constraint error
// isn't friendly — pre-check so a duplicate mapping attempt gets a clear
// 409 instead of a Prisma P2002 leaking through.
async function assertEntraObjectIdAvailable(entraObjectId, excludeUserId) {
  if (!entraObjectId) return;
  const existing = await prisma.user.findUnique({ where: { entraObjectId } });
  if (existing && existing.id !== excludeUserId) {
    throw new ApiError(409, "This CloudReady account is already linked to another Helpdesk user.");
  }
}

// A department can only ever have ONE active AGENT manager — AGENT IS the
// department manager under this role model (deriveIsManager), so "manager
// of X" literally means "the active AGENT whose departmentId is X". If a
// user is about to become that, any OTHER active AGENT already sitting in
// the same department must be displaced (departmentId cleared) in the same
// transaction — otherwise a "change manager" operation silently leaves two
// active managers for one department (the previous one never explicitly
// demoted), which is exactly the data corruption this guards against.
async function displaceOtherActiveManagers(tx, departmentId, excludeUserId) {
  await tx.user.updateMany({
    where: { departmentId, isManager: true, isActive: true, id: { not: excludeUserId } },
    data: { departmentId: null },
  });
}

async function createUser(actorId, payload) {
  const { name, email, password, roleName, teamIds = [], departmentId, entraObjectId } = payload;

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw new ApiError(400, `Unknown role: ${roleName}`);

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new ApiError(409, "A user with this email already exists");
  await assertEntraObjectIdAvailable(entraObjectId, null);

  const passwordHash = await bcrypt.hash(password, 12);
  const finalDepartmentId = departmentId || null;
  const becomesActiveManager = deriveIsManager(role.name) && Boolean(finalDepartmentId);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        roleId: role.id,
        departmentId: finalDepartmentId,
        isManager: deriveIsManager(role.name),
        entraObjectId: entraObjectId || null,
        teamMemberships: teamIds.length
          ? { create: teamIds.map((teamId) => ({ team: { connect: { id: teamId } } })) }
          : undefined,
      },
      select: userListSelect,
    });

    if (becomesActiveManager) {
      await displaceOtherActiveManagers(tx, finalDepartmentId, created.id);
    }

    return created;
  });

  await recordAudit({ userId: actorId, action: "USER_CREATED", entityType: "User", entityId: user.id, newValues: { name, email, roleName } });
  return user;
}

async function updateUser(actorId, id, payload) {
  const before = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!before) throw new ApiError(404, "User not found");

  const data = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;
  if (payload.departmentId !== undefined) data.departmentId = payload.departmentId || null;
  if (payload.entraObjectId !== undefined) {
    await assertEntraObjectIdAvailable(payload.entraObjectId, id);
    data.entraObjectId = payload.entraObjectId || null;
  }

  let finalRoleName = before.role.name;
  if (payload.roleName !== undefined) {
    const role = await prisma.role.findUnique({ where: { name: payload.roleName } });
    if (!role) throw new ApiError(400, `Unknown role: ${payload.roleName}`);
    data.roleId = role.id;
    finalRoleName = role.name;
  }

  // isManager always tracks the final role (ignoring any isManager the
  // client sent) so an AGENT<->USER role change can never leave a stale
  // manager flag — e.g. AGENT -> USER always clears isManager.
  data.isManager = deriveIsManager(finalRoleName);

  if (payload.teamIds !== undefined) {
    await prisma.teamMember.deleteMany({ where: { userId: id } });
    if (payload.teamIds.length) {
      await prisma.teamMember.createMany({
        data: payload.teamIds.map((teamId) => ({ userId: id, teamId })),
        skipDuplicates: true,
      });
    }
  }

  // See displaceOtherActiveManagers — this is what makes "change manager"
  // (assigning a new AGENT to a department) correctly demote whichever
  // AGENT previously managed it, instead of leaving both active.
  const finalDepartmentId = payload.departmentId !== undefined ? (payload.departmentId || null) : before.departmentId;
  const finalIsActive = payload.isActive !== undefined ? payload.isActive : before.isActive;
  const becomesActiveManager = finalRoleName === "AGENT" && finalIsActive && Boolean(finalDepartmentId);

  const user = await prisma.$transaction(async (tx) => {
    if (becomesActiveManager) {
      await displaceOtherActiveManagers(tx, finalDepartmentId, id);
    }
    return tx.user.update({ where: { id }, data, select: userListSelect });
  });

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

// Real hard delete — distinct from deactivateUser above. Only safe when the
// user has left no business history behind: Ticket.requesterId/assigneeId/
// managerId, TicketComment.authorId, TicketAttachment.uploadedById,
// TicketHistory.userId, and AuditLog.userId all reference User with no
// onDelete behavior in schema.prisma (Postgres default = RESTRICT), so a raw
// prisma.user.delete() would throw a foreign-key (P2003) error the moment
// any of those exist — exactly the "don't cascade business history away"
// intent already established by department.service.js#deleteDepartment's
// same guard-before-delete pattern. RefreshToken/TeamMember/Notification are
// the only User relations declared `onDelete: Cascade` in the schema, so
// those are the only rows that ever get cleaned up automatically here.
async function deleteUser(actorId, id) {
  if (actorId === id) throw new ApiError(400, "You cannot delete your own account");

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  if (!user) throw new ApiError(404, "User not found");

  const [requested, assigned, managed, comments, attachments, history, auditLogs] = await Promise.all([
    prisma.ticket.count({ where: { requesterId: id } }),
    prisma.ticket.count({ where: { assigneeId: id } }),
    prisma.ticket.count({ where: { managerId: id } }),
    prisma.ticketComment.count({ where: { authorId: id } }),
    prisma.ticketAttachment.count({ where: { uploadedById: id } }),
    prisma.ticketHistory.count({ where: { userId: id } }),
    prisma.auditLog.count({ where: { userId: id } }),
  ]);

  if (requested + assigned + managed + comments + attachments + history + auditLogs > 0) {
    throw new ApiError(409, "Cannot delete this user — they have ticket or activity history. Deactivate them instead to preserve that history.");
  }

  await prisma.user.delete({ where: { id } });
  await recordAudit({ userId: actorId, action: "USER_DELETED", entityType: "User", entityId: id, oldValues: { name: user.name, email: user.email } });
}

async function updateOwnProfile(userId, payload) {
  const data = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.avatarUrl !== undefined) data.avatarUrl = payload.avatarUrl;
  return prisma.user.update({ where: { id: userId }, data, select: userListSelect });
}

// Lightweight list for populating a ticket's "assignee" dropdown. AGENT is
// the department manager and is never assigned a ticket — the people who
// actually work tickets are USER employees, so this must return active
// USERs, scoped to the requesting manager's own department. ADMIN may pass
// an explicit departmentId to scope the same way; without one, ADMIN sees
// every active employee (matches its existing full-system-access scope).
async function listAssignableEmployees(actingUser, { departmentId } = {}) {
  const where = { isActive: true, role: { name: "USER" } };

  if (actingUser.role.name === "AGENT") {
    if (!actingUser.departmentId) return [];
    where.departmentId = actingUser.departmentId;
  } else if (departmentId) {
    where.departmentId = departmentId;
  }

  return prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, departmentId: true },
    orderBy: { name: "asc" },
  });
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deactivateUser,
  deleteUser,
  updateOwnProfile,
  listAssignableEmployees,
};
