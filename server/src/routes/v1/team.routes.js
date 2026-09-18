const { Router } = require("express");
const teamController = require("../../controllers/team.controller");
const authenticate = require("../../middleware/auth");
const requireRole = require("../../middleware/rbac");
const validate = require("../../middleware/validate");
const { teamValidator } = require("../../validators/team.validator");

const router = Router();
router.use(authenticate);

// Any authenticated user can view teams (used for filters, "team" labels).
router.get("/", teamController.list);
router.get("/:id", teamController.getById);

router.use(requireRole("ADMIN"));
router.post("/", teamValidator, validate, teamController.create);
router.patch("/:id", teamValidator, validate, teamController.update);
router.delete("/:id", teamController.remove);

module.exports = router;
