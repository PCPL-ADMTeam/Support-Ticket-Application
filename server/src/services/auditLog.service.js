const prisma = require("../config/prisma");
const { parsePagination, buildPagedResult } = require("../utils/pagination");

async function listAuditLogs(query) {
  const { page, limit, skip, take } = parsePagination(query);
  const where = {
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.dateFrom ? { createdAt: { gte: new Date(query.dateFrom) } } : {}),
    ...(query.dateTo ? { createdAt: { lte: new Date(query.dateTo) } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return buildPagedResult(rows, total, { page, limit });
}

module.exports = { listAuditLogs };
