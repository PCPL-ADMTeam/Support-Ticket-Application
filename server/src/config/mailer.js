const nodemailer = require("nodemailer");
const env = require("./env");

// When SMTP_HOST is not configured (local dev without a mail sandbox), fall
// back to a "console transport" that just logs what would have been sent,
// so the rest of the notification flow can still be exercised.
const consoleTransport = {
  sendMail: async (message) => {
    console.log("\n[mailer] SMTP not configured — email not sent. Contents:");
    console.log(`  To: ${message.to}`);
    console.log(`  Subject: ${message.subject}`);
    console.log(`  Body: ${message.text || message.html}\n`);
    return { messageId: "console-transport" };
  },
};

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    })
  : consoleTransport;

async function sendMail({ to, subject, text, html }) {
  try {
    await transporter.sendMail({ from: env.smtp.from, to, subject, text, html });
  } catch (err) {
    // Email delivery must never crash the request that triggered it.
    console.error("[mailer] Failed to send email:", err.message);
  }
}

module.exports = { sendMail };
