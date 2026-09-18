const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");

const departmentSelect = {
  id: true,
  name: true,
  createdAt: true,
  managers: {
    where: { isManager: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  },
  issues: {
    where: { isActive: true },
    select: { id: true, name: true, isOther: true },
    orderBy: [{ isOther: "asc" }, { name: "asc" }],
  },
};

// Prisma relation name on Department is `users`, but we only ever want the
// managers for the ticket form / admin UI — select via the relation with a
// filter instead of exposing every department member.
function toDepartmentShape(department) {
  const { users, ...rest } = department;
  return { ...rest, managers: users };
}

async function listDepartments() {
  const departments = await prisma.department.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      users: departmentSelect.managers,
      issues: departmentSelect.issues,
    },
    orderBy: { name: "asc" },
  });
  return departments.map(toDepartmentShape);
}

async function createDepartment(actorId, { name }) {
  const department = await prisma.department.create({ data: { name } });
  await recordAudit({ userId: actorId, action: "DEPARTMENT_CREATED", entityType: "Department", entityId: department.id, newValues: { name } });
  return department;
}

async function updateDepartment(actorId, id, { name }) {
  const data = {};
  if (name !== undefined) data.name = name;

  const department = await prisma.department.update({ where: { id }, data });
  await recordAudit({ userId: actorId, action: "DEPARTMENT_UPDATED", entityType: "Department", entityId: id, newValues: { name } });
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
