const prisma = require("../config/prisma");
const { sendMail } = require("../config/mailer");

// Creates an in-app Notification row AND fires an email — used for ticket
// creation, assignment, status changes, and new comments (requirement #4).
// Failures in either channel are logged, never thrown, so a notification
// problem can't fail the ticket action that triggered it.
async function notify({ userId, ticketId, type, title, message, email }) {
  try {
    await prisma.notification.create({
      data: { userId, ticketId, type, title, message },
    });
  } catch (err) {
    console.error("[notifications] Failed to persist notification:", err.message);
  }

  if (email) {
    await sendMail({ to: email, subject: title, text: message });
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
