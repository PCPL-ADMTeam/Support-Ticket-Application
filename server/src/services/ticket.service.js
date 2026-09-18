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

function teamIdsOf(user) {
  return (user.teamMemberships || []).map((m) => m.teamId);
}

// Row-level authorization: what tickets can this user even see/act on.
// ADMIN -> everything. AGENT -> assigned to them or their team. USER -> only
// tickets they raised. Used both for list filtering and single-ticket checks.
function scopeWhereForUser(user) {
  if (user.role.name === "ADMIN") return {};
  if (user.role.name === "AGENT") {
    return { OR: [{ assigneeId: user.id }, { teamId: { in: teamIdsOf(user) } }] };
  }
  return { requesterId: user.id };
}

function assertCanView(user, ticket) {
  if (user.role.name === "ADMIN") return;
  if (user.role.name === "AGENT") {
    if (ticket.assigneeId === user.id || teamIdsOf(user).includes(ticket.teamId)) return;
    throw new ApiError(403, "This ticket is not assigned to you or your team");
  }
  if (ticket.requesterId !== user.id) {
    throw new ApiError(403, "You can only view your own tickets");
  }
}

// Internal (agent-only) notes are stripped out before a response ever
// reaches an END USER, regardless of what the DB query returned.
function scrubInternalComments(ticket, user) {
  if (user.role.name === "USER") {
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

async function listTickets(user, query) {
  const { page, limit, skip, take } = parsePagination(query);

  const where = {
    AND: [
      scopeWhereForUser(user),
      query.status ? { status: query.status } : {},
      query.priorityId ? { priorityId: query.priorityId } : {},
      query.categoryId ? { categoryId: query.categoryId } : {},
      query.assigneeId ? { assigneeId: query.assigneeId } : {},
      query.teamId ? { teamId: query.teamId } : {},
      query.assigned === "true" ? { assigneeId: { not: null } } : {},
      query.overdue === "true" ? { dueAt: { lt: new Date() }, status: { notIn: ["RESOLVED", "CLOSED"] } } : {},
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
  const { title, description, categoryId, priorityId, teamId, assigneeId, toDepartmentId, managerId, issueId, customIssueText } = payload;

  const fromDepartmentId = user.departmentId;
  if (!fromDepartmentId) {
    throw new ApiError(400, "Your account has no department assigned. Contact an administrator.");
  }

  const [priority, category, toDepartment, manager, issue] = await Promise.all([
    prisma.priority.findUnique({ where: { id: priorityId } }),
    categoryId ? prisma.category.findUnique({ where: { id: categoryId } }) : Promise.resolve(null),
    prisma.department.findUnique({ where: { id: toDepartmentId } }),
    prisma.user.findUnique({ where: { id: managerId } }),
    prisma.issue.findUnique({ where: { id: issueId } }),
  ]);
  if (!priority) throw new ApiError(400, "Invalid priority");
  if (categoryId && !category) throw new ApiError(400, "Invalid category");
  if (!toDepartment) throw new ApiError(400, "Invalid department");
  if (!manager || !manager.isManager || manager.departmentId !== toDepartmentId) {
    throw new ApiError(400, "Invalid manager for this department");
  }
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
        assigneeId: assigneeId || null,
        teamId: teamId || null,
        fromDepartmentId,
        toDepartmentId,
        managerId,
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

  if (ticket.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: ticket.assigneeId } });
    if (assignee) {
      await notificationService.notify({
        userId: assignee.id,
        ticketId: ticket.id,
        type: "TICKET_ASSIGNED",
        title: `Ticket ${ticket.ticketNumber} assigned to you`,
        message: `"${ticket.title}" has been assigned to you.`,
        email: assignee.email,
      });
    }
  }

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
  const isStaff = user.role.name === "ADMIN" || user.role.name === "AGENT";

  const data = {};
  const historyEntries = [];

  if (payload.status !== undefined && payload.status !== ticket.status) {
    // End users may only reopen a resolved/closed ticket of their own — every
    // other status transition is staff-only.
    if (!isStaff) {
      if (!(isOwner && payload.status === "REOPENED" && ["RESOLVED", "CLOSED"].includes(ticket.status))) {
        throw new ApiError(403, "You are not allowed to change this ticket's status");
      }
    } else if (!VALID_TRANSITIONS[ticket.status]?.includes(payload.status)) {
      throw new ApiError(400, `Cannot transition from ${ticket.status} to ${payload.status}`);
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

  if (isStaff) {
    if (payload.assigneeId !== undefined && payload.assigneeId !== ticket.assigneeId) {
      data.assigneeId = payload.assigneeId || null;
      historyEntries.push({ action: "ASSIGNED", fieldName: "assigneeId", oldValue: ticket.assigneeId, newValue: payload.assigneeId });
    }
    if (payload.teamId !== undefined && payload.teamId !== ticket.teamId) {
      data.teamId = payload.teamId || null;
      historyEntries.push({ action: "TEAM_CHANGE", fieldName: "teamId", oldValue: ticket.teamId, newValue: payload.teamId });
    }
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
      data.toDepartmentId = payload.toDepartmentId || null;
      historyEntries.push({ action: "DEPARTMENT_CHANGE", fieldName: "toDepartmentId", oldValue: ticket.toDepartmentId, newValue: payload.toDepartmentId });
    }
    if (payload.managerId !== undefined && payload.managerId !== ticket.managerId) {
      data.managerId = payload.managerId || null;
      historyEntries.push({ action: "MANAGER_CHANGE", fieldName: "managerId", oldValue: ticket.managerId, newValue: payload.managerId });
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

  const isStaff = user.role.name === "ADMIN" || user.role.name === "AGENT";
  if (isInternal && !isStaff) {
    throw new ApiError(403, "Only agents/admins can add internal notes");
  }

  const cleanBody = sanitizeRichText(body);

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketComment.create({
      data: { ticketId, authorId: user.id, body: cleanBody, isInternal: Boolean(isInternal) },
      include: { author: { select: { id: true, name: true, role: { select: { name: true } } } } },
    });
    if (!ticket.firstResponseAt && isStaff) {
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

async function bulkUpdate(user, { ticketIds, status, priorityId, assigneeId, teamId }) {
  if (user.role.name !== "ADMIN") throw new ApiError(403, "Only Admins can perform bulk actions");
  if (!ticketIds?.length) throw new ApiError(400, "ticketIds is required");

  const data = {};
  if (status) data.status = status;
  if (priorityId) data.priorityId = priorityId;
  if (assigneeId !== undefined) data.assigneeId = assigneeId || null;
  if (teamId !== undefined) data.teamId = teamId || null;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.updateMany({ where: { id: { in: ticketIds } }, data });
    for (const ticketId of ticketIds) {
      await recordHistory(tx, { ticketId, userId: user.id, action: "BULK_UPDATE", newValue: JSON.stringify(data) });
    }
  });

  await recordAudit({ userId: user.id, action: "TICKET_BULK_UPDATE", entityType: "Ticket", newValues: { ticketIds, ...data } });
  return { updated: ticketIds.length };
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
  scopeWhereForUser,
};
