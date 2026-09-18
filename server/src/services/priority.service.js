const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");

const prioritySelect = {
  id: true,
  name: true,
  level: true,
  color: true,
  slaPolicy: { select: { id: true, responseTimeMinutes: true, resolutionTimeMinutes: true } },
};

async function listPriorities() {
  return prisma.priority.findMany({ select: prioritySelect, orderBy: { level: "asc" } });
}

async function createPriority(actorId, { name, level, color }) {
  const priority = await prisma.priority.create({ data: { name, level, color }, select: prioritySelect });
  await recordAudit({ userId: actorId, action: "PRIORITY_CREATED", entityType: "Priority", entityId: priority.id, newValues: { name, level } });
  return priority;
}

async function updatePriority(actorId, id, { name, level, color }) {
  const data = {};
  if (name !== undefined) data.name = name;
  if (level !== undefined) data.level = level;
  if (color !== undefined) data.color = color;
  const priority = await prisma.priority.update({ where: { id }, data, select: prioritySelect });
  await recordAudit({ userId: actorId, action: "PRIORITY_UPDATED", entityType: "Priority", entityId: id, newValues: { name, level, color } });
  return priority;
}

// Creates or replaces the SLA policy attached to a priority — this is the
// "SLA configuration per priority" requirement (response + resolution time).
async function upsertSlaPolicy(actorId, priorityId, { responseTimeMinutes, resolutionTimeMinutes }) {
  const priority = await prisma.priority.findUnique({ where: { id: priorityId } });
  if (!priority) throw new ApiError(404, "Priority not found");

  const before = await prisma.slaPolicy.findUnique({ where: { priorityId } });

  const policy = await prisma.slaPolicy.upsert({
    where: { priorityId },
    update: { responseTimeMinutes, resolutionTimeMinutes },
    create: { priorityId, responseTimeMinutes, resolutionTimeMinutes },
  });

  await recordAudit({
    userId: actorId,
    action: "SLA_POLICY_UPDATED",
    entityType: "SlaPolicy",
    entityId: policy.id,
    oldValues: before,
    newValues: policy,
  });

  return policy;
}

module.exports = { listPriorities, createPriority, updatePriority, upsertSlaPolicy };
