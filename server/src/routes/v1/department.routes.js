const { Router } = require("express");
const { departments, issues } = require("../../controllers/department.controller");
const authenticate = require("../../middleware/auth");
const requireRole = require("../../middleware/rbac");
const validate = require("../../middleware/validate");
const {
  departmentValidator,
  issueValidator,
  updateIssueValidator,
} = require("../../validators/department.validator");

const departmentRouter = Router();
departmentRouter.use(authenticate);
departmentRouter.get("/", departments.list); // readable by everyone (ticket form needs it)
departmentRouter.use(requireRole("ADMIN"));
departmentRouter.post("/", departmentValidator, validate, departments.create);
departmentRouter.patch("/:id", departmentValidator, validate, departments.update);
departmentRouter.delete("/:id", departments.remove);

const issueRouter = Router();
issueRouter.use(authenticate);
issueRouter.use(requireRole("ADMIN")); // issues are only ever read nested under GET /departments
issueRouter.post("/", issueValidator, validate, issues.create);
issueRouter.patch("/:id", updateIssueValidator, validate, issues.update);
issueRouter.delete("/:id", issues.remove);

module.exports = { departmentRouter, issueRouter };
