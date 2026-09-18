// Formats the DB-generated autoincrement sequence into a display ID like
// "TKT-00001". Called right after Ticket.create() using the row's `seq`.
function formatTicketNumber(seq) {
  return `TKT-${String(seq).padStart(5, "0")}`;
}

module.exports = { formatTicketNumber };
