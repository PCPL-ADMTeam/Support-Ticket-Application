const { Router } = require("express");
const authenticate = require("../../middleware/auth");
const dashboardService = require("../../services/dashboard.service");

const router = Router();
router.use(authenticate);

router.get("/stats", async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const scope = ["assigned", "created"].includes(req.query.scope) ? req.query.scope : undefined;
  const stats = await dashboardService.getStats(req.user, { dateFrom, dateTo, days, scope });
  res.json({ success: true, data: stats });
});

module.exports = router;
