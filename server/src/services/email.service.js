const axios = require("axios");
const prisma = require("../config/prisma");
const env = require("../config/env");
const entraService = require("./entra.service");

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function toRecipients(value) {
  if (!value) return undefined;
  const list = Array.isArray(value) ? value : [value];
  const recipients = list.filter(Boolean).map((address) => ({ emailAddress: { address } }));
  return recipients.length ? recipients : undefined;
}

// The sender is always the one configured support mailbox — never a
// per-request/client-supplied address. There is currently no business
// requirement for per-employee "send as", so this is intentionally the
// only supported sender; CLOUDREADY_MAILBOX can be changed in one place
// (env) without touching any ticket logic.
function getSender() {
  return env.cloudready.mailbox || null;
}

// Sends via Microsoft Graph on behalf of CLOUDREADY_MAILBOX. Never throws —
// a delivery failure is logged and swallowed so it can never fail the
// ticket action that triggered it (ticket creation/update must not roll
// back because Graph/email is unavailable).
async function sendMail({ to, cc, subject, html, text }) {
  if (!to) return;

  if (!entraService.isConfigured()) {
    console.log(`[email] CloudReady not configured — email not sent. To: ${to} | Subject: ${subject}`);
    return;
  }

  const sender = getSender();
  if (!sender) {
    console.error(`[email] CLOUDREADY_MAILBOX is not set — cannot send "${subject}" to ${to}`);
    return;
  }

  try {
    const token = await entraService.getAccessToken();
    await axios.post(
      `${GRAPH_BASE}/users/${encodeURIComponent(sender)}/sendMail`,
      {
        message: {
          subject,
          body: { contentType: html ? "HTML" : "Text", content: html || text || "" },
          toRecipients: toRecipients(to),
          ccRecipients: toRecipients(cc),
        },
        saveToSentItems: true,
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(`[email] Microsoft Graph sendMail failed for "${subject}" to ${to}:`, err.response?.data?.error?.message || err.message);
  }
}

// Helpdesk User -> Entra user -> deliverable address (Phase 8's
// resolveUserEmail): prefer the mapped Entra object id, fall back to
// looking the user up by their Helpdesk email as a userPrincipalName, and
// prefer Entra's `mail` over `userPrincipalName` when both exist. Never
// throws — any failure just falls back to the Helpdesk email so a
// notification is still attempted, and is logged for visibility.
async function resolveUserEmail(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  if (!entraService.isConfigured()) {
    return user.email || null;
  }

  try {
    let entraUser = user.entraObjectId ? await entraService.findUserById(user.entraObjectId) : null;
    if (!entraUser && user.email) {
      entraUser = await entraService.findUserByUserPrincipalName(user.email);
    }
    if (entraUser) {
      return entraUser.mail || entraUser.userPrincipalName || user.email || null;
    }
  } catch (err) {
    console.error(`[email] Failed to resolve CloudReady identity for user ${userId}:`, err.response?.data?.error?.message || err.message);
  }

  return user.email || null;
}

module.exports = { sendMail, resolveUserEmail };
