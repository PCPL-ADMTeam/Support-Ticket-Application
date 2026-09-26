const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { parsePagination, buildPagedResult } = require("../utils/pagination");
const { recordAudit } = require("../utils/audit");
const { hasAccess: hasUserDepartmentAccess, getUserDepartmentIds } = require("./userDepartmentAccess.service");

// MANAGER and TEAMLEAD are always department-management roles and EMPLOYEE/
// ADMIN never are, so isManager is fully derived from the role rather than
// set independently — it can never drift out of sync with the role-based
// business rule. Kept only for backward compatibility/history (see
// schema.prisma) — never read for authorization purposes anymore.
function deriveIsManager(roleName) {
  return roleName === "MANAGER" || roleName === "TEAMLEAD";
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

// Overwrites `department`/adds `departmentAccess` on each row so the Admin
// Users page shows the CURRENT source of truth per role — `department`
// above (from the `userListSelect` include) is only ever the legacy
// User.departmentId relation, which is correct for EMPLOYEE but stale or
// simply absent for MANAGER/TEAMLEAD (see
// userDepartmentAccessService#resolveUserDepartmentInfo, the same shared
// resolver /auth/login, /auth/refresh, and /auth/me use, so the Users page
// can never show something different from what that user sees of
// themselves). Batches ONE UserDepartmentAccess query for every MANAGER/
// TEAMLEAD row on the page rather than one query per row.
async function attachDepartmentInfo(rows) {
  const managementIds = rows.filter((u) => u.role.name === "MANAGER" || u.role.name === "TEAMLEAD").map((u) => u.id);
  if (!managementIds.length) return rows.map((u) => ({ ...u, departmentAccess: [] }));

  const accessRows = await prisma.userDepartmentAccess.findMany({
    where: { userId: { in: managementIds } },
    select: { userId: true, department: { select: { id: true, name: true } } },
    orderBy: { department: { name: "asc" } },
  });
  const byUserId = new Map();
  for (const row of accessRows) {
    if (!byUserId.has(row.userId)) byUserId.set(row.userId, []);
    byUserId.get(row.userId).push(row.department);
  }

  return rows.map((u) => {
    if (u.role.name === "TEAMLEAD") {
      const departments = byUserId.get(u.id) || [];
      return { ...u, department: departments[0] || null, departmentAccess: departments };
    }
    if (u.role.name === "MANAGER") {
      // Never falsely represent one of several as "the" department — see
      // resolveUserDepartmentInfo's same rule for the auth payload.
      return { ...u, department: null, departmentAccess: byUserId.get(u.id) || [] };
    }
    return { ...u, departmentAccess: [] };
  });
}

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

  return buildPagedResult(await attachDepartmentInfo(rows), total, { page, limit });
}

async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: userListSelect });
  if (!user) throw new ApiError(404, "User not found");
  const [shaped] = await attachDepartmentInfo([user]);
  return shaped;
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

async function createUser(actorId, payload) {
  const { name, email, password, roleName, teamIds = [], departmentId, entraObjectId } = payload;

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw new ApiError(400, `Unknown role: ${roleName}`);

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new ApiError(409, "A user with this email already exists");
  await assertEntraObjectIdAvailable(entraObjectId, null);

  const passwordHash = await bcrypt.hash(password, 12);
  const finalDepartmentId = departmentId || null;

  const user = await prisma.user.create({
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
  // client sent) so a role change can never leave a stale manager flag —
  // e.g. MANAGER/TEAMLEAD -> EMPLOYEE always clears isManager.
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

  // Multiple MANAGERs/TEAMLEADs may now share the same departmentId (or,
  // more typically, department authorization comes from
  // UserDepartmentAccess rather than departmentId at all) — no displacement
  // of any other management user happens here anymore. departmentId on User
  // remains a simple field update, same as any other profile attribute.
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

// Lightweight list for populating a ticket's "assignee" dropdown (and the
// ticket-list "Assignee" filter). MANAGER/TEAMLEAD are department-management
// roles and are never assigned a ticket themselves — the people who
// actually work tickets are EMPLOYEEs. Two call shapes:
//  - an explicit departmentId is passed (the real assignment action always
//    passes the TICKET's own toDepartmentId — see TicketDetailPage.jsx):
//    scope to exactly that department, and for a MANAGER/TEAMLEAD caller,
//    only after confirming UserDepartmentAccess to it — never
//    actingUser.departmentId, which under the multi-department model no
//    longer means "the one department this user manages."
//  - no departmentId (the ticket-list assignee FILTER dropdown, which isn't
//    tied to one specific ticket): for a MANAGER/TEAMLEAD, scope to the
//    union of every department they currently have access to, so the
//    filter can still show everyone they could possibly filter by without
//    leaking employees of departments they can't access. ADMIN sees every
//    active employee, matching its existing full-system-access scope.
async function listAssignableEmployees(actingUser, { departmentId } = {}) {
  const where = { isActive: true, role: { name: "EMPLOYEE" } };

  if (actingUser.role.name === "MANAGER" || actingUser.role.name === "TEAMLEAD") {
    if (departmentId) {
      if (!(await hasUserDepartmentAccess(actingUser.id, departmentId))) return [];
      where.departmentId = departmentId;
    } else {
      const accessibleIds = await getUserDepartmentIds(actingUser.id);
      if (!accessibleIds.length) return [];
      where.departmentId = { in: accessibleIds };
    }
  } else if (departmentId) {
    where.departmentId = departmentId;
  }

  return prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, departmentId: true },
    orderBy: { name: "asc" },
  });
}

// The one generic, reusable "search for a person" endpoint — backs the
// Raise Ticket "Custom CC" search (any role, no role filter) AND every
// searchable user-selector on the Admin side (Add Manager/Add Team Lead/Add
// Employee — role-filtered via the optional `role` param), rather than each
// screen inventing its own search. Deliberately NOT the same as GET /users
// (Admin-only, full user-management fields) — this is reachable by any
// authenticated role and returns only the minimal safe fields a picker
// needs, PLUS each result's current department standing (`department`, the
// legacy home-department field relevant to an EMPLOYEE candidate;
// `departmentAccess`, the UserDepartmentAccess list relevant to a MANAGER/
// TEAMLEAD candidate) so a caller can annotate/disable ineligible results
// (e.g. "Currently Team Lead — Hardware") without a second round trip.
// Active users only — an inactive/deactivated account can never be
// selected anywhere this feeds. A short query is required so this can't be
// used to dump the entire user table one keystroke at a time.
async function searchActiveEmployees(query, { role } = {}) {
  const search = (query || "").trim();
  if (search.length < 2) return [];

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(role ? { role: { name: role } } : {}),
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      department: { select: { id: true, name: true } },
      departmentAccess: { select: { department: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    department: u.department,
    departmentAccess: u.departmentAccess.map((a) => a.department),
  }));
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
  searchActiveEmployees,
};
