const { Router } = require("express");
const emailTemplates = require("../../controllers/emailTemplate.controller");
const authenticate = require("../../middleware/auth");
const requireRole = require("../../middleware/rbac");
const validate = require("../../middleware/validate");
const { updateEmailTemplateValidator } = require("../../validators/emailTemplate.validator");

// Admin-only: viewing/editing the WHAT of ticket emails (see
// emailTemplate.service.js). No create/delete — only the 8 seeded rows
// should ever exist, keyed by the fixed eventKeys ticket.service.js emits.
const router = Router();
router.use(authenticate);
router.use(requireRole("ADMIN"));

// Before "/:id" so "placeholders" isn't swallowed as an id.
router.get("/placeholders", emailTemplates.placeholders);

router.get("/", emailTemplates.list);
router.get("/:id", emailTemplates.getById);
router.patch("/:id", updateEmailTemplateValidator, validate, emailTemplates.update);

module.exports = router;
