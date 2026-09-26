const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { scopeWhereForUser, scopeWhereForTab, resolveUserDepartmentIds, isManagementRole } = require("./ticket.service");

const STATUSES = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"];

// Builds a raw-SQL WHERE fragment mirroring scopeWhereForUser()'s Prisma
// `where`, for the queries below that need raw SQL (date bucketing, AVG()).
// Values are bound via Prisma.sql template params, never string-concatenated.
// userDepartmentIds is the caller's full UserDepartmentAccess set (see
// ticket.service.js#resolveUserDepartmentIds) — a MANAGER may have several,
// a TEAMLEAD always exactly one, so this is an `IN (...)`, not a single
// equality check, and works identically either way.
function scopeSqlForUser(user, userDepartmentIds = []) {
  if (user.role.name === "ADMIN") return Prisma.sql`TRUE`;
  if (isManagementRole(user)) {
    return userDepartmentIds.length ? Prisma.sql`"toDepartmentId" IN (${Prisma.join(userDepartmentIds)})` : Prisma.sql`FALSE`;
  }
  return Prisma.sql`("requesterId" = ${user.id} OR "assigneeId" = ${user.id})`;
}

// "My Tickets" (assigned to me) vs "My Requests" (raised by me) dashboard
// tabs — independent of role, driven purely by real assigneeId/requesterId
// columns so the numbers always reflect actual tickets, never hardcoded.
// scopeWhereForTab itself is now imported from ticket.service.js (single
// source of truth, shared with listTickets) instead of being redefined
// here — same logic, same result, just no longer duplicated.
function scopeSqlForTab(user, scope, userDepartmentIds = []) {
  if (scope === "assigned") return Prisma.sql`"assigneeId" = ${user.id}`;
  if (scope === "created") return Prisma.sql`"requesterId" = ${user.id}`;
  if (scope === "mine") return Prisma.sql`("requesterId" = ${user.id} OR "assigneeId" = ${user.id})`;
  return scopeSqlForUser(user, userDepartmentIds);
}

// departmentId here is the Dashboard/Tickets department-dropdown's
// selection — "All Departments" (omitted) shows every ticket across every
// department the caller currently has access to (userDepartmentIds, ANDed
// onto scope exactly like listTickets' own ?departmentId= filter, so
// selecting a department the caller doesn't actually have access to can
// only ever narrow the result to zero, never expand it).
async function getStats(user, { dateFrom, dateTo, days = 30, scope, departmentId } = {}) {
  const dateWhere = dateFrom || dateTo ? {
    createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    },
  } : {};

  const userDepartmentIds = await resolveUserDepartmentIds(user);
  const departmentFilterWhere = departmentId ? { toDepartmentId: departmentId } : {};
  const departmentFilterSql = departmentId ? Prisma.sql`AND "toDepartmentId" = ${departmentId}` : Prisma.empty;

  const where = { AND: [scopeWhereForTab(user, scope, userDepartmentIds), departmentFilterWhere, dateWhere] };

  const scopeSql = scopeSqlForTab(user, scope, userDepartmentIds);

  // "Raised by Me" and "Total Department Tickets" are fixed-definition
  // KPIs, independent of whatever `scope` the caller passed for the
  // status/priority breakdown above — so a request for e.g. `?scope=
  // assigned` can never silently redefine or blank out either number. Both
  // are derived only from the authenticated `user` (never a client-
  // supplied id), and both use the SAME date range as every other KPI here.
  //
  // raisedByMe: every ticket this user raised, regardless of which
  // department currently owns it (so a ticket transferred elsewhere after
  // being raised still counts here) — plain requesterId match, same
  // definition scopeWhereForTab's own "created" branch already uses.
  const raisedByMeWhere = { AND: [{ requesterId: user.id }, dateWhere] };
  // assignedToMe: mirrors raisedByMe exactly, for assigneeId instead of
  // requesterId — the Team Lead "My Dashboard"'s own "Assigned to Me" KPI
  // (Managers never have an "Assigned to Me" view — they're never assignees
  // — but the field itself stays harmlessly 0 for them, same precedent as
  // `unassignedCount` below being unused by roles that don't render it).
  const assignedToMeWhere = { AND: [{ assigneeId: user.id }, dateWhere] };
  // totalDepartmentTickets: reuses ticket.service.js's own
  // scopeWhereForUser — for a MANAGER/TEAMLEAD that's now "every ticket
  // currently routed to any department I have access to" (or just the
  // selected one, if the dropdown narrowed it), the SAME rule
  // assertCanView/listTickets already enforce for what they may even see,
  // so this can never become a second, conflicting notion of "department
  // ticket." For ADMIN/EMPLOYEE this mirrors their own normal visibility
  // (system-wide / own tickets) — an unused-but-harmless field for roles
  // whose dashboards don't render it.
  const departmentWhere = { AND: [scopeWhereForUser(user, userDepartmentIds), departmentFilterWhere, dateWhere] };

  const [
    statusGroups,
    priorityGroups,
    totalCount,
    unassignedCount,
    raisedByMe,
    assignedToMe,
    totalDepartmentTickets,
  ] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priorityId"], where, _count: { _all: true } }),
    prisma.ticket.count({ where }),
    // Used by the Manager/Team Lead department dashboard to surface tickets
    // nobody is working yet; harmless extra field for Admin/Employee, who
    // don't display it.
    prisma.ticket.count({ where: { AND: [...where.AND, { assigneeId: null }] } }),
    prisma.ticket.count({ where: raisedByMeWhere }),
    prisma.ticket.count({ where: assignedToMeWhere }),
    prisma.ticket.count({ where: departmentWhere }),
  ]);

  const priorities = await prisma.priority.findMany({ select: { id: true, name: true, color: true } });

  const kpis = {
    total: totalCount,
    unassigned: unassignedCount,
    raisedByMe,
    assignedToMe,
    totalDepartmentTickets,
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
    WHERE ${scopeSql} ${departmentFilterSql} AND "createdAt" >= NOW() - make_interval(days => ${days}::int)
    GROUP BY 1 ORDER BY 1`;

  const resolvedSeries = await prisma.$queryRaw`
    SELECT date_trunc('day', "resolvedAt")::date AS day, COUNT(*)::int AS count
    FROM tickets
    WHERE ${scopeSql} ${departmentFilterSql} AND "resolvedAt" IS NOT NULL AND "resolvedAt" >= NOW() - make_interval(days => ${days}::int)
    GROUP BY 1 ORDER BY 1`;

  const trend = mergeSeries(createdSeries, resolvedSeries, days);

  // Employee workload: tickets per EMPLOYEE (the people tickets are
  // actually assigned to), broken down by status. Admin sees every
  // department (or just the selected one); a Manager/Team Lead's own
  // dashboard is scoped to every department they have access to (or just
  // the selected one) via the same ${scopeSql} filter plus an explicit
  // departmentId match/IN on the employee row itself. `openTickets` keeps
  // its original definition/name (any status still not RESOLVED/CLOSED) for
  // backward compatibility with the existing Admin dashboard's
  // AgentWorkloadTable; inProgressTickets and resolvedTickets are additive
  // fields for the richer Employee Workload table.
  const workloadDepartmentFilter = departmentId
    ? Prisma.sql`AND u."departmentId" = ${departmentId}`
    : isManagementRole(user)
      ? (userDepartmentIds.length ? Prisma.sql`AND u."departmentId" IN (${Prisma.join(userDepartmentIds)})` : Prisma.sql`AND FALSE`)
      : Prisma.empty;

  const workload = await prisma.$queryRaw`
    SELECT
      u.id AS "agentId",
      u.name AS "agentName",
      COUNT(t.id) FILTER (WHERE t.status NOT IN ('RESOLVED', 'CLOSED'))::int AS "openTickets",
      COUNT(t.id) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS "inProgressTickets",
      COUNT(t.id) FILTER (WHERE t.status IN ('RESOLVED', 'CLOSED'))::int AS "resolvedTickets"
    FROM users u
    JOIN roles r ON r.id = u."roleId" AND r.name = 'EMPLOYEE'
    LEFT JOIN tickets t ON t."assigneeId" = u.id AND ${scopeSql}
    WHERE u."isActive" = TRUE ${workloadDepartmentFilter}
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
