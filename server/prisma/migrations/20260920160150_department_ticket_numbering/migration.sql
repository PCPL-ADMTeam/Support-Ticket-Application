-- AlterTable: add nullable first so existing rows can be backfilled safely
-- before the NOT NULL + UNIQUE constraints are applied.
ALTER TABLE "departments" ADD COLUMN "ticketPrefix" TEXT;
ALTER TABLE "departments" ADD COLUMN "ticketSequence" INTEGER NOT NULL DEFAULT 0;

-- Backfill the known department prefixes for rows that already exist.
UPDATE "departments" SET "ticketPrefix" = 'AD' WHERE "name" = 'Administration';
UPDATE "departments" SET "ticketPrefix" = 'HW' WHERE "name" = 'Hardware';
UPDATE "departments" SET "ticketPrefix" = 'BIC' WHERE "name" = 'BI/Copilot';
UPDATE "departments" SET "ticketPrefix" = 'M365' WHERE "name" = 'M365';
UPDATE "departments" SET "ticketPrefix" = 'SEC' WHERE "name" = 'Security';
UPDATE "departments" SET "ticketPrefix" = 'CLD' WHERE "name" = 'Cloud';
UPDATE "departments" SET "ticketPrefix" = 'SAL' WHERE "name" = 'Sales';
UPDATE "departments" SET "ticketPrefix" = 'OPS' WHERE "name" = 'Operations';
UPDATE "departments" SET "ticketPrefix" = 'HR' WHERE "name" = 'HR';

-- Fallback for any other pre-existing department not in the known list
-- above (e.g. an ad hoc/test department) — derives a prefix from the name
-- and appends part of the row id to guarantee uniqueness, so the NOT NULL
-- + UNIQUE constraints below can always be applied without manual
-- intervention or guessing at unknown data.
UPDATE "departments"
SET "ticketPrefix" = UPPER(LEFT(REGEXP_REPLACE("name", '[^a-zA-Z0-9]', '', 'g'), 6)) || '_' || substring("id", 1, 4)
WHERE "ticketPrefix" IS NULL;

-- Every department's sequence starts at 0 (next ticket = 1). Existing
-- tickets all use the old global "TKT-XXXXX" format (verified directly
-- against the live database before writing this migration), which can
-- never collide with the new "<PREFIX>-XXXX" format, so no further
-- reconciliation against existing ticket numbers is needed.

-- Enforce required + unique now that every row has a value.
ALTER TABLE "departments" ALTER COLUMN "ticketPrefix" SET NOT NULL;
CREATE UNIQUE INDEX "departments_ticketPrefix_key" ON "departments"("ticketPrefix");
