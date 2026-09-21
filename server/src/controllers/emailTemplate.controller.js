const emailTemplateService = require("../services/emailTemplate.service");

async function list(_req, res) {
  res.json({ success: true, data: await emailTemplateService.listTemplates() });
}

async function getById(req, res) {
  res.json({ success: true, data: await emailTemplateService.getTemplateById(req.params.id) });
}

async function update(req, res) {
  const template = await emailTemplateService.updateTemplate(req.user.id, req.params.id, req.body);
  res.json({ success: true, data: template });
}

// The set of {{placeholders}} the renderer supports — lets the Admin UI
// show/insert them without duplicating the list from emailTemplate.service.js.
async function placeholders(_req, res) {
  res.json({ success: true, data: emailTemplateService.listPlaceholders() });
}

module.exports = { list, getById, update, placeholders };
