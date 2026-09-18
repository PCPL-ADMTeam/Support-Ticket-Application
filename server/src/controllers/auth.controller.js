const authService = require("../services/auth.service");
const env = require("../config/env");

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

async function me(req, res) {
  res.json({ success: true, data: authService.sanitizeUser(req.user) });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.json({ success: true, message: "Password updated successfully" });
}

module.exports = { login, refresh, logout, me, changePassword };
