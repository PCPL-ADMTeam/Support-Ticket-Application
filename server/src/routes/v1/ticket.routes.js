const { Router } = require("express");
const ticketController = require("../../controllers/ticket.controller");
const authenticate = require("../../middleware/auth");
const requireRole = require("../../middleware/rbac");
const validate = require("../../middleware/validate");
const { upload } = require("../../config/multer");
const {
  createTicketValidator,
  updateTicketValidator,
  commentValidator,
  bulkUpdateValidator,
  listTicketsValidator,
} = require("../../validators/ticket.validator");

const router = Router();
router.use(authenticate);

router.get("/", listTicketsValidator, validate, ticketController.list);
router.post("/", createTicketValidator, validate, ticketController.create);
router.post("/bulk", requireRole("ADMIN"), bulkUpdateValidator, validate, ticketController.bulkUpdate);
router.get("/:id", ticketController.getById);
router.patch("/:id", updateTicketValidator, validate, ticketController.update);

router.post("/:id/comments", commentValidator, validate, ticketController.addComment);
router.post("/:id/attachments", upload.single("file"), ticketController.uploadAttachment);

module.exports = router;
