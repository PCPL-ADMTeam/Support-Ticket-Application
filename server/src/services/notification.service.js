const prisma = require("../config/prisma");
const emailService = require("./email.service");
const emailTemplateService = require("./emailTemplate.service");

// Used ONLY when the PostgreSQL EmailTemplate for `eventKey` is missing,
// inactive, or fails to render (Step 7) — a minimal safety net so the
// in-app notification and the ticket operation that triggered it still
// succeed even before templates are seeded/configured. This is not "the"
// content source; the DB template is.
function fallbackContent(eventKey, ticket) {
  const label = eventKey ? eventKey.replace(/_/g, " ").toLowerCase() : "ticket update";
  return {
    subject: ticket ? `Ticket ${ticket.ticketNumber} — ${label}` : `Helpdesk — ${label}`,
    body: ticket ? `There is an update on ticket ${ticket.ticketNumber} (${label}).` : "There is a Helpdesk update.",
  };
}

// Creates an in-app Notification row AND emails the user via the existing
// Microsoft Graph email.service.js — used for every ticket lifecycle event.
// Architecture: ticket.service.js decides WHEN to call this and WHO
// receives it (via `userId` for TO, `ccUserIds` for CC — see below) by
// passing an `eventKey`; the PostgreSQL EmailTemplate matching that
// eventKey (emailTemplate.service.js) decides WHAT the subject/body say;
// email.service.js's existing Graph implementation decides HOW it's
// delivered — untouched here. This function itself never hardcodes
// notification/email content beyond the `fallbackContent` safety net above.
//
// Recipient resolution is centralized HERE, not scattered per call site:
// every address is resolved server-side from a user id
// (email.service#resolveUserEmail, which itself now skips inactive users)
// — callers never pass a raw email. `ccUserIds` is an explicit, always-
// complete list of user ids to CC for THIS specific event; there is no
// hidden default "CC the department manager" behavior anymore — every
// ticket.service.js call site computes exactly who belongs in TO/CC per
// the event's own recipient rule and passes that list directly. This
// function's only remaining jobs are: resolve ids -> emails, drop
// unresolvable/inactive addresses, dedupe against the primary TO and
// against each other, and send. `type` is kept only for the legacy
// Notification.type column (the notification bell UI doesn't branch on
// it); it defaults to `eventKey`. Failures anywhere in here are logged,
// never thrown, so a notification problem can't fail the ticket action
// that triggered it.
// The in-app notification bell renders `message` as plain text (React
// children, no dangerouslySetInnerHTML) — it never interprets HTML. Now
// that the rendered body is HTML (for the email), the bell needs a
// readable plain-text summary rather than raw markup, so this strips tags
// for that one column only; the actual email still gets the full HTML.
function stripHtmlForBell(html) {
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function notify({ eventKey, userId, ticketId, type, ticket, comment, statusChange, departmentTransfer, ccUserIds = [] }) {
  let recipientName;
  try {
    const recipient = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    recipientName = recipient?.name;
  } catch (err) {
    console.error(`[notifications] Failed to load recipient ${userId}:`, err.message);
  }

  const rendered = await emailTemplateService.renderTemplate(eventKey, { ticket, comment, recipientName, statusChange, departmentTransfer });
  const { subject, body } = rendered || fallbackContent(eventKey, ticket);

  try {
    await prisma.notification.create({
      data: { userId, ticketId, type: type || eventKey, title: subject, message: stripHtmlForBell(body) },
    });
  } catch (err) {
    console.error("[notifications] Failed to persist notification:", err.message);
  }

  try {
    const email = await emailService.resolveUserEmail(userId);
    if (!email) return;

    const cc = await resolveCcEmails(ccUserIds, email);

    await emailService.sendMail({ to: email, cc: cc.length ? cc : undefined, subject, html: body });
  } catch (err) {
    console.error(`[notifications] Failed to email user ${userId}:`, err.message);
  }
}

// Resolves each candidate CC user id to a deliverable email, silently
// dropping: falsy ids, unresolvable users, inactive users (resolveUserEmail
// itself now returns null for those), the primary TO address, and any
// duplicate that already appears earlier in the list — so a caller can
// freely pass e.g. [managerId, requesterId] without separately worrying
// about either one coinciding with the primary recipient or with each
// other.
async function resolveCcEmails(ccUserIds, primaryEmail) {
  const seen = new Set([primaryEmail.toLowerCase()]);
  const emails = [];
  for (const ccUserId of ccUserIds) {
    if (!ccUserId) continue;
    try {
      const ccEmail = await emailService.resolveUserEmail(ccUserId);
      if (!ccEmail) continue;
      const key = ccEmail.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(ccEmail);
    } catch (err) {
      console.error(`[notifications] Failed to resolve CC user ${ccUserId}:`, err.message);
    }
  }
  return emails;
}

async function listForUser(userId, { unreadOnly } = {}) {
  return prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { ticket: { select: { id: true, ticketNumber: true, title: true } } },
  });
}

async function markRead(userId, id) {
  return prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
}

async function markAllRead(userId) {
  return prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

module.exports = { notify, listForUser, markRead, markAllRead };
