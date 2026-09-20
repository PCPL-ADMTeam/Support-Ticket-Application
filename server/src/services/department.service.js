const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");

const departmentIssuesSelect = {
  where: { isActive: true },
  select: { id: true, name: true, isOther: true },
  orderBy: [{ isOther: "asc" }, { name: "asc" }],
};

// Department = the organizational group now (one AGENT manager + its USER
// employees via User.departmentId — no separate Team/TeamMember layer).
// Prisma can't select the same `users` relation twice with different
// filters in one query, so we fetch every department member once and split
// them into managers vs employees here instead.
function toDepartmentShape(department) {
  const { users, ...rest } = department;
  return {
    ...rest,
    // Mirrors ticket.service#createTicket's manager lookup (AGENT +
    // isManager + isActive) — a deactivated agent must not still appear as
    // "the" manager here, since routing would already treat them as gone.
    managers: users.filter((u) => u.isManager && u.isActive),
    employees: users.filter((u) => u.role.name === "USER"),
  };
}

async function listDepartments() {
  const departments = await prisma.department.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      // Read-only in the Admin UI — ticketSequence is only ever advanced by
      // the atomic increment inside ticket.service.js#createTicket, never
      // set directly, to prevent an accidental reset causing duplicate IDs.
      ticketPrefix: true,
      ticketSequence: true,
      users: {
        select: { id: true, name: true, email: true, isActive: true, isManager: true, role: { select: { name: true } } },
        orderBy: { name: "asc" },
      },
      issues: departmentIssuesSelect,
    },
    orderBy: { name: "asc" },
  });
  return departments.map(toDepartmentShape);
}

// The DB-level @unique constraint on ticketPrefix is the real guarantee;
// this pre-check just turns a collision into a friendly 409 instead of a
// raw Prisma error leaking through.
async function assertTicketPrefixAvailable(ticketPrefix, excludeDepartmentId) {
  if (!ticketPrefix) return;
  const existing = await prisma.department.findUnique({ where: { ticketPrefix } });
  if (existing && existing.id !== excludeDepartmentId) {
    throw new ApiError(409, `Ticket prefix "${ticketPrefix}" is already used by another department.`);
  }
}

async function createDepartment(actorId, { name, ticketPrefix }) {
  const normalizedPrefix = ticketPrefix.toUpperCase();
  await assertTicketPrefixAvailable(normalizedPrefix, null);

  // Every department must always have the "Others" fallback issue — create
  // it in the same transaction so a brand-new department is immediately
  // usable on the ticket form, not left with an empty issue list.
  const department = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({ data: { name, ticketPrefix: normalizedPrefix } });
    await tx.issue.create({ data: { departmentId: created.id, name: "Others", isOther: true } });
    return created;
  });
  await recordAudit({ userId: actorId, action: "DEPARTMENT_CREATED", entityType: "Department", entityId: department.id, newValues: { name, ticketPrefix: normalizedPrefix } });
  return department;
}

async function updateDepartment(actorId, id, { name, ticketPrefix }) {
  const data = {};
  if (name !== undefined) data.name = name;
  if (ticketPrefix !== undefined) {
    const normalizedPrefix = ticketPrefix.toUpperCase();
    await assertTicketPrefixAvailable(normalizedPrefix, id);
    data.ticketPrefix = normalizedPrefix;
  }

  const department = await prisma.department.update({ where: { id }, data });
  await recordAudit({ userId: actorId, action: "DEPARTMENT_UPDATED", entityType: "Department", entityId: id, newValues: { name, ticketPrefix: data.ticketPrefix } });
  return department;
}

async function deleteDepartment(actorId, id) {
  const [ticketsFrom, ticketsTo, userCount] = await Promise.all([
    prisma.ticket.count({ where: { fromDepartmentId: id } }),
    prisma.ticket.count({ where: { toDepartmentId: id } }),
    prisma.user.count({ where: { departmentId: id } }),
  ]);
  if (ticketsFrom > 0 || ticketsTo > 0) {
    throw new ApiError(409, "Cannot delete a department that has tickets referencing it.");
  }
  if (userCount > 0) {
    throw new ApiError(409, "Cannot delete a department that still has users assigned to it. Reassign them first.");
  }

  await prisma.department.delete({ where: { id } });
  await recordAudit({ userId: actorId, action: "DEPARTMENT_DELETED", entityType: "Department", entityId: id });
}

module.exports = { listDepartments, createDepartment, updateDepartment, deleteDepartment };
