const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { parsePagination, buildPagedResult } = require("../utils/pagination");
const { formatTicketNumber } = require("../utils/ticketNumber");
const { recordAudit } = require("../utils/audit");
const notificationService = require("./notification.service");
const { sanitizeRichText } = require("../utils/sanitize");

const ticketListInclude = {
  category: { select: { id: true, name: true } },
  priority: { select: { id: true, name: true, level: true, color: true } },
  requester: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
  fromDepartment: { select: { id: true, name: true } },
  toDepartment: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true, email: true } },
  issue: { select: { id: true, name: true, isOther: true } },
};

const ticketDetailInclude = {
  ...ticketListInclude,
  comments: {
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, role: { select: { name: true } } } },
      attachments: true,
    },
  },
  attachments: { where: { commentId: null }, orderBy: { createdAt: "desc" } },
  history: {
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true } } },
  },
};

// A Manager only ever oversees the one department they were assigned to
// (Department.managerId) — mirrored on their own User.departmentId.
function isDeptManager(user, ticket) {
  return user.role.name === "MANAGER" && Boolean(user.departmentId) && ticket.toDepartmentId === user.departmentId;
}

function isAssignedUser(user, ticket) {
  return Boolean(ticket.assigneeId) && ticket.assigneeId === user.id;
}

// "Not just the plain requester" — Admins, the department Manager, and
// whoever the ticket is assigned to. Used to gate internal notes and their
// visibility, mirroring the old ADMIN/AGENT "isStaff" split.
function isPrivileged(user, ticket) {
  return user.role.name === "ADMIN" || isDeptManager(user, ticket) || isAssignedUser(user, ticket);
}

// Row-level authorization: what tickets can this user even see/act on.
// ADMIN -> everything. MANAGER -> every ticket routed to their department.
// USER -> tickets they raised OR were assigned. Used both for list
// filtering and single-ticket checks.
function scopeWhereForUser(user) {
  if (user.role.name === "ADMIN") return {};
  if (user.role.name === "MANAGER") {
    return { toDepartmentId: user.departmentId || "__none__" };
  }
  return { OR: [{ requesterId: user.id }, { assigneeId: user.id }] };
}

function assertCanView(user, ticket) {
  if (user.role.name === "ADMIN") return;
  if (user.role.name === "MANAGER") {
    if (ticket.toDepartmentId && ticket.toDepartmentId === user.departmentId) return;
    throw new ApiError(403, "This ticket is not in your department");
  }
  if (ticket.requesterId === user.id || ticket.assigneeId === user.id) return;
  throw new ApiError(403, "You can only view tickets you raised or are assigned to");
}

// Internal notes are stripped out before a response ever reaches a plain
// requester who isn't also the department Manager or the assignee.
function scrubInternalComments(ticket, user) {
  if (!isPrivileged(user, ticket)) {
    return { ...ticket, comments: ticket.comments.filter((c) => !c.isInternal) };
  }
  return ticket;
}

async function recordHistory(tx, { ticketId, userId, action, fieldName, oldValue, newValue }) {
  await tx.ticketHistory.create({
    data: { ticketId, userId, action, fieldName, oldValue: oldValue != null ? String(oldValue) : null, newValue: newValue != null ? String(newValue) : null },
  });
}

async function computeDueAt(priorityId, from = new Date()) {
  const policy = await prisma.slaPolicy.findUnique({ where: { priorityId } });
  if (!policy) return null;
  return new Date(from.getTime() + policy.resolutionTimeMinutes * 60000);
}

// Narrows the default row-level scope to just "created by me" or "assigned
// to me" for the My Tickets / Assigned Tickets tabs — used by the ticket
// list endpoint the same way dashboard.service.js scopes its stats tabs.
function scopeWhereForTab(user, scope) {
  if (scope === "created") return { requesterId: user.id };
  if (scope === "assigned") return { assigneeId: user.id };
  return scopeWhereForUser(user);
}

async function listTickets(user, query) {
  const { page, limit, skip, take } = parsePagination(query);

  const where = {
    AND: [
      scopeWhereForTab(user, query.scope),
      query.status ? { status: query.status } : {},
      query.priorityId ? { priorityId: query.priorityId } : {},
      query.categoryId ? { categoryId: query.categoryId } : {},
      query.assigneeId ? { assigneeId: query.assigneeId } : {},
      query.assigned === "true" ? { assigneeId: { not: null } } : {},
      query.unassigned === "true" ? { assigneeId: null } : {},
      query.overdue === "true" ? { dueAt: { lt: new Date() }, status: { notIn: ["RESOLVED", "CLOSED"] } } : {},
      // High/Critical = priority level 3+ (see seed.js priorityDefs) regardless of status.
      query.highCritical === "true" ? { priority: { level: { gte: 3 } } } : {},
      query.dateFrom ? { createdAt: { gte: new Date(query.dateFrom) } } : {},
      query.dateTo ? { createdAt: { lte: new Date(query.dateTo) } } : {},
      query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { ticketNumber: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const sortableFields = ["createdAt", "updatedAt", "dueAt", "status"];
  const sortBy = sortableFields.includes(query.sortBy) ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({ where, include: ticketListInclude, skip, take, orderBy: { [sortBy]: sortOrder } }),
    prisma.ticket.count({ where }),
  ]);

  return buildPagedResult(rows, total, { page, limit });
}

async function getTicketById(user, id) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: ticketDetailInclude });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);
  return scrubInternalComments(ticket, user);
}

async function createTicket(user, payload, files = []) {
  const { title, description, categoryId, priorityId, toDepartmentId, issueId, customIssueText } = payload;

  const fromDepartmentId = user.departmentId;
  if (!fromDepartmentId) {
    throw new ApiError(400, "Your account has no department assigned. Contact an administrator.");
  }

  const [priority, category, toDepartment, issue] = await Promise.all([
    prisma.priority.findUnique({ where: { id: priorityId } }),
    categoryId ? prisma.category.findUnique({ where: { id: categoryId } }) : Promise.resolve(null),
    prisma.department.findUnique({ where: { id: toDepartmentId }, include: { manager: true } }),
    prisma.issue.findUnique({ where: { id: issueId } }),
  ]);
  if (!priority) throw new ApiError(400, "Invalid priority");
  if (categoryId && !category) throw new ApiError(400, "Invalid category");
  if (!toDepartment) throw new ApiError(400, "Invalid department");
  // Every ticket routes to its department's single Manager, resolved here —
  // there is no manual manager picker anymore (see TicketForm.jsx).
  if (!toDepartment.manager) {
    throw new ApiError(400, "This department has no manager assigned yet. Contact an administrator.");
  }
  const manager = toDepartment.manager;
  if (!issue || !issue.isActive || issue.departmentId !== toDepartmentId) {
    throw new ApiError(400, "Invalid issue for this department");
  }
  if (issue.isOther && !customIssueText?.trim()) {
    throw new ApiError(400, "Please describe the custom issue");
  }

  const dueAt = await computeDueAt(priorityId);

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        ticketNumber: `PENDING-${Date.now()}`, // replaced below once `seq` is known
        title,
        description: sanitizeRichText(description),
        categoryId: categoryId || null,
        priorityId,
        requesterId: user.id,
        fromDepartmentId,
        toDepartmentId,
        managerId: manager.id,
        issueId,
        customIssueText: issue.isOther ? customIssueText.trim() : null,
        dueAt,
      },
    });

    for (const file of files) {
      await tx.ticketAttachment.create({
        data: {
          ticketId: created.id,
          uploadedById: user.id,
          fileName: file.originalname,
          filePath: file.filename,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      });
    }

    const withNumber = await tx.ticket.update({
      where: { id: created.id },
      data: { ticketNumber: formatTicketNumber(created.seq) },
      include: ticketDetailInclude,
    });

    await recordHistory(tx, { ticketId: created.id, userId: user.id, action: "CREATED" });
    return withNumber;
  });

  await notificationService.notify({
    userId: user.id,
    ticketId: ticket.id,
    type: "TICKET_CREATED",
    title: `Ticket ${ticket.ticketNumber} created`,
    message: `Your ticket "${ticket.title}" has been received and is now Open.`,
    email: user.email,
  });

  await notificationService.notify({
    userId: manager.id,
    ticketId: ticket.id,
    type: "TICKET_CREATED",
    title: `New ticket ${ticket.ticketNumber} for ${toDepartment.name}`,
    message: `"${ticket.title}" was raised for ${toDepartment.name} and routed to you.`,
    email: manager.email,
  });

  return ticket;
}

const VALID_TRANSITIONS = {
  OPEN: ["IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["ON_HOLD", "RESOLVED", "CLOSED"],
  ON_HOLD: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"],
};

async function updateTicket(user, id, payload) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: { requester: true, assignee: true } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);

  const isOwner = ticket.requesterId === user.id;
  const isAdmin = user.role.name === "ADMIN";
  const deptManager = isDeptManager(user, ticket);
  const assignedUser = isAssignedUser(user, ticket);

  const data = {};
  const historyEntries = [];

  if (payload.status !== undefined && payload.status !== ticket.status) {
    // The department Manager and Admin can drive any valid transition; the
    // assigned User progresses/resolves their own work the same way. A plain
    // requester may only reopen a resolved/closed ticket of their own.
    if (isAdmin || deptManager || assignedUser) {
      if (!VALID_TRANSITIONS[ticket.status]?.includes(payload.status)) {
        throw new ApiError(400, `Cannot transition from ${ticket.status} to ${payload.status}`);
      }
    } else if (!(isOwner && payload.status === "REOPENED" && ["RESOLVED", "CLOSED"].includes(ticket.status))) {
      throw new ApiError(403, "You are not allowed to change this ticket's status");
    }

    data.status = payload.status;
    if (payload.status === "RESOLVED") data.resolvedAt = new Date();
    if (payload.status === "CLOSED") data.closedAt = new Date();
    if (payload.status === "REOPENED") {
      data.resolvedAt = null;
      data.closedAt = null;
    }
    historyEntries.push({ action: "STATUS_CHANGE", fieldName: "status", oldValue: ticket.status, newValue: payload.status });
  }

  // Assigning/reassigning is the department Manager's core power (or
  // Admin's, unrestricted). The new assignee must be a User belonging to
  // the ticket's department — Admin may pick from anywhere.
  if (payload.assigneeId !== undefined && payload.assigneeId !== ticket.assigneeId) {
    if (!isAdmin && !deptManager) {
      throw new ApiError(403, "Only the department Manager or an Admin can assign this ticket");
    }
    if (payload.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: payload.assigneeId }, include: { role: true } });
      if (!assignee || assignee.role.name !== "USER") {
        throw new ApiError(400, "Tickets can only be assigned to a User");
      }
      if (!isAdmin && assignee.departmentId !== ticket.toDepartmentId) {
        throw new ApiError(400, "The assignee must belong to this ticket's department");
      }
    }
    data.assigneeId = payload.assigneeId || null;
    historyEntries.push({ action: "ASSIGNED", fieldName: "assigneeId", oldValue: ticket.assigneeId, newValue: payload.assigneeId });
  }

  // Priority, category and department/issue re-routing stay Admin-only —
  // "overall control" per the workflow spec.
  if (isAdmin) {
    if (payload.priorityId !== undefined && payload.priorityId !== ticket.priorityId) {
      data.priorityId = payload.priorityId;
      data.dueAt = await computeDueAt(payload.priorityId, ticket.createdAt);
      historyEntries.push({ action: "PRIORITY_CHANGE", fieldName: "priorityId", oldValue: ticket.priorityId, newValue: payload.priorityId });
    }
    if (payload.categoryId !== undefined && payload.categoryId !== ticket.categoryId) {
      data.categoryId = payload.categoryId;
      historyEntries.push({ action: "CATEGORY_CHANGE", fieldName: "categoryId", oldValue: ticket.categoryId, newValue: payload.categoryId });
    }
    if (payload.toDepartmentId !== undefined && payload.toDepartmentId !== ticket.toDepartmentId) {
      const newDept = payload.toDepartmentId
        ? await prisma.department.findUnique({ where: { id: payload.toDepartmentId }, include: { manager: true } })
        : null;
      if (payload.toDepartmentId && !newDept) throw new ApiError(400, "Invalid department");
      data.toDepartmentId = payload.toDepartmentId || null;
      // Re-routing to a new department re-resolves its manager too — there's
      // no manual manager picker (see TicketForm.jsx).
      data.managerId = newDept?.manager?.id || null;
      historyEntries.push({ action: "DEPARTMENT_CHANGE", fieldName: "toDepartmentId", oldValue: ticket.toDepartmentId, newValue: payload.toDepartmentId });
    }
    if (payload.issueId !== undefined && payload.issueId !== ticket.issueId) {
      data.issueId = payload.issueId || null;
      historyEntries.push({ action: "ISSUE_CHANGE", fieldName: "issueId", oldValue: ticket.issueId, newValue: payload.issueId });
    }
    if (payload.customIssueText !== undefined && payload.customIssueText !== ticket.customIssueText) {
      data.customIssueText = payload.customIssueText || null;
    }
  }

  if (Object.keys(data).length === 0) return getTicketById(user, id);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.update({ where: { id }, data, include: ticketDetailInclude });
    for (const entry of historyEntries) {
      await recordHistory(tx, { ticketId: id, userId: user.id, ...entry });
    }
    return result;
  });

  await notifyOnUpdate(ticket, updated, historyEntries, user);
  return scrubInternalComments(updated, user);
}

async function notifyOnUpdate(before, after, historyEntries, actor) {
  const recipients = new Set([before.requesterId, before.assigneeId, after.assigneeId].filter((id) => id && id !== actor.id));

  for (const entry of historyEntries) {
    for (const userId of recipients) {
      const recipient = await prisma.user.findUnique({ where: { id: userId } });
      if (!recipient) continue;
      if (entry.action === "STATUS_CHANGE") {
        await notificationService.notify({
          userId,
          ticketId: after.id,
          type: "STATUS_CHANGED",
          title: `Ticket ${after.ticketNumber} status changed`,
          message: `Status changed from ${entry.oldValue} to ${entry.newValue}.`,
          email: recipient.email,
        });
      }
      if (entry.action === "ASSIGNED" && userId === after.assigneeId) {
        await notificationService.notify({
          userId,
          ticketId: after.id,
          type: "TICKET_ASSIGNED",
          title: `Ticket ${after.ticketNumber} assigned to you`,
          message: `"${after.title}" has been assigned to you.`,
          email: recipient.email,
        });
      }
    }
  }
}

async function addComment(user, ticketId, { body, isInternal }) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);

  const privileged = isPrivileged(user, ticket);
  if (isInternal && !privileged) {
    throw new ApiError(403, "Only the department Manager, an Admin, or the assignee can add internal notes");
  }

  const cleanBody = sanitizeRichText(body);

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketComment.create({
      data: { ticketId, authorId: user.id, body: cleanBody, isInternal: Boolean(isInternal) },
      include: { author: { select: { id: true, name: true, role: { select: { name: true } } } } },
    });
    if (!ticket.firstResponseAt && privileged) {
      await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: new Date() } });
    }
    await recordHistory(tx, { ticketId, userId: user.id, action: "COMMENTED" });
    return created;
  });

  // Public comments notify the other party; internal notes never leave staff.
  if (!isInternal) {
    const notifyUserId = user.id === ticket.requesterId ? ticket.assigneeId : ticket.requesterId;
    if (notifyUserId) {
      const recipient = await prisma.user.findUnique({ where: { id: notifyUserId } });
      if (recipient) {
        await notificationService.notify({
          userId: notifyUserId,
          ticketId,
          type: "NEW_COMMENT",
          title: `New comment on ${ticket.ticketNumber}`,
          message: cleanBody.replace(/<[^>]+>/g, " ").trim().slice(0, 200),
          email: recipient.email,
        });
      }
    }
  }

  return comment;
}

async function bulkUpdate(user, { ticketIds, status, priorityId, assigneeId }) {
  if (user.role.name !== "ADMIN") throw new ApiError(403, "Only Admins can perform bulk actions");
  if (!ticketIds?.length) throw new ApiError(400, "ticketIds is required");

  const data = {};
  if (status) data.status = status;
  if (priorityId) data.priorityId = priorityId;
  if (assigneeId !== undefined) data.assigneeId = assigneeId || null;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.updateMany({ where: { id: { in: ticketIds } }, data });
    for (const ticketId of ticketIds) {
      await recordHistory(tx, { ticketId, userId: user.id, action: "BULK_UPDATE", newValue: JSON.stringify(data) });
    }
  });

  await recordAudit({ userId: user.id, action: "TICKET_BULK_UPDATE", entityType: "Ticket", newValues: { ticketIds, ...data } });
  return { updated: ticketIds.length };
}

async function deleteTicket(user, id) {
  if (user.role.name !== "ADMIN") throw new ApiError(403, "Only Admins can delete tickets");

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new ApiError(404, "Ticket not found");

  // Comments, attachments, history and notifications cascade-delete with the
  // ticket (see schema.prisma onDelete: Cascade on each relation).
  await prisma.ticket.delete({ where: { id } });

  await recordAudit({ userId: user.id, action: "TICKET_DELETE", entityType: "Ticket", entityId: id, oldValues: { ticketNumber: ticket.ticketNumber } });
}

async function addAttachment(user, ticketId, file, commentId = null) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);

  return prisma.ticketAttachment.create({
    data: {
      ticketId,
      commentId,
      uploadedById: user.id,
      fileName: file.originalname,
      filePath: file.filename,
      fileSize: file.size,
      mimeType: file.mimetype,
    },
  });
}

module.exports = {
  listTickets,
  getTicketById,
  createTicket,
  updateTicket,
  addComment,
  addAttachment,
  bulkUpdate,
  deleteTicket,
  scopeWhereForUser,
};
