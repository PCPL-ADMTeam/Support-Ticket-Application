const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { parsePagination, buildPagedResult } = require("../utils/pagination");
const { formatDepartmentTicketNumber } = require("../utils/ticketNumber");
const { recordAudit } = require("../utils/audit");
const notificationService = require("./notification.service");
const { sanitizeRichText } = require("../utils/sanitize");
const { findActiveDepartmentManager } = require("../utils/departmentManager");

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

// Row-level authorization: what tickets can this user even see/act on.
// ADMIN -> everything. AGENT (department manager) -> every ticket routed to
// their department. USER -> tickets they raised, or that they've been
// assigned to work on. Used both for list filtering and single-ticket checks.
function scopeWhereForUser(user) {
  if (user.role.name === "ADMIN") return {};
  if (user.role.name === "AGENT") {
    // No department => no tickets, rather than matching everything.
    return user.departmentId ? { toDepartmentId: user.departmentId } : { id: "" };
  }
  return { OR: [{ requesterId: user.id }, { assigneeId: user.id }] };
}

function assertCanView(user, ticket) {
  if (user.role.name === "ADMIN") return;
  if (user.role.name === "AGENT") {
    if (user.departmentId && ticket.toDepartmentId === user.departmentId) return;
    throw new ApiError(403, "This ticket does not belong to your department");
  }
  if (ticket.requesterId === user.id || ticket.assigneeId === user.id) return;
  throw new ApiError(403, "You can only view tickets you raised or are assigned to");
}

// Internal (staff-only) notes are stripped out before a response reaches
// the ticket's requester — unless that same person is also the assignee
// actually working the ticket, they still need to see the manager's notes.
function scrubInternalComments(ticket, user) {
  const isAssignee = ticket.assigneeId === user.id;
  if (user.role.name === "USER" && !isAssignee) {
    return { ...ticket, comments: ticket.comments.filter((c) => !c.isInternal) };
  }
  return ticket;
}

// A ticket's assignee must be an active USER employee belonging to the
// ticket's own (to-)department — never an ADMIN, never an AGENT manager,
// never someone from an unrelated department.
async function assertValidAssignee(assigneeId, departmentId) {
  if (!assigneeId) return;
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, include: { role: true } });
  if (!assignee || !assignee.isActive || assignee.role.name !== "USER" || assignee.departmentId !== departmentId) {
    throw new ApiError(400, "Invalid assignee — must be an active employee in this ticket's department");
  }
}

// A ticket's manager must be an active AGENT department-manager belonging
// to the ticket's own destination department — mirrors assertValidAssignee
// above, just for the manager/AGENT role instead of the assignee/USER role,
// and mirrors the exact criteria createTicket's own manager lookup already
// uses (role AGENT, isManager true, isActive true, departmentId match).
// managerId is normally always server-derived at creation time and is
// never client-chosen; this is only reached when an ADMIN explicitly
// overrides it via PATCH (see updateTicket), so a department with no
// legitimate manager simply has no valid managerId to set — there is no
// separate fallback to invent here.
async function assertValidManager(managerId, departmentId) {
  if (!managerId) return;
  const manager = await prisma.user.findUnique({ where: { id: managerId }, include: { role: true } });
  if (!manager || !manager.isActive || manager.role.name !== "AGENT" || !manager.isManager || manager.departmentId !== departmentId) {
    throw new ApiError(400, "Invalid manager — must be an active department manager (AGENT) for this ticket's department");
  }
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
      // Dashboard-driven "Raised by Me" / "Assigned to Me" list scope
      // (mirrors dashboard.service.js's scopeWhereForTab for stats) — ANDed
      // onto scopeWhereForUser above, never a replacement for it, so
      // ?scope=assigned can only ever narrow within a caller's own
      // authorized tickets, never expand it. For a USER this is what makes
      // "requesterId=me OR assigneeId=me" collapse down to exactly one side
      // when the dashboard asks for it.
      query.scope === "created" ? { requesterId: user.id } : query.scope === "assigned" ? { assigneeId: user.id } : {},
      query.status ? { status: query.status } : {},
      query.priorityId ? { priorityId: query.priorityId } : {},
      query.categoryId ? { categoryId: query.categoryId } : {},
      query.assigneeId ? { assigneeId: query.assigneeId } : {},
      query.teamId ? { teamId: query.teamId } : {},
      // Additive narrowing filters only — every clause here is ANDed onto
      // scopeWhereForUser(user) above, never OR'd or used in place of it, so
      // a client passing e.g. ?departmentId=<another department> can only
      // ever shrink their own authorized result set (to zero, if it doesn't
      // match), never expand it beyond what scopeWhereForUser already
      // allows. Same reasoning applies to every filter in this array.
      query.departmentId ? { toDepartmentId: query.departmentId } : {},
      query.issueId ? { issueId: query.issueId } : {},
      query.assigned === "true" ? { assigneeId: { not: null } } : query.assigned === "false" ? { assigneeId: null } : {},
      query.overdue === "true" ? { dueAt: { lt: new Date() }, status: { notIn: ["RESOLVED", "CLOSED"] } } : {},
      query.dateFrom ? { createdAt: { gte: new Date(query.dateFrom) } } : {},
      query.dateTo ? { createdAt: { lte: new Date(query.dateTo) } } : {},
      // Global search — covers ticket number/title/description plus the
      // requester/assignee/department/issue it's linked to, per relation,
      // so "search requester name" etc. means "search among MY authorized
      // tickets for one whose requester matches" rather than searching the
      // User table directly. Still ANDed onto scopeWhereForUser above, so
      // it can never surface a ticket outside the caller's own scope no
      // matter what free-text is entered.
      query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { ticketNumber: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { requester: { name: { contains: query.search, mode: "insensitive" } } },
              { requester: { email: { contains: query.search, mode: "insensitive" } } },
              { assignee: { name: { contains: query.search, mode: "insensitive" } } },
              { assignee: { email: { contains: query.search, mode: "insensitive" } } },
              { toDepartment: { name: { contains: query.search, mode: "insensitive" } } },
              { issue: { name: { contains: query.search, mode: "insensitive" } } },
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
  const { title, description, categoryId, priorityId, teamId, assigneeId, toDepartmentId, issueId, customIssueText } = payload;

  const fromDepartmentId = user.departmentId;
  if (!fromDepartmentId) {
    throw new ApiError(400, "Your account has no department assigned. Contact an administrator.");
  }

  const [priority, category, toDepartment, manager, issue] = await Promise.all([
    prisma.priority.findUnique({ where: { id: priorityId } }),
    categoryId ? prisma.category.findUnique({ where: { id: categoryId } }) : Promise.resolve(null),
    prisma.department.findUnique({ where: { id: toDepartmentId } }),
    // The manager is never client-chosen — it's whichever AGENT is flagged
    // as this department's manager (Admin-configured via the Users page).
    // A department with no manager yet simply routes with managerId=null;
    // we never fall back to a manager from a different department.
    findActiveDepartmentManager(toDepartmentId),
    prisma.issue.findUnique({ where: { id: issueId } }),
  ]);
  if (!priority) throw new ApiError(400, "Invalid priority");
  if (categoryId && !category) throw new ApiError(400, "Invalid category");
  if (!toDepartment) throw new ApiError(400, "Invalid department");
  if (!issue || !issue.isActive || issue.departmentId !== toDepartmentId) {
    throw new ApiError(400, "Invalid issue for this department");
  }
  if (issue.isOther && !customIssueText?.trim()) {
    throw new ApiError(400, "Please describe the custom issue");
  }
  await assertValidAssignee(assigneeId, toDepartmentId);

  const dueAt = await computeDueAt(priorityId);

  const ticket = await prisma.$transaction(async (tx) => {
    // Department-wise ticket numbering: atomically increment the
    // destination department's own sequence — a single
    // UPDATE ... SET "ticketSequence" = "ticketSequence" + 1 is row-locked
    // by Postgres for the duration of this transaction, so two concurrent
    // ticket creations for the SAME department can never read/use the same
    // number (no MAX()+1 race). If anything later in this transaction
    // fails, the whole transaction — including this increment — rolls
    // back, so a failed creation never "burns" a number or desyncs the
    // sequence.
    const departmentForNumbering = await tx.department.update({
      where: { id: toDepartmentId },
      data: { ticketSequence: { increment: 1 } },
      select: { ticketPrefix: true, ticketSequence: true },
    });
    const ticketNumber = formatDepartmentTicketNumber(departmentForNumbering.ticketPrefix, departmentForNumbering.ticketSequence);

    const created = await tx.ticket.create({
      data: {
        ticketNumber,
        title,
        description: sanitizeRichText(description),
        categoryId: categoryId || null,
        priorityId,
        requesterId: user.id,
        assigneeId: assigneeId || null,
        teamId: teamId || null,
        fromDepartmentId,
        toDepartmentId,
        managerId: manager?.id || null,
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

    await recordHistory(tx, { ticketId: created.id, userId: user.id, action: "CREATED" });

    // Ticket numbers are stable identifiers set only at creation — never
    // regenerated by later status/assignee/department/priority changes.
    return tx.ticket.findUnique({ where: { id: created.id }, include: ticketDetailInclude });
  });

  await notificationService.notify({
    eventKey: "TICKET_CREATED",
    userId: user.id,
    ticketId: ticket.id,
    type: "TICKET_CREATED",
    ticket,
  });

  if (manager) {
    await notificationService.notify({
      eventKey: "TICKET_CREATED",
      userId: manager.id,
      ticketId: ticket.id,
      type: "TICKET_CREATED",
      ticket,
    });
  }

  if (ticket.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: ticket.assigneeId } });
    if (assignee) {
      await notificationService.notify({
        eventKey: "TICKET_ASSIGNED",
        userId: assignee.id,
        ticketId: ticket.id,
        type: "TICKET_ASSIGNED",
        ticket,
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
  const isAssignee = ticket.assigneeId === user.id;
  // ADMIN and the department's AGENT manager can fully manage a ticket
  // (reassign, change priority/department/manager/etc). The USER actually
  // assigned to work the ticket may drive it through its status workflow
  // but never reassign or change its routing.
  const isManagerOrAdmin = user.role.name === "ADMIN" || user.role.name === "AGENT";
  const canDriveWorkflow = isManagerOrAdmin || isAssignee;

  // The requester may edit the ORIGINAL content of a ticket they raised
  // (priority/issue/description/title) — never merely because they're the
  // assignee, and never once the ticket has reached a terminal state
  // (mirrors the same RESOLVED/CLOSED gate the owner-reopen rule below
  // already uses). This is a separate authorization path from
  // isManagerOrAdmin, converging on the same handful of "content" fields
  // further down — never on assignment/routing/status, which stay
  // exclusively behind isManagerOrAdmin or canDriveWorkflow.
  const canRequesterEditDetails = isOwner && !["RESOLVED", "CLOSED"].includes(ticket.status);
  // Distinguishes "the requester used their edit-my-own-ticket path" from
  // "a manager/admin changed priority via the existing Edit Ticket dialog"
  // — only the former should produce the new TICKET_DETAILS_UPDATED history
  // marker/email; the latter's existing behavior (silent priority-only
  // update, no email) must stay exactly as it was before this change.
  const isRequesterEditPath = !isManagerOrAdmin && canRequesterEditDetails;

  const data = {};
  const historyEntries = [];
  let requesterContentChanged = false;

  if (payload.status !== undefined && payload.status !== ticket.status) {
    // The requester may only reopen their own resolved/closed ticket — every
    // other status transition requires managing the ticket (manager/admin)
    // or being the employee actually assigned to work it.
    if (!canDriveWorkflow) {
      if (!(isOwner && payload.status === "REOPENED" && ["RESOLVED", "CLOSED"].includes(ticket.status))) {
        throw new ApiError(403, "You are not allowed to change this ticket's status");
      }
    } else if (!VALID_TRANSITIONS[ticket.status]?.includes(payload.status)) {
      throw new ApiError(400, `Cannot transition from ${ticket.status} to ${payload.status}`);
    }

    // RESOLVED/ON_HOLD/CLOSED each require a persisted explanation —
    // enforced here server-side regardless of role or caller, so a direct
    // API request can never bypass it just because the frontend dialog
    // that normally collects it wasn't used. Validated before any part of
    // `data` is touched, so a rejected request leaves the ticket
    // completely unchanged.
    if (payload.status === "RESOLVED" && !payload.resolutionNotes?.trim()) {
      throw new ApiError(400, "Resolution notes are required when resolving a ticket.");
    }
    if (payload.status === "ON_HOLD" && !payload.onHoldReason?.trim()) {
      throw new ApiError(400, "On-hold reason is required.");
    }
    if (payload.status === "CLOSED" && !payload.closedReason?.trim()) {
      throw new ApiError(400, "Closed reason is required.");
    }

    data.status = payload.status;
    if (payload.status === "RESOLVED") {
      data.resolvedAt = new Date();
      data.resolutionNotes = payload.resolutionNotes.trim();
    }
    if (payload.status === "ON_HOLD") {
      data.onHoldReason = payload.onHoldReason.trim();
    }
    if (payload.status === "CLOSED") {
      data.closedAt = new Date();
      data.closedReason = payload.closedReason.trim();
    }
    if (payload.status === "REOPENED") {
      data.resolvedAt = null;
      data.closedAt = null;
    }
    historyEntries.push({ action: "STATUS_CHANGE", fieldName: "status", oldValue: ticket.status, newValue: payload.status });

    // Distinct, permanent history entries for the reason text itself — kept
    // separate from STATUS_CHANGE (which just records the transition) so
    // reopening a ticket later never loses or overwrites this record; each
    // occurrence is its own immutable TicketHistory row (see the comment on
    // Ticket.resolutionNotes/onHoldReason/closedReason in schema.prisma —
    // only the LATEST reason is kept on the ticket itself, but every past
    // occurrence remains here).
    if (payload.status === "RESOLVED") {
      historyEntries.push({ action: "RESOLUTION_NOTES", fieldName: "resolutionNotes", newValue: data.resolutionNotes });
    }
    if (payload.status === "ON_HOLD") {
      historyEntries.push({ action: "ON_HOLD_REASON", fieldName: "onHoldReason", newValue: data.onHoldReason });
    }
    if (payload.status === "CLOSED") {
      historyEntries.push({ action: "CLOSED_REASON", fieldName: "closedReason", newValue: data.closedReason });
    }
  }

  if (isManagerOrAdmin) {
    if (payload.assigneeId !== undefined && payload.assigneeId !== ticket.assigneeId) {
      const targetDepartmentId = payload.toDepartmentId !== undefined ? payload.toDepartmentId : ticket.toDepartmentId;
      await assertValidAssignee(payload.assigneeId, targetDepartmentId);
      data.assigneeId = payload.assigneeId || null;
      historyEntries.push({ action: "ASSIGNED", fieldName: "assigneeId", oldValue: ticket.assigneeId, newValue: payload.assigneeId });
    }
    if (payload.teamId !== undefined && payload.teamId !== ticket.teamId) {
      data.teamId = payload.teamId || null;
      historyEntries.push({ action: "TEAM_CHANGE", fieldName: "teamId", oldValue: ticket.teamId, newValue: payload.teamId });
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
      // Only an Administrator may manually override a ticket's manager.
      // The department's manager is otherwise always server-derived (see
      // createTicket's manager lookup) — an AGENT sits inside this same
      // isManagerOrAdmin block for status/priority/assignee/etc, but must
      // not be able to arbitrarily reassign a ticket's manager (e.g. to
      // themselves), so that specific field is carved out to ADMIN-only
      // here rather than being gated by isManagerOrAdmin like the rest.
      if (user.role.name !== "ADMIN") {
        throw new ApiError(403, "Only an Administrator can change a ticket's manager");
      }
      const targetDepartmentId = payload.toDepartmentId !== undefined ? payload.toDepartmentId : ticket.toDepartmentId;
      await assertValidManager(payload.managerId, targetDepartmentId);
      data.managerId = payload.managerId || null;
      historyEntries.push({ action: "MANAGER_CHANGE", fieldName: "managerId", oldValue: ticket.managerId, newValue: payload.managerId });
    }
  }

  // Content fields — priority, issue, description, title. Editable by
  // staff (isManagerOrAdmin, exactly as before for priority/issue) OR by
  // the requester editing their own still-open ticket
  // (canRequesterEditDetails). Assignment/routing/status are NEVER part of
  // this block — those stay exclusively above, gated by isManagerOrAdmin /
  // canDriveWorkflow, so a requester can never use this path to reassign,
  // reroute, or change status.
  if (isManagerOrAdmin || canRequesterEditDetails) {
    if (payload.priorityId !== undefined && payload.priorityId !== ticket.priorityId) {
      data.priorityId = payload.priorityId;
      data.dueAt = await computeDueAt(payload.priorityId, ticket.createdAt);
      historyEntries.push({ action: "PRIORITY_CHANGE", fieldName: "priorityId", oldValue: ticket.priorityId, newValue: payload.priorityId });
      if (isRequesterEditPath) requesterContentChanged = true;
    }
    if (payload.issueId !== undefined && payload.issueId !== ticket.issueId) {
      // The issue must still belong to this ticket's own destination
      // department — never trusted from the client, mirrors
      // assertValidAssignee's department check and createTicket's own
      // issue validation. Accounts for toDepartmentId also changing in the
      // same request (staff-only), same pattern assertValidAssignee uses.
      const targetDepartmentId = payload.toDepartmentId !== undefined ? payload.toDepartmentId : ticket.toDepartmentId;
      const newIssue = await prisma.issue.findUnique({ where: { id: payload.issueId } });
      if (!newIssue || !newIssue.isActive || newIssue.departmentId !== targetDepartmentId) {
        throw new ApiError(400, "Invalid issue for this ticket's department");
      }
      if (newIssue.isOther && !(payload.customIssueText ?? ticket.customIssueText)?.trim()) {
        throw new ApiError(400, "Please describe the custom issue");
      }
      data.issueId = payload.issueId;
      historyEntries.push({ action: "ISSUE_CHANGE", fieldName: "issueId", oldValue: ticket.issueId, newValue: payload.issueId });
      if (isRequesterEditPath) requesterContentChanged = true;
    }
    if (payload.customIssueText !== undefined && payload.customIssueText !== ticket.customIssueText) {
      data.customIssueText = payload.customIssueText || null;
      if (isRequesterEditPath) requesterContentChanged = true;
    }
    // Title is computed client-side from the selected issue (or the custom
    // text for "Others"), exactly as createTicket already trusts it at
    // creation time — never re-derived server-side here either.
    if (payload.title !== undefined && payload.title.trim() && payload.title.trim() !== ticket.title) {
      data.title = payload.title.trim();
      if (isRequesterEditPath) requesterContentChanged = true;
    }
    if (payload.description !== undefined) {
      const cleanDescription = sanitizeRichText(payload.description);
      if (cleanDescription !== ticket.description) {
        data.description = cleanDescription;
        if (isRequesterEditPath) requesterContentChanged = true;
      }
    }
  }

  // One combined marker — "Ticket details updated by {requester}" — only
  // for the requester's own edit-my-ticket path, kept separate from
  // PRIORITY_CHANGE/ISSUE_CHANGE above so the existing staff Edit Ticket
  // flow (priority-only, no email) is completely unaffected by this
  // addition — its behavior before this change and after is identical.
  if (requesterContentChanged) {
    historyEntries.push({ action: "TICKET_DETAILS_UPDATED" });
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

// Maps a status transition to its specific event key where one exists
// (mirrors the RESOLVED/REOPENED special-casing that already existed),
// falling back to the generic status-changed event for everything else
// (OPEN/IN_PROGRESS/ON_HOLD).
function statusEventKey(newValue) {
  if (newValue === "RESOLVED") return "TICKET_RESOLVED";
  if (newValue === "REOPENED") return "TICKET_REOPENED";
  if (newValue === "CLOSED") return "TICKET_CLOSED";
  return "TICKET_STATUS_CHANGED";
}

async function notifyOnUpdate(before, after, historyEntries, actor) {
  const recipients = new Set([before.requesterId, before.assigneeId, after.assigneeId].filter((id) => id && id !== actor.id));
  // Distinguishes a ticket's first-ever assignment from a later reassignment
  // — purely to pick the right event key; who gets notified is unchanged.
  const wasAlreadyAssigned = Boolean(before.assigneeId);

  for (const entry of historyEntries) {
    for (const userId of recipients) {
      const recipient = await prisma.user.findUnique({ where: { id: userId } });
      if (!recipient) continue;
      if (entry.action === "STATUS_CHANGE") {
        await notificationService.notify({
          eventKey: statusEventKey(entry.newValue),
          userId,
          ticketId: after.id,
          type: "STATUS_CHANGED",
          ticket: after,
          statusChange: { oldValue: entry.oldValue, newValue: entry.newValue },
        });
      }
      if (entry.action === "ASSIGNED" && userId === after.assigneeId) {
        await notificationService.notify({
          eventKey: wasAlreadyAssigned ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED",
          userId,
          ticketId: after.id,
          type: "TICKET_ASSIGNED",
          ticket: after,
        });
      }
    }

    // Reopening specifically needs the department manager back in the loop
    // even though `recipients` above only ever tracks requester/assignee.
    if (entry.action === "STATUS_CHANGE" && entry.newValue === "REOPENED" && after.managerId && after.managerId !== actor.id && !recipients.has(after.managerId)) {
      await notificationService.notify({
        eventKey: "TICKET_REOPENED",
        userId: after.managerId,
        ticketId: after.id,
        type: "STATUS_CHANGED",
        ticket: after,
        statusChange: { oldValue: entry.oldValue, newValue: entry.newValue },
      });
    }

    // Requester edited their own ticket's content. Unlike `recipients`
    // above (which excludes the actor), the requester is always notified
    // here even though they're normally the one making this specific edit
    // — the same "confirm to the person who just acted" pattern
    // createTicket already uses for TICKET_CREATED. The assignee/manager
    // (if any, and not already the requester) get the same email as a
    // heads-up; a local Set dedupes so nobody is emailed twice even if
    // e.g. the requester also happens to be the assignee.
    if (entry.action === "TICKET_DETAILS_UPDATED") {
      const notified = new Set();
      for (const userId of [after.requesterId, after.assigneeId, after.managerId]) {
        if (!userId || notified.has(userId)) continue;
        notified.add(userId);
        await notificationService.notify({
          eventKey: "TICKET_UPDATED",
          userId,
          ticketId: after.id,
          type: "TICKET_UPDATED",
          ticket: after,
        });
      }
    }
  }
}

async function addComment(user, ticketId, { body, isInternal }) {
  // Includes the same relations as ticketListInclude so the comment-
  // notification email template has department/priority/issue to show,
  // not just the bare ticket row.
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: ticketListInclude });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);

  // Internal notes / "first response" credit go to whoever is actually
  // handling the ticket: the manager/admin, or the USER assigned to work it
  // (the assignee is never staff in this model, but plays the same role).
  const isHandler = user.role.name === "ADMIN" || user.role.name === "AGENT" || ticket.assigneeId === user.id;
  if (isInternal && !isHandler) {
    throw new ApiError(403, "Only the manager, admin, or assigned employee can add internal notes");
  }

  const cleanBody = sanitizeRichText(body);

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketComment.create({
      data: { ticketId, authorId: user.id, body: cleanBody, isInternal: Boolean(isInternal) },
      include: { author: { select: { id: true, name: true, role: { select: { name: true } } } } },
    });
    if (!ticket.firstResponseAt && isHandler) {
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
          eventKey: "TICKET_COMMENT_ADDED",
          userId: notifyUserId,
          ticketId,
          type: "NEW_COMMENT",
          ticket,
          comment,
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
