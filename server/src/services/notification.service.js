const prisma = require("../config/prisma");
const emailService = require("./email.service");
const emailTemplateService = require("./emailTemplate.service");
const { findActiveDepartmentManager } = require("../utils/departmentManager");

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
// receives it (via `userId`) by passing an `eventKey`; the PostgreSQL
// EmailTemplate matching that eventKey (emailTemplate.service.js) decides
// WHAT the subject/body say; email.service.js's existing Graph
// implementation decides HOW it's delivered — untouched here. This
// function itself never hardcodes notification/email content beyond the
// `fallbackContent` safety net above.
//
// The destination address is always resolved server-side from `userId`
// (email.service#resolveUserEmail) — callers never pass a raw email.
// `type` is kept only for the legacy Notification.type column (the
// notification bell UI doesn't branch on it); it defaults to `eventKey`.
// Failures anywhere in here are logged, never thrown, so a notification
// problem can't fail the ticket action that triggered it.
// The in-app notification bell renders `message` as plain text (React
// children, no dangerouslySetInnerHTML) — it never interprets HTML. Now
// that the rendered body is HTML (for the email), the bell needs a
// readable plain-text summary rather than raw markup, so this strips tags
// for that one column only; the actual email still gets the full HTML.
function stripHtmlForBell(html) {
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function notify({ eventKey, userId, ticketId, type, ticket, comment, statusChange }) {
  let recipientName;
  try {
    const recipient = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    recipientName = recipient?.name;
  } catch (err) {
    console.error(`[notifications] Failed to load recipient ${userId}:`, err.message);
  }

  const rendered = await emailTemplateService.renderTemplate(eventKey, { ticket, comment, recipientName, statusChange });
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

    // CC the ticket's CURRENT department's active AGENT manager on every
    // one of these ticket lifecycle emails — applied centrally here so
    // none of ticket.service.js's ~15 call sites into notify() needed to
    // change. "Current" department, not whatever the ticket's stored
    // `manager`/`managerId` snapshot says, since that can go stale if the
    // department's manager changes after the ticket was created — reuses
    // the exact same lookup createTicket already uses to derive a manager
    // in the first place. Never added if it would duplicate the primary
    // recipient, and never fails the email if no manager exists.
    const cc = await resolveDepartmentManagerCc(ticket, email);

    await emailService.sendMail({ to: email, cc, subject, html: body });
  } catch (err) {
    console.error(`[notifications] Failed to email user ${userId}:`, err.message);
  }
}

async function resolveDepartmentManagerCc(ticket, primaryEmail) {
  const departmentId = ticket?.toDepartmentId || ticket?.toDepartment?.id;
  if (!departmentId) return undefined;

  try {
    const manager = await findActiveDepartmentManager(departmentId);
    if (!manager) {
      console.log(`[notifications] No active department manager found for department ${departmentId} — sending without CC.`);
      return undefined;
    }
    const managerEmail = await emailService.resolveUserEmail(manager.id);
    if (!managerEmail || managerEmail.toLowerCase() === primaryEmail.toLowerCase()) return undefined;
    return managerEmail;
  } catch (err) {
    console.error(`[notifications] Failed to resolve department manager CC for department ${departmentId}:`, err.message);
    return undefined;
  }
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
