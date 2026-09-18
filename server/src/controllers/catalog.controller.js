// Controllers for the small admin "catalog" resources: categories,
// priorities, and SLA policies. Grouped together since each is a thin
// CRUD wrapper around its service.
const categoryService = require("../services/category.service");
const priorityService = require("../services/priority.service");

const categories = {
  list: async (_req, res) => res.json({ success: true, data: await categoryService.listCategories() }),
  create: async (req, res) => {
    const category = await categoryService.createCategory(req.user.id, req.body);
    res.status(201).json({ success: true, data: category });
  },
  update: async (req, res) => {
    const category = await categoryService.updateCategory(req.user.id, req.params.id, req.body);
    res.json({ success: true, data: category });
  },
  remove: async (req, res) => {
    await categoryService.deleteCategory(req.user.id, req.params.id);
    res.json({ success: true, message: "Category deleted" });
  },
};

const priorities = {
  list: async (_req, res) => res.json({ success: true, data: await priorityService.listPriorities() }),
  create: async (req, res) => {
    const priority = await priorityService.createPriority(req.user.id, req.body);
    res.status(201).json({ success: true, data: priority });
  },
  update: async (req, res) => {
    const priority = await priorityService.updatePriority(req.user.id, req.params.id, req.body);
    res.json({ success: true, data: priority });
  },
  upsertSla: async (req, res) => {
    const policy = await priorityService.upsertSlaPolicy(req.user.id, req.params.id, req.body);
    res.json({ success: true, data: policy });
  },
};

module.exports = { categories, priorities };
