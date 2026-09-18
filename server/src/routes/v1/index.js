const { Router } = require("express");

const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const teamRoutes = require("./team.routes");
const { categoryRouter, priorityRouter } = require("./catalog.routes");
const ticketRoutes = require("./ticket.routes");
const dashboardRoutes = require("./dashboard.routes");
const notificationRoutes = require("./notification.routes");
const auditLogRoutes = require("./auditLog.routes");

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/teams", teamRoutes);
router.use("/categories", categoryRouter);
router.use("/priorities", priorityRouter);
router.use("/tickets", ticketRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
router.use("/audit-logs", auditLogRoutes);

module.exports = router;
