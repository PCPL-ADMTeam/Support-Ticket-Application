const prisma = require("../config/prisma");

// The single definition of "who manages this department right now" — an
// active AGENT flagged as that department's manager. Originally inlined in
// ticket.service.js#createTicket; factored out so notification.service.js
// can reuse the exact same lookup for CC resolution without duplicating it
// or creating a require() cycle between the two services.
async function findActiveDepartmentManager(departmentId) {
  if (!departmentId) return null;
  return prisma.user.findFirst({
    where: { departmentId, isManager: true, isActive: true, role: { name: "AGENT" } },
    orderBy: { createdAt: "asc" },
  });
}

module.exports = { findActiveDepartmentManager };
