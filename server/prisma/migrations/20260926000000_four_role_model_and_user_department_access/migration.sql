-- Evolves the 3-role (ADMIN/AGENT/USER) model into the final 4-role model
-- (ADMIN/MANAGER/TEAMLEAD/EMPLOYEE), and generalizes the AGENT-only
-- AgentDepartmentAccess table into the role-neutral UserDepartmentAccess,
-- shared by both MANAGER (multi-department) and TEAMLEAD (exactly one
-- department, enforced at the application layer, see
-- userDepartmentAccess.service.js). No table is dropped/recreated, no
-- ticket/user/department row is deleted, and no roleId on any user changes
-- — only the Role rows' own name/label are renamed, and a new Role row is
-- inserted for MANAGER.

-- ---------------------------------------------------------------------------
-- 1. Rename agent_department_access -> user_department_access (structure
--    only; every existing row's data is preserved as-is).
-- ---------------------------------------------------------------------------

ALTER TABLE "agent_department_access" RENAME TO "user_department_access";
ALTER TABLE "user_department_access" RENAME COLUMN "agentId" TO "userId";

ALTER TABLE "user_department_access" RENAME CONSTRAINT "agent_department_access_pkey" TO "user_department_access_pkey";
ALTER TABLE "user_department_access" RENAME CONSTRAINT "agent_department_access_agentId_fkey" TO "user_department_access_userId_fkey";
ALTER TABLE "user_department_access" RENAME CONSTRAINT "agent_department_access_departmentId_fkey" TO "user_department_access_departmentId_fkey";
ALTER TABLE "user_department_access" RENAME CONSTRAINT "agent_department_access_createdBy_fkey" TO "user_department_access_createdBy_fkey";

ALTER INDEX "agent_department_access_agentId_departmentId_key" RENAME TO "user_department_access_userId_departmentId_key";
ALTER INDEX "agent_department_access_agentId_idx" RENAME TO "user_department_access_userId_idx";
ALTER INDEX "agent_department_access_departmentId_idx" RENAME TO "user_department_access_departmentId_idx";

-- ---------------------------------------------------------------------------
-- 2. Role rename/add. Existing User.roleId values are untouched — every user
--    keeps the exact same roleId; only the Role row itself changes what name
--    that id now means. ADMIN is left alone.
-- ---------------------------------------------------------------------------

UPDATE "roles" SET "name" = 'TEAMLEAD', "label" = 'Team Lead' WHERE "name" = 'AGENT';
UPDATE "roles" SET "name" = 'EMPLOYEE', "label" = 'Employee' WHERE "name" = 'USER';

INSERT INTO "roles" ("id", "name", "label", "createdAt")
SELECT 'role_' || substr(md5('MANAGER' || CURRENT_TIMESTAMP::text), 1, 20), 'MANAGER', 'Manager', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'MANAGER');

-- ---------------------------------------------------------------------------
-- 3. Safety dedup: a former AGENT (now TEAMLEAD) must end up with AT MOST
--    ONE user_department_access row, since TEAMLEAD is now a strictly
--    single-department role. The previous architecture allowed an AGENT up
--    to MAX_AGENTS_PER_DEPARTMENT departments in principle (even though in
--    practice every seeded/backfilled AGENT only ever had one), so this
--    keeps the single OLDEST grant per TEAMLEAD (by createdAt, tie-broken by
--    id) and removes any additional ones, rather than leaving a TEAMLEAD
--    silently multi-department. A NOTICE is raised for every row removed
--    this way so an operator can audit exactly what was trimmed.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  trimmed RECORD;
BEGIN
  FOR trimmed IN
    SELECT uda.id, uda."userId", uda."departmentId", u.email
    FROM "user_department_access" uda
    JOIN "users" u ON u.id = uda."userId"
    JOIN "roles" r ON r.id = u."roleId"
    WHERE r.name = 'TEAMLEAD'
      AND uda.id NOT IN (
        SELECT DISTINCT ON (uda2."userId") uda2.id
        FROM "user_department_access" uda2
        JOIN "users" u2 ON u2.id = uda2."userId"
        JOIN "roles" r2 ON r2.id = u2."roleId"
        WHERE r2.name = 'TEAMLEAD'
        ORDER BY uda2."userId", uda2."createdAt" ASC, uda2.id ASC
      )
  LOOP
    RAISE NOTICE 'Removing extra TEAMLEAD department access: user % (%) department %', trimmed."userId", trimmed.email, trimmed."departmentId";
    DELETE FROM "user_department_access" WHERE id = trimmed.id;
  END LOOP;
END $$;
