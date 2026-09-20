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

// Department managers (AGENT) and Admins need this to populate the ticket
// assignee picker — it returns eligible USER employees, not agents.
router.get("/assignable-agents", requireRole("ADMIN", "AGENT"), userController.assignableEmployees);

// Everything else is Admin-only user management.
router.use(requireRole("ADMIN"));

// CloudReady/Entra corporate directory — for mapping a Helpdesk USER to
// their Entra account. Placed before "/:id" so "entra-directory" isn't
// swallowed by that param route.
router.get("/entra-directory", userController.entraDirectory);

router.get("/", userController.list);
router.get("/:id", userController.getById);
router.post("/", createUserValidator, validate, userController.create);
router.patch("/:id", updateUserValidator, validate, userController.update);
router.delete("/:id", userController.deactivate);

// Real hard delete. Kept as a distinct path from "/:id" above (which is
// already the existing deactivate/soft-delete action) so neither behavior
// has to change.
router.delete("/:id/permanent", userController.remove);

module.exports = router;
