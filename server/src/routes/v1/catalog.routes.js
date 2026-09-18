const { Router } = require("express");
const { categories, priorities } = require("../../controllers/catalog.controller");
const authenticate = require("../../middleware/auth");
const requireRole = require("../../middleware/rbac");
const validate = require("../../middleware/validate");
const {
  categoryValidator,
  priorityValidator,
  slaPolicyValidator,
} = require("../../validators/catalog.validator");

const categoryRouter = Router();
categoryRouter.use(authenticate);
categoryRouter.get("/", categories.list); // readable by everyone (ticket form needs it)
categoryRouter.use(requireRole("ADMIN"));
categoryRouter.post("/", categoryValidator, validate, categories.create);
categoryRouter.patch("/:id", categoryValidator, validate, categories.update);
categoryRouter.delete("/:id", categories.remove);

const priorityRouter = Router();
priorityRouter.use(authenticate);
priorityRouter.get("/", priorities.list); // readable by everyone (ticket form needs it)
priorityRouter.use(requireRole("ADMIN"));
priorityRouter.post("/", priorityValidator, validate, priorities.create);
priorityRouter.patch("/:id", priorityValidator, validate, priorities.update);
priorityRouter.put("/:id/sla", slaPolicyValidator, validate, priorities.upsertSla);

module.exports = { categoryRouter, priorityRouter };
