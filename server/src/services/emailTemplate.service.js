const prisma = require("../config/prisma");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");

// {{placeholder}} tokens only — plain string replacement, never eval'd or
// otherwise executed as code.
const PLACEHOLDER_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

// The exact set buildPlaceholders() below populates — kept as an explicit
// list (rather than introspecting an object) purely so the Admin UI has a
// single source of truth for "what placeholders exist" via
// GET /email-templates/placeholders, instead of duplicating this list in
// the frontend.
const SUPPORTED_PLACEHOLDERS = [
  "recipientName",
  "ticketNumber",
  "title",
  "department",
  "issue",
  "priority",
  "status",
  "requesterName",
  "assigneeName",
  "comment",
  "resolution",
  "managerName",
  "commentAuthor",
  "oldStatus",
  "newStatus",
  "ticketLink",
  "resolutionNotes",
  "onHoldReason",
  "closedReason",
  "oldDepartment",
  "transferReason",
  "resetLink",
];

function stripHtml(value) {
  if (typeof value !== "string") return value;
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function issueLabel(ticket) {
  if (!ticket) return "";
  if (ticket.issue?.isOther) return ticket.customIssueText || ticket.issue?.name || "Others";
  return ticket.issue?.name || "";
}

// All placeholders supported by the seeded templates. Every value is
// optional — a ticket/comment/statusChange that doesn't apply to a given
// event just leaves those placeholders blank when rendered, rather than
// failing.
function buildPlaceholders({ ticket, comment, recipientName, statusChange, departmentTransfer, resetLink } = {}) {
  return {
    recipientName: recipientName || "",
    ticketNumber: ticket?.ticketNumber || "",
    title: ticket?.title || "",
    department: ticket?.toDepartment?.name || "",
    issue: issueLabel(ticket),
    priority: ticket?.priority?.name || "",
    status: ticket?.status || "",
    requesterName: ticket?.requester?.name || "",
    assigneeName: ticket?.assignee?.name || "Unassigned",
    managerName: ticket?.manager?.name || "",
    comment: stripHtml(comment?.body) || "",
    commentAuthor: comment?.author?.name || "",
    resolution: ticket?.status || "",
    oldStatus: statusChange?.oldValue || "",
    newStatus: statusChange?.newValue || "",
    ticketLink: ticket ? `${env.clientUrl}/tickets/${ticket.id}` : "",
    // TICKET_RESOLVED/TICKET_CLOSED only ever fire exactly when the ticket
    // has just moved to that status, so reading straight off the ticket is
    // always the current reason — no staleness risk.
    resolutionNotes: ticket?.resolutionNotes || "",
    closedReason: ticket?.closedReason || "",
    // TICKET_STATUS_CHANGED, unlike the two above, is shared across
    // multiple possible target statuses (OPEN/IN_PROGRESS/ON_HOLD) — so
    // onHoldReason is scoped to "this specific change is the one that just
    // set it to ON_HOLD", not just "whatever the ticket's stored
    // onHoldReason happens to be right now". Without this guard, an
    // OPEN/IN_PROGRESS status-changed email sent after a ticket's *prior*
    // on-hold period would incorrectly show that old, unrelated reason.
    onHoldReason: statusChange?.newValue === "ON_HOLD" ? ticket?.onHoldReason || "" : "",
    // TICKET_DEPARTMENT_TRANSFERRED only — `department` above already reads
    // the ticket's CURRENT toDepartment (the new one, since this renders
    // after the transfer already committed), so the old department name has
    // nowhere else to come from and is passed in explicitly by the caller,
    // the same way `statusChange` carries old/new status.
    oldDepartment: departmentTransfer?.oldDepartmentName || "",
    transferReason: departmentTransfer?.reason || "",
    // PASSWORD_RESET_REQUESTED only — passed in directly by
    // auth.service.js#forgotPassword, since there's no ticket to derive a
    // link from (mirrors how ticketLink itself is built above).
    resetLink: resetLink || "",
  };
}

// Bodies are now HTML (see emailTemplateDefaults.js) — a placeholder value
// sourced from less-trusted data (a ticket title, a comment, a user's
// display name) must be HTML-escaped before insertion, or it could break
// out of surrounding markup or an href="{{ticketLink}}" attribute (HTML
// injection). Escaping a URL this way is also the *correct* way to embed
// it in an attribute — email/browser clients decode entities like "&amp;"
// back to "&" when parsing attribute values.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Missing/unknown placeholders resolve to "" rather than throwing or
// leaving the literal "{{token}}" in the sent email. `escapeValues: true`
// HTML-escapes each substituted value — used for the HTML body; the
// plain-text subject is rendered unescaped (subjects aren't HTML).
function renderString(str, data, { escapeValues = false } = {}) {
  return String(str).replace(PLACEHOLDER_PATTERN, (_match, key) => {
    const value = data[key];
    if (value === undefined || value === null) return "";
    return escapeValues ? escapeHtml(value) : String(value);
  });
}

// This renderer is deliberately plain string substitution with no
// conditional blocks (see emailTemplateDefaults.js's `row()` helper — every
// templated fact is one `<tr><td>Label</td><td>{{value}}</td></tr>`). That
// means a placeholder that legitimately renders blank for a given event —
// e.g. {{onHoldReason}} on an OPEN -> IN_PROGRESS status-changed email —
// would otherwise leave a visible "Reason:" row with nothing after it.
// Rather than inventing a template engine, this is a narrow, generic
// post-substitution cleanup: any table row whose VALUE cell ended up
// empty after rendering is dropped entirely. It only ever looks at the
// row's already-rendered content, so it applies safely to every current
// and future template — a row with real content is never touched.
function stripEmptyLabeledRows(html) {
  // [^<]* (not .*?) for the label cell's content is deliberate: `.` matches
  // `<`/`>` too, so a non-greedy `.*?` here would happily cross a
  // `</td><td>` boundary into a LATER row while backtracking, potentially
  // swallowing every row between the first `<tr>` and the next one that
  // happens to be empty — collapsing the whole table instead of just the
  // one empty row. Labels are always plain text with no nested tags, so
  // disallowing `<` keeps each match confined to a single row.
  return html.replace(/<tr>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>\s*<\/td>\s*<\/tr>/g, "");
}

// Loads the EmailTemplate row for `eventKey`, verifies it's active, and
// returns { subject, body } with every supported placeholder replaced.
// Returns null — and logs why — if the template is missing, inactive, or
// fails to render for any reason; callers must treat null as "no template
// content available" and fall back gracefully rather than crash the
// ticket operation that triggered the notification.
async function renderTemplate(eventKey, context) {
  if (!eventKey) return null;

  let template;
  try {
    template = await prisma.emailTemplate.findUnique({ where: { eventKey } });
  } catch (err) {
    console.error(`[emailTemplate] Failed to load template for "${eventKey}":`, err.message);
    return null;
  }

  if (!template) {
    console.error(`[emailTemplate] No EmailTemplate row for eventKey "${eventKey}"`);
    return null;
  }
  if (!template.isActive) {
    console.log(`[emailTemplate] Template for "${eventKey}" is inactive — skipping email content.`);
    return null;
  }

  try {
    const data = buildPlaceholders(context);
    return {
      subject: renderString(template.subject, data),
      body: stripEmptyLabeledRows(renderString(template.body, data, { escapeValues: true })),
    };
  } catch (err) {
    console.error(`[emailTemplate] Failed to render template for "${eventKey}":`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Admin CRUD for the EmailTemplate management UI. eventKey is deliberately
// never accepted here — it's set only by prisma/seed.js and must stay in
// lockstep with the fixed TICKET_* constants ticket.service.js emits, so
// there is intentionally no create/delete endpoint either (only the 8
// seeded rows should ever exist).
// ---------------------------------------------------------------------------

const emailTemplateSelect = {
  id: true,
  eventKey: true,
  name: true,
  subject: true,
  body: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

async function listTemplates() {
  return prisma.emailTemplate.findMany({ select: emailTemplateSelect, orderBy: { eventKey: "asc" } });
}

async function getTemplateById(id) {
  const template = await prisma.emailTemplate.findUnique({ where: { id }, select: emailTemplateSelect });
  if (!template) throw new ApiError(404, "Email template not found");
  return template;
}

async function updateTemplate(actorId, id, { name, subject, body, isActive }) {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Email template not found");

  const data = {};
  if (name !== undefined) data.name = name;
  if (subject !== undefined) data.subject = subject;
  if (body !== undefined) data.body = body;
  if (isActive !== undefined) data.isActive = isActive;

  const template = await prisma.emailTemplate.update({ where: { id }, data, select: emailTemplateSelect });

  await recordAudit({
    userId: actorId,
    action: "EMAIL_TEMPLATE_UPDATED",
    entityType: "EmailTemplate",
    entityId: id,
    oldValues: { name: existing.name, subject: existing.subject, body: existing.body, isActive: existing.isActive },
    newValues: { name, subject, body, isActive },
  });

  return template;
}

function listPlaceholders() {
  return SUPPORTED_PLACEHOLDERS;
}

module.exports = { renderTemplate, listTemplates, getTemplateById, updateTemplate, listPlaceholders };
