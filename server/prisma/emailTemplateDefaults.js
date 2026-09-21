// Canonical default content for the 8 ticket-lifecycle EmailTemplate rows —
// the single source of truth both prisma/seed.js (fresh installs) and
// prisma/migrateEmailTemplatesToHtml.js (upgrading already-seeded
// plain-text rows to HTML) read from, so the two can never drift apart.
// Subjects stay plain text (email subjects aren't HTML-rendered); bodies
// are HTML, with a "View Ticket" button linking {{ticketLink}}, per the
// email-formatting enhancement.

const BUTTON =
  '<a href="{{ticketLink}}" style="display:inline-block;padding:12px 20px;background:#b43d35;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-family:Arial,Helvetica,sans-serif;font-size:14px;">View Ticket</a>';

function row(label, value) {
  return `<tr><td style="padding:4px 16px 4px 0;color:#666;font-size:13px;">${label}</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${value}</td></tr>`;
}

function wrap(intro, rowsHtml, extraHtml = "") {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;color:#1a1a1a;">
  <p style="margin:0 0 12px;">Hello {{recipientName}},</p>
  <p style="margin:0 0 16px;color:#444;">${intro}</p>
  <table style="border-collapse:collapse;margin-bottom:16px;">${rowsHtml}</table>
  ${extraHtml}<p style="margin:20px 0;">${BUTTON}</p>
  <p style="color:#888;font-size:12px;margin-top:24px;">Regards,<br>Support Team</p>
</div>`;
}

const emailTemplateDefaults = [
  {
    eventKey: "TICKET_CREATED",
    name: "Ticket Created",
    subject: "New Support Ticket {{ticketNumber}} Created",
    body: wrap(
      "A new support ticket has been raised.",
      row("Ticket", "{{ticketNumber}}") +
        row("Title", "{{title}}") +
        row("Department", "{{department}}") +
        row("Issue", "{{issue}}") +
        row("Priority", "{{priority}}") +
        row("Status", "{{status}}") +
        row("Requester", "{{requesterName}}"),
    ),
  },
  {
    eventKey: "TICKET_ASSIGNED",
    name: "Ticket Assigned",
    subject: "Ticket {{ticketNumber}} Assigned to You",
    body: wrap(
      "Ticket {{ticketNumber}} has been assigned to {{assigneeName}}.",
      row("Ticket", "{{ticketNumber}}") +
        row("Title", "{{title}}") +
        row("Department", "{{department}}") +
        row("Issue", "{{issue}}") +
        row("Priority", "{{priority}}") +
        row("Status", "{{status}}") +
        row("Manager", "{{managerName}}"),
    ),
  },
  {
    eventKey: "TICKET_REASSIGNED",
    name: "Ticket Reassigned",
    subject: "Ticket {{ticketNumber}} Reassigned to You",
    body: wrap(
      "Ticket {{ticketNumber}} has been reassigned to {{assigneeName}}.",
      row("Ticket", "{{ticketNumber}}") +
        row("Title", "{{title}}") +
        row("Department", "{{department}}") +
        row("Issue", "{{issue}}") +
        row("Priority", "{{priority}}") +
        row("Status", "{{status}}") +
        row("Manager", "{{managerName}}"),
    ),
  },
  {
    eventKey: "TICKET_STATUS_CHANGED",
    name: "Ticket Status Changed",
    subject: "Ticket {{ticketNumber}} Status Changed",
    body: wrap(
      "Ticket {{ticketNumber}} status changed from {{oldStatus}} to {{newStatus}}.",
      row("Ticket", "{{ticketNumber}}") +
        row("Title", "{{title}}") +
        row("Department", "{{department}}") +
        row("Priority", "{{priority}}") +
        row("Status", "{{status}}") +
        // Only ever populated when this specific change moved the ticket
        // to ON_HOLD (see emailTemplate.service.js#buildPlaceholders) —
        // blank for every other status this event covers (OPEN/
        // IN_PROGRESS), per the existing "unknown/missing placeholders
        // render blank" behavior.
        row("Reason", "{{onHoldReason}}"),
    ),
  },
  {
    eventKey: "TICKET_RESOLVED",
    name: "Ticket Resolved",
    subject: "Ticket {{ticketNumber}} Resolved",
    body: wrap(
      "Your ticket has been marked as resolved.",
      row("Ticket", "{{ticketNumber}}") +
        row("Title", "{{title}}") +
        row("Department", "{{department}}") +
        row("Priority", "{{priority}}") +
        row("Status", "{{status}}") +
        row("Assignee", "{{assigneeName}}") +
        row("Resolution Notes", "{{resolutionNotes}}"),
    ),
  },
  {
    eventKey: "TICKET_REOPENED",
    name: "Ticket Reopened",
    subject: "Ticket {{ticketNumber}} Reopened",
    body: wrap(
      "This ticket has been reopened and needs attention.",
      row("Ticket", "{{ticketNumber}}") +
        row("Title", "{{title}}") +
        row("Department", "{{department}}") +
        row("Priority", "{{priority}}") +
        row("Status", "{{status}}") +
        row("Assignee", "{{assigneeName}}") +
        row("Manager", "{{managerName}}"),
    ),
  },
  {
    eventKey: "TICKET_COMMENT_ADDED",
    name: "New Comment Added",
    subject: "New Comment on Ticket {{ticketNumber}}",
    body: wrap(
      "{{commentAuthor}} added a new comment on ticket {{ticketNumber}}:",
      row("Ticket", "{{ticketNumber}}") + row("Title", "{{title}}") + row("Department", "{{department}}") + row("Status", "{{status}}"),
      '<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #ddd;color:#333;font-size:13px;">{{comment}}</blockquote>',
    ),
  },
  {
    eventKey: "TICKET_UPDATED",
    name: "Ticket Updated",
    subject: "Ticket {{ticketNumber}} has been updated",
    body: wrap(
      "Changes have been made to your ticket.",
      row("Ticket", "{{ticketNumber}}") +
        row("Title", "{{title}}") +
        row("Department", "{{department}}") +
        row("Issue", "{{issue}}") +
        row("Priority", "{{priority}}") +
        row("Status", "{{status}}") +
        row("Updated by", "{{requesterName}}"),
    ),
  },
  {
    eventKey: "TICKET_CLOSED",
    name: "Ticket Closed",
    subject: "Ticket {{ticketNumber}} Closed",
    body: wrap(
      "This ticket has been closed.",
      row("Ticket", "{{ticketNumber}}") +
        row("Title", "{{title}}") +
        row("Department", "{{department}}") +
        row("Priority", "{{priority}}") +
        row("Status", "{{status}}") +
        row("Assignee", "{{assigneeName}}") +
        row("Closed Reason", "{{closedReason}}"),
    ),
  },
];

// The exact plain-text bodies these HTML versions replace — verbatim from
// the live database before this change. Used by
// migrateEmailTemplatesToHtml.js to detect whether a row still has its
// original seeded content (safe to upgrade) vs. one an Admin has already
// customized (must be left alone).
const legacyPlainTextBodies = {
  TICKET_CREATED: `Hello {{recipientName}},\n\nA new support ticket has been raised.\n\nTicket: {{ticketNumber}}\nTitle: {{title}}\nDepartment: {{department}}\nIssue: {{issue}}\nPriority: {{priority}}\nStatus: {{status}}\nRequester: {{requesterName}}\n\nView the ticket: {{ticketLink}}\n\nRegards,\nSupport Team`,
  TICKET_ASSIGNED: `Hello {{recipientName}},\n\nTicket {{ticketNumber}} has been assigned to {{assigneeName}}.\n\nTicket: {{ticketNumber}}\nTitle: {{title}}\nDepartment: {{department}}\nIssue: {{issue}}\nPriority: {{priority}}\nStatus: {{status}}\nManager: {{managerName}}\n\nView the ticket: {{ticketLink}}\n\nRegards,\nSupport Team`,
  TICKET_REASSIGNED: `Hello {{recipientName}},\n\nTicket {{ticketNumber}} has been reassigned to {{assigneeName}}.\n\nTicket: {{ticketNumber}}\nTitle: {{title}}\nDepartment: {{department}}\nIssue: {{issue}}\nPriority: {{priority}}\nStatus: {{status}}\nManager: {{managerName}}\n\nView the ticket: {{ticketLink}}\n\nRegards,\nSupport Team`,
  TICKET_STATUS_CHANGED: `Hello {{recipientName}},\n\nTicket {{ticketNumber}} status changed from {{oldStatus}} to {{newStatus}}.\n\nTicket: {{ticketNumber}}\nTitle: {{title}}\nDepartment: {{department}}\nPriority: {{priority}}\nStatus: {{status}}\n\nView the ticket: {{ticketLink}}\n\nRegards,\nSupport Team`,
  TICKET_RESOLVED: `Hello {{recipientName}},\n\nYour ticket has been marked as resolved.\n\nTicket: {{ticketNumber}}\nTitle: {{title}}\nDepartment: {{department}}\nPriority: {{priority}}\nStatus: {{status}}\nAssignee: {{assigneeName}}\nResolution: {{resolution}}\n\nView the ticket: {{ticketLink}}\n\nRegards,\nSupport Team`,
  TICKET_REOPENED: `Hello {{recipientName}},\n\nThis ticket has been reopened and needs attention.\n\nTicket: {{ticketNumber}}\nTitle: {{title}}\nDepartment: {{department}}\nPriority: {{priority}}\nStatus: {{status}}\nAssignee: {{assigneeName}}\nManager: {{managerName}}\n\nView the ticket: {{ticketLink}}\n\nRegards,\nSupport Team`,
  TICKET_COMMENT_ADDED: `Hello {{recipientName}},\n\n{{commentAuthor}} added a new comment on ticket {{ticketNumber}}:\n\n"{{comment}}"\n\nTicket: {{ticketNumber}}\nTitle: {{title}}\nDepartment: {{department}}\nStatus: {{status}}\n\nView the ticket: {{ticketLink}}\n\nRegards,\nSupport Team`,
  TICKET_CLOSED: `Hello {{recipientName}},\n\nThis ticket has been closed.\n\nTicket: {{ticketNumber}}\nTitle: {{title}}\nDepartment: {{department}}\nPriority: {{priority}}\nStatus: {{status}}\nAssignee: {{assigneeName}}\n\nView the ticket: {{ticketLink}}\n\nRegards,\nSupport Team`,
};

module.exports = { emailTemplateDefaults, legacyPlainTextBodies };
