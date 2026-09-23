const authService = require("../services/auth.service");
const env = require("../config/env");
const { findActiveDepartmentManager } = require("../utils/departmentManager");

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax",
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Refresh token is stored as an httpOnly cookie (not readable by client JS,
// so an XSS bug can't exfiltrate it). Access token goes in the JSON body
// for the frontend to hold in memory and attach as a Bearer header.
function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
}

async function login(req, res) {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login(email, password);
  setRefreshCookie(res, refreshToken);
  res.json({ success: true, data: { user, accessToken } });
}

async function refresh(req, res) {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  const { user, accessToken, refreshToken } = await authService.refresh(token);
  setRefreshCookie(res, refreshToken);
  res.json({ success: true, data: { user, accessToken } });
}

async function logout(req, res) {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/v1/auth" });
  res.json({ success: true, message: "Logged out" });
}

// A regular USER doesn't manage anyone, but the Profile view benefits from
// showing who DOES manage their department — an AGENT is that manager
// themselves (nothing to look up) and an ADMIN has no department, so the
// lookup only ever runs for USER accounts. Only name/email are exposed,
// never the manager's own id-linked internals.
async function me(req, res) {
  const safeUser = authService.sanitizeUser(req.user);

  let departmentManager = null;
  if (req.user.role?.name === "USER" && req.user.departmentId) {
    const manager = await findActiveDepartmentManager(req.user.departmentId);
    if (manager) departmentManager = { name: manager.name, email: manager.email };
  }

  res.json({ success: true, data: { ...safeUser, departmentManager } });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.json({ success: true, message: "Password updated successfully" });
}

// Identical response regardless of whether the email exists, is inactive,
// or actually received a reset email — authService.forgotPassword() never
// throws and never returns anything this handler could branch on, so
// there is no code path here that could leak account existence.
async function forgotPassword(req, res) {
  await authService.forgotPassword(req.body.email);
  res.json({
    success: true,
    message: "If an account exists for this email address, a password reset link has been sent.",
  });
}

async function resetPassword(req, res) {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  res.json({ success: true, message: "Your password has been reset successfully." });
}

module.exports = { login, refresh, logout, me, changePassword, forgotPassword, resetPassword };
