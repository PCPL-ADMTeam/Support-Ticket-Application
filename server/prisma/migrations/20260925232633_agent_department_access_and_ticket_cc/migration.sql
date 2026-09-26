-- Multi-department AGENT access (AgentDepartmentAccess) and per-ticket
-- Custom CC (TicketCC). Purely additive — no existing table/column is
-- altered or dropped. Ticket.managerId, User.isManager, and
-- User.departmentId are all left exactly as they are.

CREATE TABLE "agent_department_access" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "agent_department_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_department_access_agentId_departmentId_key" ON "agent_department_access"("agentId", "departmentId");
CREATE INDEX "agent_department_access_agentId_idx" ON "agent_department_access"("agentId");
CREATE INDEX "agent_department_access_departmentId_idx" ON "agent_department_access"("departmentId");

ALTER TABLE "agent_department_access" ADD CONSTRAINT "agent_department_access_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_department_access" ADD CONSTRAINT "agent_department_access_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_department_access" ADD CONSTRAINT "agent_department_access_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ticket_cc" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_cc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_cc_ticketId_userId_key" ON "ticket_cc"("ticketId", "userId");
CREATE INDEX "ticket_cc_ticketId_idx" ON "ticket_cc"("ticketId");
CREATE INDEX "ticket_cc_userId_idx" ON "ticket_cc"("userId");

ALTER TABLE "ticket_cc" ADD CONSTRAINT "ticket_cc_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_cc" ADD CONSTRAINT "ticket_cc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_cc" ADD CONSTRAINT "ticket_cc_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every department that currently has an active AGENT manager
-- under the old single-manager model (User.isManager = true) gets a
-- matching AgentDepartmentAccess row, so existing department access is not
-- silently lost the moment authorization switches to reading this table.
-- ON CONFLICT DO NOTHING guards against ever creating a duplicate row (the
-- (agentId, departmentId) unique index already forbids it regardless).
INSERT INTO "agent_department_access" ("id", "agentId", "departmentId", "createdAt")
SELECT
    'adax_' || substr(md5(u.id || d.id), 1, 20),
    u.id,
    d.id,
    CURRENT_TIMESTAMP
FROM "users" u
JOIN "departments" d ON d.id = u."departmentId"
WHERE u."isManager" = true AND u."isActive" = true
ON CONFLICT ("agentId", "departmentId") DO NOTHING;
