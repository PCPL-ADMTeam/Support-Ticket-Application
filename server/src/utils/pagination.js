// Normalizes ?page & ?limit query params into Prisma skip/take, with sane
// bounds so a client can't request an unbounded page size.
function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

function buildPagedResult(rows, total, { page, limit }) {
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

module.exports = { parsePagination, buildPagedResult };
