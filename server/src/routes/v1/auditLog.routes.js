const { Router } = require("express");
const authenticate = require("../../middleware/auth");
const requireRole = require("../../middleware/rbac");
const auditLogService = require("../../services/auditLog.service");

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/", async (req, res) => {
  res.json({ success: true, ...(await auditLogService.listAuditLogs(req.query)) });
});

module.exports = router;
