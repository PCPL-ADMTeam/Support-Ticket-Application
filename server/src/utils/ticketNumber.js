// Formats a department-specific sequence number into the department-wise
// ticket ID, e.g. prefix="HW", sequence=1 -> "HW-0001". The sequence itself
// is allocated by an atomic Department.ticketSequence increment (see
// ticket.service.js#createTicket) — this function only formats the
// already-allocated number, it never computes/allocates it itself, and it
// is the ONLY place ticket-number formatting happens in this codebase.
function formatDepartmentTicketNumber(prefix, sequence) {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

module.exports = { formatDepartmentTicketNumber };
