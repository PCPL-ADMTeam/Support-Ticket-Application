const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../../controllers/auth.controller");
const authenticate = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const { loginValidator, changePasswordValidator } = require("../../validators/auth.validator");

const router = Router();

// Stricter limiter on login to slow down credential-stuffing / brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again later." },
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

module.exports = router;
