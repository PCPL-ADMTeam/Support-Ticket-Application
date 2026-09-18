const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require("../utils/jwt");

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
  return { user: sanitizeUser(user), ...tokens };
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

  return { user: sanitizeUser(user), ...tokens };
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

module.exports = { login, refresh, logout, changePassword, sanitizeUser };
