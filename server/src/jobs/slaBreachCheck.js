const cron = require("node-cron");
const prisma = require("../config/prisma");
const notificationService = require("../services/notification.service");

// Runs every 15 minutes: finds tickets that just crossed their SLA due date
// and are still open, and notifies the assignee (or requester, if
// unassigned) so breaches don't go unnoticed between dashboard visits.
async function checkForBreaches() {
  const now = new Date();
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60000);

  const breached = await prisma.ticket.findMany({
    where: {
      status: { notIn: ["RESOLVED", "CLOSED"] },
      dueAt: { gte: fifteenMinAgo, lt: now },
    },
    include: { assignee: true, requester: true },
  });

  for (const ticket of breached) {
    const recipient = ticket.assignee || ticket.requester;
    await notificationService.notify({
      userId: recipient.id,
      ticketId: ticket.id,
      type: "SLA_BREACH",
      title: `SLA breached: ${ticket.ticketNumber}`,
      message: `"${ticket.title}" has passed its SLA resolution deadline.`,
      email: recipient.email,
    });
  }
}

function startSlaBreachJob() {
  cron.schedule("*/15 * * * *", () => {
    checkForBreaches().catch((err) => console.error("[sla-job] Failed:", err.message));
  });
}

module.exports = { startSlaBreachJob, checkForBreaches };
