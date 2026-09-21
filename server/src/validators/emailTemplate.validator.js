const { body } = require("express-validator");

const updateEmailTemplateValidator = [
  body("name").optional().trim().notEmpty().withMessage("Name is required"),
  body("subject").optional().trim().notEmpty().withMessage("Subject is required"),
  // Free-form text — {{placeholders}} are just literal characters to the
  // validator; emailTemplate.service.js#renderTemplate handles substitution.
  body("body").optional().trim().notEmpty().withMessage("Body is required"),
  body("isActive").optional().isBoolean(),
  // eventKey is set only by prisma/seed.js and must never change via the
  // API — reject the request outright if a client tries to send it, rather
  // than silently ignoring it.
  body("eventKey").not().exists().withMessage("eventKey cannot be changed"),
];

module.exports = { updateEmailTemplateValidator };
