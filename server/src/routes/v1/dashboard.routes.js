const { Router } = require("express");
const authenticate = require("../../middleware/auth");
const dashboardService = require("../../services/dashboard.service");

const router = Router();
router.use(authenticate);

router.get("/stats", async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  // Personal dashboard scopes — "created" = Raised by Me (requesterId = the
  // authenticated user), "assigned" = Assigned to Me (assigneeId = the
  // authenticated user). The user id always comes from req.user (set by the
  // `authenticate` middleware from the verified JWT) — there is no `userId`
  // query param, so a caller can never fetch another user's personal
  // dashboard. Omitting scope falls back to dashboardService's normal
  // role-based ticket visibility (see scopeWhereForUser in ticket.service).
  const scope = ["assigned", "created"].includes(req.query.scope) ? req.query.scope : undefined;
  const stats = await dashboardService.getStats(req.user, { dateFrom, dateTo, days, scope });
  res.json({ success: true, data: stats });
});

module.exports = router;
