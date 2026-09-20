const env = require("../config/env");

// Pure HTML builders — no department/user names are ever hardcoded here,
// everything comes from the `ticket` (and `comment`) object passed in,
// which is always the real Prisma record with its relations included.

function ticketLink(ticket) {
  return `${env.clientUrl}/tickets/${ticket.id}`;
}

function issueLabel(ticket) {
  if (ticket.issue?.isOther) return ticket.customIssueText || ticket.issue?.name || "Others";
  return ticket.issue?.name || "—";
}

function renderRows(rows) {
  return rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#666;font-size:13px;">${label}</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${value}</td></tr>`,
    )
    .join("");
}

function baseRows(ticket) {
  return [
    ["Ticket", ticket.ticketNumber],
    ["Title", ticket.title],
    ["Department", ticket.toDepartment?.name],
    ["Issue", issueLabel(ticket)],
    ["Priority", ticket.priority?.name],
    ["Status", ticket.status],
  ];
}

function wrap(heading, intro, ticket, extraRows = [], extraHtml = "") {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;color:#1a1a1a;">
      <h2 style="margin:0 0 4px;">${heading}</h2>
      <p style="color:#444;margin:0 0 12px;">${intro}</p>
      <table style="border-collapse:collapse;margin-bottom:16px;">${renderRows([...baseRows(ticket), ...extraRows])}</table>
      ${extraHtml}
      <p style="margin-top:16px;">
        <a href="${ticketLink(ticket)}" style="background:#c81e2a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;display:inline-block;">
          View Ticket
        </a>
      </p>
    </div>`;
}

function ticketCreatedTemplate(ticket) {
  return wrap(
    `Ticket ${ticket.ticketNumber} Created`,
    `A ticket has been raised for ${ticket.toDepartment?.name || "your department"}.`,
    ticket,
    [["Requester", ticket.requester?.name]],
  );
}

function ticketAssignedTemplate(ticket) {
  return wrap(
    `Ticket ${ticket.ticketNumber} Assigned`,
    `This ticket has been assigned to ${ticket.assignee?.name || "an employee"}.`,
    ticket,
    [["Assignee", ticket.assignee?.name], ["Manager", ticket.manager?.name]],
  );
}

function ticketResolvedTemplate(ticket) {
  return wrap(
    `Ticket ${ticket.ticketNumber} Resolved`,
    "Your ticket has been marked as resolved.",
    ticket,
    [["Assignee", ticket.assignee?.name]],
  );
}

function ticketReopenedTemplate(ticket) {
  return wrap(
    `Ticket ${ticket.ticketNumber} Reopened`,
    "This ticket has been reopened and needs attention.",
    ticket,
    [["Assignee", ticket.assignee?.name || "Unassigned"], ["Manager", ticket.manager?.name]],
  );
}

function ticketStatusChangedTemplate(ticket, { oldValue, newValue } = {}) {
  return wrap(
    `Ticket ${ticket.ticketNumber} Status Changed`,
    `Status changed from ${oldValue || "—"} to ${newValue || ticket.status}.`,
    ticket,
  );
}

function ticketCommentTemplate(ticket, comment) {
  const quote = comment?.body
    ? `<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #ddd;color:#333;font-size:13px;">${comment.body}</blockquote>`
    : "";
  return wrap(
    `New Comment on Ticket ${ticket.ticketNumber}`,
    `${comment?.author?.name || "Someone"} added a new comment:`,
    ticket,
    [],
    quote,
  );
}

module.exports = {
  ticketCreatedTemplate,
  ticketAssignedTemplate,
  ticketResolvedTemplate,
  ticketReopenedTemplate,
  ticketStatusChangedTemplate,
  ticketCommentTemplate,
};
