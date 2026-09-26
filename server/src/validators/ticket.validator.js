const { body, param, query } = require("express-validator");

const createTicketValidator = [
  body("title").trim().notEmpty().withMessage("Title is required").isLength({ max: 200 }),
  body("description").trim().notEmpty().withMessage("Description is required"),
  body("categoryId").optional({ nullable: true }).isString(),
  body("priorityId").notEmpty().withMessage("Priority is required"),
  body("toDepartmentId").notEmpty().withMessage("Department is required"),
  // managerId is never taken from the client — it's derived server-side from
  // the selected department's active Team Lead/Manager (see
  // ticket.service#createTicket).
  body("issueId").notEmpty().withMessage("Issue is required"),
  body("customIssueText").optional({ nullable: true }).isString(),
  body("assigneeId").optional({ nullable: true }).isString(),
  body("teamId").optional({ nullable: true }).isString(),
];

const updateTicketValidator = [
  param("id").notEmpty(),
  body("status").optional().isIn(["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"]),
  body("assigneeId").optional({ nullable: true }).isString(),
  // "Assign to Me" — see ticket.service.js#updateTicket; when true, the
  // server derives the assignee from the authenticated caller and ignores
  // whatever assigneeId (if any) was also sent, so this is type-checked
  // only, never trusted as "who" to assign to.
  body("assignToMe").optional().isBoolean(),
  body("teamId").optional({ nullable: true }).isString(),
  body("priorityId").optional().isString(),
  body("categoryId").optional().isString(),
  body("toDepartmentId").optional({ nullable: true }).isString(),
  body("managerId").optional({ nullable: true }).isString(),
  body("issueId").optional({ nullable: true }).isString(),
  body("customIssueText").optional({ nullable: true }).isString(),
  // Requester-edit fields (ticket.service.js#updateTicket's
  // canRequesterEditDetails path) — title/description of a ticket the
  // caller raised themselves.
  body("title").optional().trim().notEmpty().isLength({ max: 200 }),
  body("description").optional().trim().notEmpty(),
  // Type-checked here; the actual "required when status is
  // RESOLVED/ON_HOLD/CLOSED" cross-field rule lives in
  // ticket.service.js#updateTicket, alongside the other business rules
  // that already depend on more than one payload field at once.
  body("resolutionNotes").optional().isString(),
  body("onHoldReason").optional().isString(),
  body("closedReason").optional().isString(),
];

const transferDepartmentValidator = [
  param("id").notEmpty(),
  body("toDepartmentId").notEmpty().withMessage("Destination department is required"),
  body("transferReason").trim().notEmpty().withMessage("Transfer reason is required"),
];

const commentValidator = [
  param("id").notEmpty(),
  // A comment is valid with text, attachments, or both — only rejected
  // when BOTH are absent. customSanitizer/custom (unlike .optional()) always
  // run regardless of whether `body` was sent at all, which an attachment-
  // only submission may not — an .optional() chain would silently skip this
  // check for exactly that case. req.files comes from multer (see
  // ticket.routes.js), which runs before this validator. This is the
  // fast-fail layer; ticket.service.js#addComment enforces the same rule
  // authoritatively.
  body("body")
    .customSanitizer((value) => (typeof value === "string" ? value.trim() : ""))
    .custom((value, { req }) => {
      const hasText = Boolean(value);
      const hasFiles = Boolean(req.files && req.files.length);
      if (!hasText && !hasFiles) {
        throw new Error("Comment must include text or at least one attachment");
      }
      return true;
    }),
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
  query("departmentId").optional().isString(),
  query("issueId").optional().isString(),
  query("scope").optional().isIn(["created", "assigned", "authorized"]),
];

module.exports = {
  createTicketValidator,
  updateTicketValidator,
  transferDepartmentValidator,
  commentValidator,
  bulkUpdateValidator,
  listTicketsValidator,
};
