-- Adds nullable reason/notes columns for the three status transitions that
-- require an explanation: RESOLVED, ON_HOLD, CLOSED. See
-- ticket.service.js#updateTicket for how they're validated/populated, and
-- TicketHistory for the permanent (never-overwritten) record of every
-- occurrence.
ALTER TABLE "tickets" ADD COLUMN "resolutionNotes" TEXT;
ALTER TABLE "tickets" ADD COLUMN "onHoldReason" TEXT;
ALTER TABLE "tickets" ADD COLUMN "closedReason" TEXT;
