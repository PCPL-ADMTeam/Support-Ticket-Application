const fs = require("fs");
const path = require("path");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { parsePagination, buildPagedResult } = require("../utils/pagination");
const { formatDepartmentTicketNumber } = require("../utils/ticketNumber");
const { recordAudit } = require("../utils/audit");
const notificationService = require("./notification.service");
const { sanitizeRichText } = require("../utils/sanitize");
const { findActiveDepartmentManager } = require("../utils/departmentManager");
const blobStorageService = require("./blobStorage.service");
const { uploadRoot } = require("../config/multer");

// A ticket may have at most this many attachments in total, enforced
// server-side (see createTicket and addAttachment below) so it can never
// be bypassed via a direct API call regardless of what the frontend does.
const MAX_ATTACHMENTS_PER_TICKET = 5;

// Early guard, checked BEFORE any Azure upload starts so an obviously
// over-limit request never wastes a network call. This is NOT the sole
// source of truth — addAttachment re-checks the count again immediately
// before the actual insert (inside the same transaction as the create) to
// narrow the window a concurrent upload for the same ticket could exploit
// between this call and that one. Full atomicity isn't practical here
// without a new row-locking primitive this codebase doesn't otherwise use
// anywhere (Azure's network round-trip has to happen between any
// "check" and the eventual insert, so it can never be a single atomic DB
// operation), so this is a best-effort narrowing, not a hard guarantee.
async function assertAttachmentLimit(ticketId, incomingCount) {
  const currentCount = await prisma.ticketAttachment.count({ where: { ticketId } });
  const remainingSlots = Math.max(MAX_ATTACHMENTS_PER_TICKET - currentCount, 0);
  if (incomingCount > remainingSlots) {
    throw new ApiError(
      400,
      `Maximum ${MAX_ATTACHMENTS_PER_TICKET} attachments are allowed per ticket. This ticket already has ${currentCount} attachment(s) and only ${remainingSlots} more can be uploaded.`
    );
  }
}

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

// Read-only variant of assertCanView, used ONLY by getTicketById. An AGENT
// who personally raised a ticket must still be able to open it after it's
// routed to (or transferred into) a different department — being the
// requester is sufficient to look at your own request's status/history,
// mirroring the USER-role rule just below. Deliberately NOT folded into
// assertCanView itself: that function also gates mutating actions
// (comments/attachments/status changes/transfer), which stay exactly
// department-scoped for an AGENT even on a ticket they raised elsewhere —
// acting on another department's ticket is a materially different,
// larger permission than merely viewing your own request's progress.
function assertCanViewForRead(user, ticket) {
  if (user.role.name === "AGENT" && ticket.requesterId === user.id) return;
  assertCanView(user, ticket);
}

// Internal (staff-only) notes are stripped out before a response reaches
// anyone who isn't actually staff FOR THIS TICKET's own department — a
// USER-role requester (unless also the assignee), or an AGENT viewing
// solely via the requester exception above (assertCanViewForRead) rather
// than as this ticket's own department manager. An AGENT who IS this
// ticket's department manager, or the person actually assigned to work
// it, still sees everything, exactly as before.
function scrubInternalComments(ticket, user) {
  const isAssignee = ticket.assigneeId === user.id;
  const isDepartmentStaff = user.role.name === "ADMIN" || (user.role.name === "AGENT" && ticket.toDepartmentId === user.departmentId);
  if (!isDepartmentStaff && !isAssignee) {
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

// Who may transfer a ticket to a different department — a deliberately
// separate check from updateTicket's isManagerOrAdmin: an ADMIN (who
// otherwise manages every ticket) is explicitly EXCLUDED from this specific
// action per the department-transfer business rule, and a USER may transfer
// only while they are the ticket's current assignee — not merely its
// requester, and not any USER in the department.
function assertCanTransferDepartment(user, ticket) {
  if (user.role.name === "ADMIN") {
    throw new ApiError(403, "Administrators cannot transfer a ticket's department.");
  }
  if (user.role.name === "AGENT") {
    if (user.departmentId && ticket.toDepartmentId === user.departmentId) return;
    throw new ApiError(403, "You can only transfer tickets belonging to your own department.");
  }
  if (ticket.assigneeId === user.id) return;
  throw new ApiError(403, "Only the department manager or the employee currently assigned to this ticket can transfer it.");
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

// "created"/"assigned" are self-sufficient authorization rules on their
// own — requesterId/assigneeId always equals the authenticated caller's
// own id, server-derived, never client-supplied — so they REPLACE the
// normal role-based scopeWhereForUser rather than being ANDed with it.
// This matters specifically for AGENT: scopeWhereForUser restricts an
// AGENT to their own department, but "tickets I raised" (the Agent
// dashboard/portal's "My Tickets" view) must include tickets raised to
// OTHER departments too — ANDing the two would incorrectly hide those.
// For ADMIN/USER this produces the exact same result as the old AND-based
// version: ADMIN's scopeWhereForUser is unrestricted, and a USER's own
// requesterId/assigneeId is already a subset of their existing
// requesterId-OR-assigneeId scope. Shared with dashboard.service.js so
// both mean exactly the same thing for the same scope value — no
// duplicate/divergent filtering logic.
function scopeWhereForTab(user, scope) {
  if (scope === "assigned") return { assigneeId: user.id };
  if (scope === "created") return { requesterId: user.id };
  // "mine" = raised by me OR assigned to me, as ONE query (never a summed
  // pair of separate counts) so a ticket matching both is never double
  // counted — the exact same OR shape scopeWhereForUser already uses for a
  // USER's own default scope, just made explicitly selectable via `scope`
  // for any role (most usefully AGENT, whose own default scope is
  // department-based and unrelated to requesterId/assigneeId).
  if (scope === "mine") return { OR: [{ requesterId: user.id }, { assigneeId: user.id }] };
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
  assertCanViewForRead(user, ticket);
  return scrubInternalComments(ticket, user);
}

async function createTicket(user, payload, files = []) {
  // Checked first, before any other validation or async work — a brand
  // new ticket has zero existing attachments, so this is simply "the whole
  // bundled batch must fit," and it must reject the entire request before
  // a single file is uploaded to Azure (never a partial upload of some of
  // the 6+ files submitted).
  if (files.length > MAX_ATTACHMENTS_PER_TICKET) {
    throw new ApiError(400, `Maximum ${MAX_ATTACHMENTS_PER_TICKET} attachments are allowed per ticket.`);
  }

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

    await recordHistory(tx, { ticketId: created.id, userId: user.id, action: "CREATED" });

    // Ticket numbers are stable identifiers set only at creation — never
    // regenerated by later status/assignee/department/priority changes.
    return tx.ticket.findUnique({ where: { id: created.id }, include: ticketDetailInclude });
  });

  // Attachments are uploaded to Azure (and their metadata saved) AFTER the
  // transaction above commits — the blob naming convention
  // (attachments/<ticketId>/...) needs the ticket's real id, which doesn't
  // exist until the ticket row does, and network calls have no place
  // inside a DB transaction anyway. Each file is independent and
  // best-effort: a single failed upload is logged but does not undo the
  // ticket that was already successfully created, the same "a secondary
  // side-effect failing must not roll back the primary action" philosophy
  // already used for notification failures elsewhere in this file.
  for (const file of files) {
    await addAttachment(user, ticket.id, file).catch((err) => {
      console.error(`[tickets] Failed to save attachment "${file.originalname}" for new ticket ${ticket.id}:`, err.message);
    });
  }
  const finalTicket = files.length > 0 ? await prisma.ticket.findUnique({ where: { id: ticket.id }, include: ticketDetailInclude }) : ticket;

  // ONE email, not two: TO the destination department's manager (they need
  // to review/assign it), CC the requester (a receipt that it was raised).
  // If the department currently has no active manager, fall back to a
  // solo confirmation TO the requester — there's no valid "reviewer" to
  // address it to, but the requester should still know their ticket was
  // recorded (handles "no manager" safely without silently sending
  // nothing).
  if (manager) {
    await notificationService.notify({
      eventKey: "TICKET_CREATED",
      userId: manager.id,
      ticketId: finalTicket.id,
      type: "TICKET_CREATED",
      ticket: finalTicket,
      ccUserIds: [user.id],
    });
  } else {
    await notificationService.notify({
      eventKey: "TICKET_CREATED",
      userId: user.id,
      ticketId: finalTicket.id,
      type: "TICKET_CREATED",
      ticket: finalTicket,
    });
  }

  // A ticket created with an assignee already attached (e.g. an Admin
  // pre-assigning at creation) follows the SAME recipient rule as a normal
  // post-creation assignment (see notifyOnUpdate's ASSIGNED handling
  // below): TO the assignee, CC the manager (unconditionally — a standing
  // departmental record, not a "you did this" notice). The requester is
  // NOT CC'd here since the requester IS always the actor for this call
  // (createTicket's caller is always the requester) — they already get
  // their own separate TICKET_CREATED confirmation above.
  if (finalTicket.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: finalTicket.assigneeId } });
    if (assignee) {
      await notificationService.notify({
        eventKey: "TICKET_ASSIGNED",
        userId: assignee.id,
        ticketId: finalTicket.id,
        type: "TICKET_ASSIGNED",
        ticket: finalTicket,
        ccUserIds: manager?.id ? [manager.id] : [],
      });
    }
  }

  return finalTicket;
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
    // "Assign to Me" — a separate, narrow path from the generic assigneeId
    // field just below. It is the ONLY way a ticket's assigneeId can ever
    // become the ACTING caller's own id: never derived from a client-
    // supplied assigneeId (which stays restricted to active USER
    // employees via assertValidAssignee, unchanged in the branch below), so
    // an Agent can never use the raw assigneeId field to self-assign or to
    // assign to some OTHER Agent — only this explicit, self-only flag, and
    // only for an AGENT (ADMIN isn't a department worker and has no
    // "assign to me" UI action). assertCanView already guarantees an AGENT
    // caller here is this ticket's own department manager.
    if (payload.assignToMe === true) {
      if (user.role.name !== "AGENT") {
        throw new ApiError(403, "Only a department manager can assign a ticket to themselves.");
      }
      if (ticket.assigneeId !== user.id) {
        data.assigneeId = user.id;
        historyEntries.push({ action: "ASSIGNED", fieldName: "assigneeId", oldValue: ticket.assigneeId, newValue: user.id });
      }
    } else if (payload.assigneeId !== undefined && payload.assigneeId !== ticket.assigneeId) {
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

// Picks the first id in `candidates` that isn't `excludeId` (the actor) —
// used throughout below to find "who is the primary TO recipient," falling
// back through a priority list (e.g. assignee, then manager) when the
// first choice IS the actor or doesn't exist.
function firstOther(candidates, excludeId) {
  return candidates.find((id) => id && id !== excludeId);
}

// Builds a deduped CC id list: every candidate except falsy ones, the
// actor, and whichever id was already chosen as TO. notify() itself also
// drops unresolvable/inactive/duplicate-email addresses, so this only
// needs to dedupe by id.
function ccExcluding(candidates, ...exclude) {
  const excluded = new Set(exclude.filter(Boolean));
  return [...new Set(candidates.filter((id) => id && !excluded.has(id)))];
}

async function notifyOnUpdate(before, after, historyEntries, actor) {
  // Distinguishes a ticket's first-ever assignment from a later reassignment
  // — purely to pick the right event key; who gets notified is unchanged.
  const wasAlreadyAssigned = Boolean(before.assigneeId);

  for (const entry of historyEntries) {
    // --- Status changes (OPEN/IN_PROGRESS/ON_HOLD/RESOLVED/CLOSED) -------
    // One consolidated email per transition, never one-per-recipient (the
    // previous per-recipient loop could CC the department manager multiple
    // times on the same status change — once per TO recipient). REOPENED
    // has its own, different recipient shape (see below) since the
    // relevant "who needs to act" answer is the assignee, not the
    // requester.
    if (entry.action === "STATUS_CHANGE" && entry.newValue !== "REOPENED") {
      const to = firstOther([after.requesterId], actor.id);
      if (to) {
        await notificationService.notify({
          eventKey: statusEventKey(entry.newValue),
          userId: to,
          ticketId: after.id,
          type: "STATUS_CHANGED",
          ticket: after,
          statusChange: { oldValue: entry.oldValue, newValue: entry.newValue },
          ccUserIds: ccExcluding([after.assigneeId, after.managerId], actor.id, to),
        });
      }
    }

    // --- Reopened ----------------------------------------------------
    // TO the current assignee (the person who needs to act on it again);
    // if unassigned, TO the department manager instead (someone needs to
    // re-triage it). CC the manager (if not already TO) and the requester
    // (unless the requester is the one who reopened it).
    if (entry.action === "STATUS_CHANGE" && entry.newValue === "REOPENED") {
      const to = firstOther([after.assigneeId, after.managerId], actor.id);
      if (to) {
        await notificationService.notify({
          eventKey: "TICKET_REOPENED",
          userId: to,
          ticketId: after.id,
          type: "STATUS_CHANGED",
          ticket: after,
          statusChange: { oldValue: entry.oldValue, newValue: entry.newValue },
          ccUserIds: ccExcluding([after.managerId, after.requesterId], actor.id, to),
        });
      }
    }

    // --- Assignment ----------------------------------------------------
    // Self-assignment ("Assign to Me") is a dedicated event handled in its
    // own block below — never reuses this one, and is excluded here via
    // `entry.newValue !== actor.id`.
    //
    // The manager is CC'd unconditionally — even when the manager IS the
    // one who performed the assignment. This is deliberately different
    // from every other event below: being CC'd here is a standing
    // departmental record of who's now handling a ticket in the manager's
    // own department, not a "you just did this" notice, so it's not
    // excluded by the usual actor-exclusion rule. The requester, by
    // contrast, IS excluded when they happen to be the one performing the
    // assignment (only possible if the requester also holds a staff role)
    // — for them a CC really would just be "you did this."
    if (entry.action === "ASSIGNED" && after.assigneeId && entry.newValue === after.assigneeId && entry.newValue !== actor.id) {
      const ccIds = [after.managerId, firstOther([after.requesterId], actor.id)].filter(Boolean);
      await notificationService.notify({
        eventKey: wasAlreadyAssigned ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED",
        userId: after.assigneeId,
        ticketId: after.id,
        type: "TICKET_ASSIGNED",
        ticket: after,
        ccUserIds: [...new Set(ccIds)],
      });
    }

    // Self-assignment ("Assign to Me") — a dedicated event, distinct from
    // the normal manager-assigns-employee TICKET_ASSIGNED/TICKET_REASSIGNED
    // above. TO the requester only: never "assigned to you" wording sent to
    // the actor themselves, and never CC'd back to the actor either — the
    // actor IS this ticket's department manager (assignToMe's own
    // AGENT-only + assertCanView gate guarantees it), so CC-ing "the
    // manager" here would just be CC-ing the actor on their own action,
    // which is exactly what must never happen. Skipped entirely if the
    // requester happens to be the actor themselves (self-raised AND
    // self-assigned — nothing meaningful to tell them).
    if (entry.action === "ASSIGNED" && entry.newValue === actor.id && after.requesterId && after.requesterId !== actor.id) {
      await notificationService.notify({
        eventKey: "TICKET_SELF_ASSIGNED",
        userId: after.requesterId,
        ticketId: after.id,
        type: "TICKET_ASSIGNED",
        ticket: after,
      });
    }

    // --- Requester edited their own ticket's content --------------------
    // The requester is ALWAYS the actor for this event (only reachable via
    // canRequesterEditDetails), so they are never notified about their own
    // edit. TO the current assignee if one exists (they're the one working
    // it), CC the manager; if unassigned, TO the manager instead (someone
    // needs to see the change since nobody's actively assigned yet).
    if (entry.action === "TICKET_DETAILS_UPDATED") {
      const to = after.assigneeId || after.managerId || null;
      if (to) {
        const ccIds = to === after.assigneeId ? ccExcluding([after.managerId], to) : [];
        await notificationService.notify({
          eventKey: "TICKET_UPDATED",
          userId: to,
          ticketId: after.id,
          type: "TICKET_UPDATED",
          ticket: after,
          ccUserIds: ccIds,
        });
      }
    }
  }
}

// Moves a ticket to a different department — a separate action from
// updateTicket's generic toDepartmentId field (which is ADMIN/AGENT-only
// and does NOT touch manager/assignee). This is the only path that: (a)
// lets an assigned USER move their own ticket, and (b) automatically
// re-derives the manager and clears the assignee, since the old assignee
// belongs to the old department and the new department's manager must
// review and re-assign it themselves.
async function transferDepartment(user, ticketId, { toDepartmentId, transferReason }) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { toDepartment: { select: { id: true, name: true } } },
  });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);
  assertCanTransferDepartment(user, ticket);

  const reason = (transferReason || "").trim();
  if (!reason) throw new ApiError(400, "Transfer reason is required.");

  if (!toDepartmentId) throw new ApiError(400, "Destination department is required.");
  if (toDepartmentId === ticket.toDepartmentId) {
    throw new ApiError(400, "This ticket is already routed to that department.");
  }

  // Department has no separate `isActive` flag in this schema — every
  // department row that exists is, by definition, usable (a department can
  // only ever be hard-deleted, and only once nothing references it — see
  // department.service.js#deleteDepartment). "Active" is therefore
  // satisfied by simple existence, exactly like createTicket's own
  // toDepartment lookup.
  const destinationDepartment = await prisma.department.findUnique({ where: { id: toDepartmentId } });
  if (!destinationDepartment) throw new ApiError(400, "Invalid destination department.");

  // The manager is never client-chosen — always whichever active AGENT is
  // flagged as the destination department's manager, exactly like
  // createTicket's own manager lookup. A department with nobody currently
  // holding that role cannot receive a transferred ticket at all.
  const newManager = await findActiveDepartmentManager(toDepartmentId);
  if (!newManager) {
    throw new ApiError(400, "The selected department does not have an active manager and cannot receive transferred tickets.");
  }

  const oldDepartmentName = ticket.toDepartment?.name || "Unassigned";

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        toDepartmentId,
        managerId: newManager.id,
        // The old assignee belongs to the OLD department and must never
        // remain assigned once the ticket routes elsewhere — the new
        // department's manager reviews the ticket and assigns it themselves.
        assigneeId: null,
      },
      include: ticketDetailInclude,
    });

    await recordHistory(tx, {
      ticketId,
      userId: user.id,
      action: "DEPARTMENT_TRANSFERRED",
      fieldName: "toDepartmentId",
      oldValue: oldDepartmentName,
      newValue: destinationDepartment.name,
    });
    // Kept as its own permanent row — same pattern as RESOLUTION_NOTES/
    // ON_HOLD_REASON/CLOSED_REASON — so the reason text is never lost even
    // though only the before/after department lives on the
    // DEPARTMENT_TRANSFERRED entry itself.
    await recordHistory(tx, {
      ticketId,
      userId: user.id,
      action: "TRANSFER_REASON",
      fieldName: "transferReason",
      newValue: reason,
    });

    return result;
  });

  // Dedicated event — never reuses TICKET_UPDATED. TO the destination
  // manager (a real Notification + email, same as every other "primary
  // recipient" call elsewhere in this file); CC the requester as an FYI
  // only. The OLD department's manager is never CC'd (there is no implicit
  // "current department manager" auto-CC anymore — every recipient here is
  // explicit), and the actor is never emailed merely for having performed
  // the transfer.
  await notificationService.notify({
    eventKey: "TICKET_DEPARTMENT_TRANSFERRED",
    userId: newManager.id,
    ticketId: updated.id,
    type: "TICKET_DEPARTMENT_TRANSFERRED",
    ticket: updated,
    ccUserIds: [updated.requesterId],
    departmentTransfer: { oldDepartmentName, reason },
  });

  return scrubInternalComments(updated, user);
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

  // Public comments notify the other party; internal notes never leave
  // staff (skipped entirely below — no email for anyone). Three distinct
  // cases, checked in priority order so an actor who is BOTH the requester
  // AND staff (an Agent commenting on their own ticket) is treated as the
  // requester case, not the staff case:
  if (!isInternal) {
    const isActorRequester = user.id === ticket.requesterId;
    const isActorStaff = user.role.name === "ADMIN" || user.role.name === "AGENT";
    const managerId = ticket.managerId;

    if (isActorRequester) {
      // CASE A: requester comments -> TO the assignee; CC the manager. If
      // unassigned, TO the manager instead (so a comment on an unassigned
      // ticket still reaches someone rather than nobody).
      const to = ticket.assigneeId || managerId;
      if (to) {
        await notificationService.notify({
          eventKey: "TICKET_COMMENT_ADDED",
          userId: to,
          ticketId,
          type: "NEW_COMMENT",
          ticket,
          comment,
          ccUserIds: to === ticket.assigneeId ? ccExcluding([managerId], to) : [],
        });
      }
    } else if (isActorStaff) {
      // CASE C: manager/staff comments -> TO both the requester and the
      // current assignee (if one exists and differs from the actor), each
      // as their OWN primary recipient — never CC'd to each other, and CC
      // nobody else.
      const toIds = ccExcluding([ticket.requesterId, ticket.assigneeId], user.id);
      for (const to of toIds) {
        await notificationService.notify({
          eventKey: "TICKET_COMMENT_ADDED",
          userId: to,
          ticketId,
          type: "NEW_COMMENT",
          ticket,
          comment,
        });
      }
    } else {
      // CASE B: assignee comments -> TO the requester; CC the manager.
      await notificationService.notify({
        eventKey: "TICKET_COMMENT_ADDED",
        userId: ticket.requesterId,
        ticketId,
        type: "NEW_COMMENT",
        ticket,
        comment,
        ccUserIds: ccExcluding([managerId], ticket.requesterId),
      });
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

// Uploads the file's bytes to Azure Blob Storage first, then saves its
// metadata to Postgres. If the DB write fails after a successful Azure
// upload, the blob is deleted so a failed request never leaves an orphan
// blob behind (there is nothing in Postgres pointing at it to clean up
// later otherwise).
async function addAttachment(user, ticketId, file, commentId = null) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);

  // Early guard — never spend an Azure upload on a request that's already
  // obviously over the limit.
  await assertAttachmentLimit(ticketId, 1);

  // New uploads are organized by the ticket's human-readable ticketNumber
  // (e.g. "BI-001") rather than its internal id — purely a Blob folder
  // naming choice; TicketAttachment.ticketId below still always stores
  // Ticket.id, and this has no effect on already-uploaded attachments,
  // whose stored filePath (under the old <ticketId> folder) is reused
  // as-is by streamAttachment/deleteAttachment.
  const blobName = await blobStorageService.uploadBuffer({
    blobFolder: ticket.ticketNumber,
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
  });

  try {
    // Re-checked immediately before the insert (inside the same
    // transaction as the create) to narrow the window a concurrent upload
    // for this same ticket could otherwise exploit between the guard above
    // and this point. If it fails here, this falls into the same catch
    // block as a genuine DB error below, so the just-uploaded blob is
    // cleaned up exactly the same way either way — a race that trips this
    // check never leaves an orphan blob behind.
    return await prisma.$transaction(async (tx) => {
      const currentCount = await tx.ticketAttachment.count({ where: { ticketId } });
      if (currentCount >= MAX_ATTACHMENTS_PER_TICKET) {
        throw new ApiError(
          400,
          `Maximum ${MAX_ATTACHMENTS_PER_TICKET} attachments are allowed per ticket. This ticket already has ${currentCount} attachment(s) and only 0 more can be uploaded.`
        );
      }
      return tx.ticketAttachment.create({
        data: {
          ticketId,
          commentId,
          uploadedById: user.id,
          fileName: file.originalname,
          filePath: blobName,
          storageProvider: "azure",
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      });
    });
  } catch (err) {
    await blobStorageService.deleteBlob(blobName).catch((cleanupErr) => {
      console.error(`[tickets] Failed to clean up orphaned blob ${blobName} after a failed DB write:`, cleanupErr.message);
    });
    throw err;
  }
}

// Streams an attachment's bytes to the HTTP response after verifying the
// requester can actually see this ticket — the same assertCanView() every
// other ticket read/write in this file already goes through. This is what
// replaces the old public `express.static("/uploads")` mount (see app.js):
// that served any file by its random filename to anyone with the URL, with
// no authorization check at all. Azure-stored attachments (storageProvider
// "azure") stream from Blob Storage; attachments uploaded before this
// migration (storageProvider "local") still stream from server/uploads/ —
// nothing about those was migrated or deleted.
async function streamAttachment(user, ticketId, attachmentId, res) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);

  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.ticketId !== ticketId) throw new ApiError(404, "Attachment not found");

  res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.fileName)}"`);

  if (attachment.storageProvider === "azure") {
    const downloadResponse = await blobStorageService.downloadBlobStream(attachment.filePath);
    downloadResponse.readableStreamBody.pipe(res);
  } else {
    const localPath = path.join(uploadRoot, attachment.filePath);
    fs.createReadStream(localPath).on("error", () => {
      if (!res.headersSent) res.status(404);
      res.end();
    }).pipe(res);
  }
}

// Only the person who uploaded an attachment, or staff managing this
// ticket (same isManagerOrAdmin used throughout updateTicket), may remove
// it — mirrors the existing uploader-or-handler pattern addComment already
// uses for internal notes. Azure deletion happens BEFORE the Postgres row
// is removed, and its failure is never swallowed: if the blob can't be
// deleted, the DB record is deliberately left in place (a dangling
// reference to a blob nobody can find is far worse than a metadata row for
// a blob that still safely exists) and the error propagates to the caller.
async function deleteAttachment(user, ticketId, attachmentId) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket);

  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.ticketId !== ticketId) throw new ApiError(404, "Attachment not found");

  const isManagerOrAdmin = user.role.name === "ADMIN" || user.role.name === "AGENT";
  if (attachment.uploadedById !== user.id && !isManagerOrAdmin) {
    throw new ApiError(403, "You can only delete attachments you uploaded");
  }

  if (attachment.storageProvider === "azure") {
    await blobStorageService.deleteBlob(attachment.filePath);
  } else {
    const localPath = path.join(uploadRoot, attachment.filePath);
    await fs.promises.unlink(localPath).catch((err) => {
      if (err.code !== "ENOENT") console.error(`[tickets] Failed to remove local attachment file ${localPath}:`, err.message);
    });
  }

  await prisma.ticketAttachment.delete({ where: { id: attachmentId } });
}

module.exports = {
  listTickets,
  getTicketById,
  createTicket,
  updateTicket,
  transferDepartment,
  addComment,
  addAttachment,
  streamAttachment,
  deleteAttachment,
  bulkUpdate,
  scopeWhereForUser,
  scopeWhereForTab,
};
