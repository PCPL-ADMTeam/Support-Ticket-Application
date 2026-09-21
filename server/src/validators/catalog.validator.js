const { body } = require("express-validator");

const priorityValidator = [
  body("name").trim().notEmpty().withMessage("Priority name is required"),
  body("level").isInt({ min: 1 }).withMessage("level must be a positive integer"),
  body("color").optional().isHexColor().withMessage("color must be a hex value, e.g. #FF0000"),
];

const slaPolicyValidator = [
  body("responseTimeMinutes").isInt({ min: 1 }).withMessage("responseTimeMinutes must be a positive integer"),
  body("resolutionTimeMinutes").isInt({ min: 1 }).withMessage("resolutionTimeMinutes must be a positive integer"),
];

module.exports = { priorityValidator, slaPolicyValidator };
