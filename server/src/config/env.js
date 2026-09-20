require("dotenv").config();

// Centralised, fail-fast config. Anything the app needs from process.env
// is read here once, so a missing var surfaces at boot instead of deep in
// a request handler.
function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "5000", 10),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshSecret: required("JWT_REFRESH_SECRET"),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || "admin@helpdesk.local",
    password: process.env.SEED_ADMIN_PASSWORD || "Admin@12345",
  },

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "Helpdesk <no-reply@helpdesk.local>",
  },

  // CloudReady Microsoft Entra ID (Graph) — client-credentials app used both
  // to look up corporate directory users and to send ticket emails via
  // Graph /sendMail. All three must be set for either feature to work;
  // never hardcode these — see server/.env.example. CLOUDREADY_MAILBOX is
  // the one support mailbox Graph sends "from"; it's never client-supplied.
  cloudready: {
    tenantId: process.env.CLOUDREADY_TENANT_ID || "",
    clientId: process.env.CLOUDREADY_CLIENT_ID || "",
    clientSecret: process.env.CLOUDREADY_CLIENT_SECRET || "",
    mailbox: process.env.CLOUDREADY_MAILBOX || "",
  },

  upload: {
    dir: process.env.UPLOAD_DIR || "uploads",
    maxSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || "10", 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || "300", 10),
  },
};
