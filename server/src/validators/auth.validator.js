const { body } = require("express-validator");

const loginValidator = [
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

const changePasswordValidator = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters"),
];

// Exact domain match (never a "contains" check) — see
// auth.service.js#forgotPassword's COMPANY_EMAIL_PATTERN, which re-checks
// this same rule server-side regardless of what passes here.
const COMPANY_EMAIL_PATTERN = /^[^\s@]+@powercen\.com$/i;

const forgotPasswordValidator = [
  body("email")
    .isEmail().withMessage("A valid email is required")
    .normalizeEmail()
    .custom((value) => COMPANY_EMAIL_PATTERN.test(value))
    .withMessage("Please use your @powercen.com company email address"),
];

const resetPasswordValidator = [
  body("token").trim().notEmpty().withMessage("Reset token is required"),
  // Same minimum-length rule as changePasswordValidator's newPassword above
  // — the reset flow must never accept a weaker password than any other
  // password-setting path in the app.
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
];

module.exports = { loginValidator, changePasswordValidator, forgotPasswordValidator, resetPasswordValidator };
