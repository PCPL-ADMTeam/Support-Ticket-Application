const { body, param, query } = require("express-validator");

const createTicketValidator = [
  body("title").trim().notEmpty().withMessage("Title is required").isLength({ max: 200 }),
  body("description").trim().notEmpty().withMessage("Description is required"),
  body("categoryId").notEmpty().withMessage("Category is required"),
  body("priorityId").notEmpty().withMessage("Priority is required"),
  body("assigneeId").optional({ nullable: true }).isString(),
  body("teamId").optional({ nullable: true }).isString(),
];

const updateTicketValidator = [
  param("id").notEmpty(),
  body("status").optional().isIn(["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"]),
  body("assigneeId").optional({ nullable: true }).isString(),
  body("teamId").optional({ nullable: true }).isString(),
  body("priorityId").optional().isString(),
  body("categoryId").optional().isString(),
];

const commentValidator = [
  param("id").notEmpty(),
  body("body").trim().notEmpty().withMessage("Comment body is required"),
  body("isInternal").optional().isBoolean(),
];

const bulkUpdateValidator = [
  body("ticketIds").isArray({ min: 1 }).withMessage("ticketIds must be a non-empty array"),
  body("status").optional().isIn(["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"]),
  body("priorityId").optional().isString(),
  body("assigneeId").optional({ nullable: true }).isString(),
  body("teamId").optional({ nullable: true }).isString(),
];

const listTicketsValidator = [
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
];

module.exports = {
  createTicketValidator,
  updateTicketValidator,
  commentValidator,
  bulkUpdateValidator,
  listTicketsValidator,
};
