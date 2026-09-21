const { body, param } = require("express-validator");

const createUserValidator = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  body("roleName").isIn(["ADMIN", "MANAGER", "USER"]).withMessage("Invalid role"),
  body("teamIds").optional().isArray().withMessage("teamIds must be an array"),
  body("departmentId").optional({ nullable: true }).isString(),
];

const updateUserValidator = [
  param("id").notEmpty(),
  body("name").optional().trim().notEmpty(),
  body("isActive").optional().isBoolean(),
  body("roleName").optional().isIn(["ADMIN", "MANAGER", "USER"]),
  body("teamIds").optional().isArray(),
  body("departmentId").optional({ nullable: true }).isString(),
];

const updateProfileValidator = [
  body("name").optional().trim().notEmpty(),
  body("avatarUrl").optional().isURL().withMessage("avatarUrl must be a valid URL"),
];

module.exports = { createUserValidator, updateUserValidator, updateProfileValidator };
