const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");

async function createIssue(actorId, { departmentId, name, isOther }) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) throw new ApiError(400, "Department not found");

  const issue = await prisma.issue.create({ data: { departmentId, name, isOther: Boolean(isOther) } });
  await recordAudit({ userId: actorId, action: "ISSUE_CREATED", entityType: "Issue", entityId: issue.id, newValues: { departmentId, name } });
  return issue;
}

async function updateIssue(actorId, id, { name, isActive }) {
  const data = {};
  if (name !== undefined) data.name = name;
  if (isActive !== undefined) data.isActive = isActive;

  const issue = await prisma.issue.update({ where: { id }, data });
  await recordAudit({ userId: actorId, action: "ISSUE_UPDATED", entityType: "Issue", entityId: id, newValues: { name, isActive } });
  return issue;
}

async function deleteIssue(actorId, id) {
  const inUse = await prisma.ticket.count({ where: { issueId: id } });
  if (inUse > 0) throw new ApiError(409, "Cannot delete an issue that has tickets. Deactivate it instead.");

  await prisma.issue.delete({ where: { id } });
  await recordAudit({ userId: actorId, action: "ISSUE_DELETED", entityType: "Issue", entityId: id });
}

module.exports = { createIssue, updateIssue, deleteIssue };
