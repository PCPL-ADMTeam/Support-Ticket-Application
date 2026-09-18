const { body } = require("express-validator");

const teamValidator = [
  body("name").trim().notEmpty().withMessage("Team name is required"),
  body("description").optional().trim(),
  body("memberIds").optional().isArray(),
];

module.exports = { teamValidator };
