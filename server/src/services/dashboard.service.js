const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { scopeWhereForUser } = require("./ticket.service");

const STATUSES = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"];

function teamIdsOf(user) {
  return (user.teamMemberships || []).map((m) => m.teamId);
}

// Builds a raw-SQL WHERE fragment mirroring scopeWhereForUser()'s Prisma
// `where`, for the queries below that need raw SQL (date bucketing, AVG()).
// Values are bound via Prisma.sql template params, never string-concatenated.
function scopeSqlForUser(user) {
  if (user.role.name === "ADMIN") return Prisma.sql`TRUE`;
  if (user.role.name === "AGENT") {
    const teamIds = teamIdsOf(user);
    return teamIds.length
      ? Prisma.sql`("assigneeId" = ${user.id} OR "teamId" IN (${Prisma.join(teamIds)}))`
      : Prisma.sql`"assigneeId" = ${user.id}`;
  }
  return Prisma.sql`"requesterId" = ${user.id}`;
}

function dateRangeSql(dateFrom, dateTo) {
  const clauses = [];
  if (dateFrom) clauses.push(Prisma.sql`"createdAt" >= ${new Date(dateFrom)}`);
  if (dateTo) clauses.push(Prisma.sql`"createdAt" <= ${new Date(dateTo)}`);
  return clauses.length ? Prisma.join(clauses, " AND ") : Prisma.sql`TRUE`;
}

async function getStats(user, { dateFrom, dateTo, days = 30 } = {}) {
  const where = { AND: [scopeWhereForUser(user), dateFrom || dateTo ? {
    createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    },
  } : {}] };

  const scopeSql = scopeSqlForUser(user);
  const rangeSql = dateRangeSql(dateFrom, dateTo);

  const [
    statusGroups,
    priorityGroups,
    categoryGroups,
    overdueCount,
    totalCount,
    recentTickets,
  ] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priorityId"], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["categoryId"], where, _count: { _all: true } }),
    prisma.ticket.count({ where: { AND: [where, { dueAt: { lt: new Date() }, status: { notIn: ["RESOLVED", "CLOSED"] } }] } }),
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: { name: true } },
        priority: { select: { name: true, color: true } },
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
  ]);

  const [priorities, categories] = await Promise.all([
    prisma.priority.findMany({ select: { id: true, name: true, color: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);

  const kpis = {
    total: totalCount,
    overdue: overdueCount,
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

  const byCategory = categories
    .map((c) => ({ category: c.name, count: categoryGroups.find((g) => g.categoryId === c.id)?._count._all || 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

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

  // Agent workload: open tickets per agent (Admin sees everyone; an Agent's
  // own dashboard only shows their team via the same scope filter).
  const workload = await prisma.$queryRaw`
    SELECT u.id AS "agentId", u.name AS "agentName", COUNT(t.id)::int AS "openTickets"
    FROM users u
    JOIN roles r ON r.id = u."roleId" AND r.name IN ('AGENT', 'ADMIN')
    LEFT JOIN tickets t ON t."assigneeId" = u.id AND t.status NOT IN ('RESOLVED', 'CLOSED') AND ${scopeSql}
    WHERE u."isActive" = TRUE
    GROUP BY u.id, u.name
    ORDER BY "openTickets" DESC`;

  const [{ avgresolutionseconds } = {}] = await prisma.$queryRaw`
    SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))) AS avgResolutionSeconds
    FROM tickets
    WHERE ${scopeSql} AND ${rangeSql} AND "resolvedAt" IS NOT NULL`;

  const [{ compliant, resolvedwithdue } = {}] = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "resolvedAt" <= "dueAt") AS compliant,
      COUNT(*) AS resolvedWithDue
    FROM tickets
    WHERE ${scopeSql} AND ${rangeSql} AND "resolvedAt" IS NOT NULL AND "dueAt" IS NOT NULL`;

  const slaComplianceRate = resolvedwithdue && Number(resolvedwithdue) > 0
    ? Math.round((Number(compliant) / Number(resolvedwithdue)) * 1000) / 10
    : null;

  return {
    kpis,
    byStatus,
    byPriority,
    byCategory,
    trend,
    workload: workload.map((w) => ({ ...w, agentId: String(w.agentId), openTickets: Number(w.openTickets) })),
    avgResolutionHours: avgresolutionseconds ? Math.round((Number(avgresolutionseconds) / 3600) * 10) / 10 : null,
    slaComplianceRate,
    recentTickets,
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
