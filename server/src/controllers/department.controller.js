// Controllers for Department + its per-department Issue list — the ticket
// form's To Department / Manager / Issue dropdowns. Grouped together since
// Issue only ever exists scoped to a Department, same pairing style as
// catalog.controller.js (Category + Priority).
const departmentService = require("../services/department.service");
const issueService = require("../services/issue.service");

const departments = {
  list: async (_req, res) => res.json({ success: true, data: await departmentService.listDepartments() }),
  create: async (req, res) => {
    const department = await departmentService.createDepartment(req.user.id, req.body);
    res.status(201).json({ success: true, data: department });
  },
  update: async (req, res) => {
    const department = await departmentService.updateDepartment(req.user.id, req.params.id, req.body);
    res.json({ success: true, data: department });
  },
  remove: async (req, res) => {
    await departmentService.deleteDepartment(req.user.id, req.params.id);
    res.json({ success: true, message: "Department deleted" });
  },
};

const issues = {
  create: async (req, res) => {
    const issue = await issueService.createIssue(req.user.id, req.body);
    res.status(201).json({ success: true, data: issue });
  },
  update: async (req, res) => {
    const issue = await issueService.updateIssue(req.user.id, req.params.id, req.body);
    res.json({ success: true, data: issue });
  },
  remove: async (req, res) => {
    await issueService.deleteIssue(req.user.id, req.params.id);
    res.json({ success: true, message: "Issue deleted" });
  },
};

module.exports = { departments, issues };
