const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../../controllers/auth.controller");
const authenticate = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const {
  loginValidator,
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require("../../validators/auth.validator");

const router = Router();

// Stricter limiter on login to slow down credential-stuffing / brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again later." },
});

// Tighter than loginLimiter — each hit sends a real email (or at minimum
// does a DB write), so this bounds both mailbox spam and unlimited
// reset-email requests for the same account. IP-based, same convention as
// loginLimiter above; the endpoint's own response is identical regardless
// of whether the limit is hit for a real or nonexistent account, so this
// never becomes a second way to enumerate accounts via timing/limits.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password reset requests. Try again later." },
});

// Bounds brute-force guessing of a valid reset token via repeated
// /reset-password attempts.
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Try again later." },
});

router.post("/login", loginLimiter, loginValidator, validate, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);
router.post(
  "/change-password",
  authenticate,
  changePasswordValidator,
  validate,
  authController.changePassword
);

// Neither requires authentication — a user who forgot their password is,
// by definition, not logged in. Both are otherwise ordinary POST routes;
// no ProtectedRoute-equivalent exists on the backend since Express routes
// aren't role-gated by default, only by explicit `authenticate` middleware
// (deliberately absent here).
router.post("/forgot-password", forgotPasswordLimiter, forgotPasswordValidator, validate, authController.forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPasswordValidator, validate, authController.resetPassword);

module.exports = router;
