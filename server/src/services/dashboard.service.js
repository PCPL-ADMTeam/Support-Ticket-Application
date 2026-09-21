const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { scopeWhereForUser } = require("./ticket.service");

const STATUSES = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"];

// Builds a raw-SQL WHERE fragment mirroring scopeWhereForUser()'s Prisma
// `where`, for the queries below that need raw SQL (date bucketing, AVG()).
// Values are bound via Prisma.sql template params, never string-concatenated.
function scopeSqlForUser(user) {
  if (user.role.name === "ADMIN") return Prisma.sql`TRUE`;
  if (user.role.name === "AGENT") {
    // AGENT = department manager: scoped to tickets routed to their department.
    return user.departmentId ? Prisma.sql`"toDepartmentId" = ${user.departmentId}` : Prisma.sql`FALSE`;
  }
  return Prisma.sql`("requesterId" = ${user.id} OR "assigneeId" = ${user.id})`;
}

// "My Tickets" (assigned to me) vs "My Requests" (raised by me) dashboard
// tabs — independent of role, driven purely by real assigneeId/requesterId
// columns so the numbers always reflect actual tickets, never hardcoded.
function scopeWhereForTab(user, scope) {
  if (scope === "assigned") return { assigneeId: user.id };
  if (scope === "created") return { requesterId: user.id };
  return scopeWhereForUser(user);
}

function scopeSqlForTab(user, scope) {
  if (scope === "assigned") return Prisma.sql`"assigneeId" = ${user.id}`;
  if (scope === "created") return Prisma.sql`"requesterId" = ${user.id}`;
  return scopeSqlForUser(user);
}

async function getStats(user, { dateFrom, dateTo, days = 30, scope } = {}) {
  const where = { AND: [scopeWhereForTab(user, scope), dateFrom || dateTo ? {
    createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    },
  } : {}] };

  const scopeSql = scopeSqlForTab(user, scope);

  const [
    statusGroups,
    priorityGroups,
    totalCount,
    unassignedCount,
  ] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priorityId"], where, _count: { _all: true } }),
    prisma.ticket.count({ where }),
    // Used by the Agent (department manager) dashboard to surface tickets
    // nobody is working yet; harmless extra field for Admin/User, who don't
    // display it.
    prisma.ticket.count({ where: { AND: [...where.AND, { assigneeId: null }] } }),
  ]);

  const priorities = await prisma.priority.findMany({ select: { id: true, name: true, color: true } });

  const kpis = {
    total: totalCount,
    unassigned: unassignedCount,
    ...Object.fromEntries(STATUSES.map((s) => [s.toLowerCase(), 0])),
  };
  for (const g of statusGroups) kpis[g.status.toLowerCase()] = g._count._all;

  const byStatus = STATUSES.map((s) => ({
    status: s,
    count: statusGroups.find((g) => g.status === s)?._count._all || 0,
  }));

  const byPriority = priorities.map((p) => ({
    priority: p.name,
    color: p.color,
    count: priorityGroups.find((g) => g.priorityId === p.id)?._count._all || 0,
  }));

  // Created-vs-resolved trend, bucketed by day via SQL date_trunc — a single
  // aggregate query rather than pulling every row into Node.
  const createdSeries = await prisma.$queryRaw`
    SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::int AS count
    FROM tickets
    WHERE ${scopeSql} AND "createdAt" >= NOW() - make_interval(days => ${days}::int)
    GROUP BY 1 ORDER BY 1`;

  const resolvedSeries = await prisma.$queryRaw`
    SELECT date_trunc('day', "resolvedAt")::date AS day, COUNT(*)::int AS count
    FROM tickets
    WHERE ${scopeSql} AND "resolvedAt" IS NOT NULL AND "resolvedAt" >= NOW() - make_interval(days => ${days}::int)
    GROUP BY 1 ORDER BY 1`;

  const trend = mergeSeries(createdSeries, resolvedSeries, days);

  // Employee workload: tickets per USER employee (the people tickets are
  // actually assigned to), broken down by status. Admin sees every
  // department; a manager's own dashboard is scoped to their department via
  // the same ${scopeSql} filter plus an explicit departmentId match on the
  // employee row itself. `openTickets` keeps its original definition/name
  // (any status still not RESOLVED/CLOSED) for backward compatibility with
  // the existing Admin dashboard's AgentWorkloadTable; inProgressTickets and
  // resolvedTickets are additive fields for the Agent dashboard's richer
  // Employee Workload table.
  const departmentFilter =
    user.role.name === "AGENT" && user.departmentId
      ? Prisma.sql`AND u."departmentId" = ${user.departmentId}`
      : Prisma.empty;

  const workload = await prisma.$queryRaw`
    SELECT
      u.id AS "agentId",
      u.name AS "agentName",
      COUNT(t.id) FILTER (WHERE t.status NOT IN ('RESOLVED', 'CLOSED'))::int AS "openTickets",
      COUNT(t.id) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS "inProgressTickets",
      COUNT(t.id) FILTER (WHERE t.status IN ('RESOLVED', 'CLOSED'))::int AS "resolvedTickets"
    FROM users u
    JOIN roles r ON r.id = u."roleId" AND r.name = 'USER'
    LEFT JOIN tickets t ON t."assigneeId" = u.id AND ${scopeSql}
    WHERE u."isActive" = TRUE ${departmentFilter}
    GROUP BY u.id, u.name
    ORDER BY "openTickets" DESC`;

  return {
    kpis,
    byStatus,
    byPriority,
    trend,
    workload: workload.map((w) => ({
      ...w,
      agentId: String(w.agentId),
      openTickets: Number(w.openTickets),
      inProgressTickets: Number(w.inProgressTickets),
      resolvedTickets: Number(w.resolvedTickets),
    })),
  };
}

function mergeSeries(createdRows, resolvedRows, days) {
  const map = new Map();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, created: 0, resolved: 0 });
  }
  for (const row of createdRows) {
    const key = new Date(row.day).toISOString().slice(0, 10);
    if (map.has(key)) map.get(key).created = Number(row.count);
  }
  for (const row of resolvedRows) {
    const key = new Date(row.day).toISOString().slice(0, 10);
    if (map.has(key)) map.get(key).resolved = Number(row.count);
  }
  return Array.from(map.values());
}

module.exports = { getStats };
