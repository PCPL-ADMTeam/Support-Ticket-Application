const { Router } = require("express");
const userController = require("../../controllers/user.controller");
const authenticate = require("../../middleware/auth");
const requireRole = require("../../middleware/rbac");
const validate = require("../../middleware/validate");
const {
  createUserValidator,
  updateUserValidator,
  updateProfileValidator,
} = require("../../validators/user.validator");

const router = Router();
router.use(authenticate);

// Any authenticated user can update their own profile.
router.patch("/me/profile", updateProfileValidator, validate, userController.updateProfile);

// Agents/Admins need this to populate assignee pickers.
router.get("/assignable-agents", requireRole("ADMIN", "AGENT"), userController.assignableAgents);

// Everything else is Admin-only user management.
router.use(requireRole("ADMIN"));
router.get("/", userController.list);
router.get("/:id", userController.getById);
router.post("/", createUserValidator, validate, userController.create);
router.patch("/:id", updateUserValidator, validate, userController.update);
router.delete("/:id", userController.deactivate);

module.exports = router;
