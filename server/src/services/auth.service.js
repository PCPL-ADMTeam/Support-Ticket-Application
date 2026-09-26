const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require("../utils/jwt");
const emailTemplateService = require("./emailTemplate.service");
const emailService = require("./email.service");
const userDepartmentAccessService = require("./userDepartmentAccess.service");

// Only @powercen.com is a valid company email — an exact domain match
// (never a substring/contains check), so "user@otherpowercen.com" or
// "user@powercen.com.attacker.com" are correctly rejected. Re-checked here
// even though the request validator already enforces the same rule
// (auth.validator.js), since the service layer never trusts the validator
// alone as its only line of defense — matches this codebase's existing
// convention elsewhere (e.g. assertValidAssignee re-validating what the
// frontend already limits).
const COMPANY_EMAIL_PATTERN = /^[^\s@]+@powercen\.com$/i;

// Cryptographically random, single-use, time-limited — see
// PasswordResetToken in schema.prisma. 32 bytes (256 bits) of randomness
// hex-encoded is far beyond brute-force range; only its SHA-256 hash
// (utils/jwt.js#hashToken, the exact same helper RefreshToken already
// uses) is ever persisted, so a leaked database dump can't be replayed as
// a valid reset link — the raw token exists only in the one email sent.
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function msFromExpiry(expiresIn) {
  // Supports simple "15m" / "7d" style strings used by jsonwebtoken.
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) return 15 * 60 * 1000;
  const [, amount, unit] = match;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(amount, 10) * multipliers[unit];
}

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// The ONE shared shape every authenticated-user payload returns —
// POST /auth/login, POST /auth/refresh, and GET /auth/me all go through
// this instead of each building its own response, so a MANAGER/TEAMLEAD's
// department information can never drift between them. `user` must already
// include `role` (and, for the EMPLOYEE branch, the legacy `department`
// relation) exactly as every caller here already loads it.
// Overwrites the raw legacy `department` relation from `user` with the
// role-aware resolution (see userDepartmentAccessService#resolveUserDepartmentInfo)
// — a no-op for EMPLOYEE/ADMIN (same value), the actual fix for MANAGER/TEAMLEAD.
async function buildAuthenticatedUser(user) {
  const safe = sanitizeUser(user);
  const { department, departmentAccess } = await userDepartmentAccessService.resolveUserDepartmentInfo(user);
  return { ...safe, department, departmentAccess };
}

async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + msFromExpiry(env.jwt.refreshExpiresIn)),
    },
  });

  return { accessToken, refreshToken };
}

async function login(email, password) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true, department: true },
  });

  // Same error for "no such user" and "wrong password" — avoids leaking
  // which emails are registered.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }
  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated");
  }

  const tokens = await issueTokenPair(user);
  return { user: await buildAuthenticatedUser(user), ...tokens };
}

async function refresh(token) {
  if (!token) throw new ApiError(401, "Refresh token required");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new ApiError(401, "Refresh token has been revoked or expired");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true, department: true } });
  if (!user || !user.isActive) {
    throw new ApiError(401, "Account not found or deactivated");
  }

  // Rotate: revoke the used refresh token and issue a brand new pair. This
  // limits the blast radius if a refresh token is ever stolen/replayed.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const tokens = await issueTokenPair(user);

  return { user: await buildAuthenticatedUser(user), ...tokens };
}

async function logout(token) {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Current password is incorrect");
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Invalidate all existing sessions so a compromised token can't survive a
  // password change.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Always resolves with no thrown error and no return value the caller
// could use to distinguish outcomes — whether the email doesn't exist,
// belongs to a deactivated account, or genuinely got a reset email sent,
// the HTTP response is identical either way (see auth.controller.js). The
// only observable difference is whether an email actually arrives, which
// is exactly the intended, minimal information leak (any endpoint that
// sends email at all has this property — it's not something a stricter
// response shape could close).
async function forgotPassword(email) {
  if (!COMPANY_EMAIL_PATTERN.test(email)) return;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive) return;

  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const resetLink = `${env.clientUrl}/reset-password?token=${rawToken}`;

  // Never throws — a failed email send must not reveal anything different
  // to the caller than a successful one (see the function-level comment).
  try {
    const rendered = await emailTemplateService.renderTemplate("PASSWORD_RESET_REQUESTED", {
      recipientName: user.name,
      resetLink,
    });
    if (!rendered) return;
    const deliverTo = await emailService.resolveUserEmail(user.id);
    if (!deliverTo) return;
    await emailService.sendMail({ to: deliverTo, subject: rendered.subject, html: rendered.body });
  } catch (err) {
    console.error(`[auth] Failed to send password reset email to user ${user.id}:`, err.message);
  }
}

async function resetPassword(token, newPassword) {
  if (!token) throw new ApiError(400, "This password reset link is invalid or has expired.");

  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new ApiError(400, "This password reset link is invalid or has expired.");
  }

  // Same bcrypt hashing (cost factor 12) already used by every other
  // password write in this file (login's comparison target, changePassword)
  // — never a different/weaker mechanism for the reset path.
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
    // Single-use: marked consumed in the SAME transaction as the password
    // write, so the two can never diverge (e.g. a crash between them
    // leaving a "used" token whose password change never actually applied).
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    // Revoke every existing session, exactly like changePassword already
    // does — a stolen/leaked refresh token can't outlive a reset.
    prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

module.exports = { login, refresh, logout, changePassword, forgotPassword, resetPassword, sanitizeUser, buildAuthenticatedUser };
