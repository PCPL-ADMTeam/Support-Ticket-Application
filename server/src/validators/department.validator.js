const { body } = require("express-validator");

// Letters/digits only (no "-", spaces, or other separators — the "-" is
// added by the formatter when building the full ticket number), capped at
// a sane length so "HW-0001"-style IDs stay readable. A factory (not a
// shared chain instance) since express-validator's chains are mutable —
// create vs update need independently-configurable optionality.
function ticketPrefixRule() {
  return body("ticketPrefix")
    .trim()
    .isAlphanumeric()
    .withMessage("Ticket prefix must contain only letters and numbers")
    .isLength({ min: 1, max: 10 })
    .withMessage("Ticket prefix must be 1-10 characters");
}

const createDepartmentValidator = [
  body("name").trim().notEmpty().withMessage("Department name is required"),
  ticketPrefixRule(),
];

const updateDepartmentValidator = [
  body("name").optional().trim().notEmpty().withMessage("Department name is required"),
  ticketPrefixRule().optional(),
];

const issueValidator = [
  body("departmentId").notEmpty().withMessage("Department is required"),
  body("name").trim().notEmpty().withMessage("Issue name is required"),
  body("isOther").optional().isBoolean(),
];

const updateIssueValidator = [
  body("name").optional().trim().notEmpty(),
  body("isActive").optional().isBoolean(),
];

module.exports = { createDepartmentValidator, updateDepartmentValidator, issueValidator, updateIssueValidator };
