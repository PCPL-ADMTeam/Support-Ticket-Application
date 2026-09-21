const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");

const departmentSelect = {
  id: true,
  name: true,
  createdAt: true,
  managerId: true,
  manager: { select: { id: true, name: true, email: true } },
  users: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } },
  issues: {
    where: { isActive: true },
    select: { id: true, name: true, isOther: true },
    orderBy: [{ isOther: "asc" }, { name: "asc" }],
  },
};

async function listDepartments() {
  return prisma.department.findMany({
    select: departmentSelect,
    orderBy: { name: "asc" },
  });
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

// Assigns (or clears, with managerId=null) the single Manager of a
// department. Setting a manager promotes that User to the MANAGER role and
// moves them into this department; the outgoing manager (if different) is
// demoted back to USER so a department never has more than one manager and
// a user never manages more than one department.
async function assignManager(actorId, departmentId, managerId) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) throw new ApiError(404, "Department not found");

  if (managerId) {
    const candidate = await prisma.user.findUnique({
      where: { id: managerId },
      include: { managedDepartment: { select: { id: true, name: true } } },
    });
    if (!candidate) throw new ApiError(404, "User not found");
    if (candidate.managedDepartment && candidate.managedDepartment.id !== departmentId) {
      throw new ApiError(409, `${candidate.name} already manages the ${candidate.managedDepartment.name} department`);
    }
  }

  const managerRole = await prisma.role.findUnique({ where: { name: "MANAGER" } });
  const userRole = await prisma.role.findUnique({ where: { name: "USER" } });

  const updated = await prisma.$transaction(async (tx) => {
    if (department.managerId && department.managerId !== managerId) {
      await tx.user.update({ where: { id: department.managerId }, data: { roleId: userRole.id } });
    }
    if (managerId) {
      await tx.user.update({ where: { id: managerId }, data: { roleId: managerRole.id, departmentId } });
    }
    return tx.department.update({ where: { id: departmentId }, data: { managerId: managerId || null }, select: departmentSelect });
  });

  await recordAudit({
    userId: actorId,
    action: "DEPARTMENT_MANAGER_ASSIGNED",
    entityType: "Department",
    entityId: departmentId,
    oldValues: { managerId: department.managerId },
    newValues: { managerId: managerId || null },
  });

  return updated;
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

module.exports = { listDepartments, createDepartment, updateDepartment, assignManager, deleteDepartment };
