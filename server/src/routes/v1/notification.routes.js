const { Router } = require("express");
const notificationController = require("../../controllers/notification.controller");
const authenticate = require("../../middleware/auth");

const router = Router();
router.use(authenticate);

router.get("/", notificationController.list);
router.patch("/:id/read", notificationController.markRead);
router.patch("/read-all", notificationController.markAllRead);

module.exports = router;
