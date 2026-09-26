const fs = require("fs");
const path = require("path");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { parsePagination, buildPagedResult } = require("../utils/pagination");
const { formatDepartmentTicketNumber } = require("../utils/ticketNumber");
const { recordAudit } = require("../utils/audit");
const notificationService = require("./notification.service");
const { sanitizeRichText } = require("../utils/sanitize");
const userDepartmentAccessService = require("./userDepartmentAccess.service");
const { buildCreatedRecipients, buildStandardRecipients } = require("../utils/recipientBuilder");
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
  // The ticket's own department — with its CURRENT active management users
  // (both roles), not the single backward-compat `manager` above (which is
  // only ever set once at creation/transfer time and never updated if
  // access later changes) — this is what the ticket detail page's
  // "Managers" / "Team Leads" rows actually show.
  toDepartment: {
    select: {
      id: true,
      name: true,
      userAccess: {
        where: { user: { isActive: true } },
        select: { user: { select: { id: true, name: true, email: true, role: { select: { name: true } } } } },
      },
    },
  },
  // The ticket's Custom CC list — fixed at creation time (see createTicket)
  // and unaffected by later department transfers; surfaced here so the
  // detail page can show who else is being kept in the loop.
  ccUsers: { select: { user: { select: { id: true, name: true, email: true } } } },
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

// Both department-management roles ("MANAGER" and "TEAMLEAD") authorize
// identically against UserDepartmentAccess — the only difference between
// them is cardinality (a MANAGER may hold several rows, a TEAMLEAD exactly
// one) and email TO/CC priority (see utils/recipientBuilder.js), never the
// authorization shape itself. ADMIN and EMPLOYEE are never "management."
function isManagementRole(user) {
  return user.role.name === "MANAGER" || user.role.name === "TEAMLEAD";
}

// Every department this MANAGER/TEAMLEAD currently has a UserDepartmentAccess
// row for. Fetched ONCE per request by each top-level service function below
// and threaded through as a plain id array, rather than making
// scopeWhereForUser/assertCanView themselves async — those are called
// multiple times in some paths and are otherwise pure/synchronous.
// User.departmentId and User.isManager are never read for this decision
// anymore; they remain on User only for backward compatibility/history.
async function resolveUserDepartmentIds(user) {
  if (!isManagementRole(user)) return [];
  return userDepartmentAccessService.getUserDepartmentIds(user.id);
}

// Row-level authorization: what tickets can this user even see/act on.
// ADMIN -> everything (view only — see the operational checks further down
// for why ADMIN never reaches assign/reassign/transfer). MANAGER/TEAMLEAD ->
// every ticket routed to ANY department they currently have
// UserDepartmentAccess to (a TEAMLEAD's list always has exactly one entry; a
// MANAGER's may have several — this check is identical either way). EMPLOYEE
// -> tickets they raised, or that they've been assigned to work on. Used
// both for list filtering and single-ticket checks.
function scopeWhereForUser(user, userDepartmentIds = []) {
  if (user.role.name === "ADMIN") return {};
  if (isManagementRole(user)) {
    // No accessible department => no tickets, rather than matching everything.
    return userDepartmentIds.length ? { toDepartmentId: { in: userDepartmentIds } } : { id: "" };
  }
  return { OR: [{ requesterId: user.id }, { assigneeId: user.id }] };
}

function assertCanView(user, ticket, userDepartmentIds = []) {
  if (user.role.name === "ADMIN") return;
  if (isManagementRole(user)) {
    if (ticket.toDepartmentId && userDepartmentIds.includes(ticket.toDepartmentId)) return;
    throw new ApiError(403, "You do not have access to this ticket's department");
  }
  if (ticket.requesterId === user.id || ticket.assigneeId === user.id) return;
  throw new ApiError(403, "You can only view tickets you raised or are assigned to");
}

// Read-only variant of assertCanView, used ONLY by getTicketById. A MANAGER
// or TEAMLEAD who personally raised a ticket must still be able to open it
// after it's routed to (or transferred into) a department they don't have
// access to — being the requester is sufficient to look at your own
// request's status/history, mirroring the EMPLOYEE-role rule just below.
// Deliberately NOT folded into assertCanView itself: that function also
// gates mutating actions (comments/attachments/status changes/transfer),
// which stay exactly access-scoped even on a ticket raised elsewhere —
// acting on a department you don't manage is a materially different, larger
// permission than merely viewing your own request's progress, and this
// exception grants ONLY that narrower read access, never department-
// management rights over the ticket's actual department.
function assertCanViewForRead(user, ticket, userDepartmentIds = []) {
  if (isManagementRole(user) && ticket.requesterId === user.id) return;
  assertCanView(user, ticket, userDepartmentIds);
}

// Internal (staff-only) notes are stripped out before a response reaches
// anyone who isn't actually staff FOR THIS TICKET's own department — an
// EMPLOYEE requester (unless also the assignee), or a MANAGER/TEAMLEAD
// viewing solely via the requester exception above (assertCanViewForRead)
// rather than as this ticket's own department management user. A
// MANAGER/TEAMLEAD who DOES manage this ticket's department, or the person
// actually assigned to work it, still sees everything, exactly as before.
// Shared by scrubInternalComments (what the comment list itself shows) and
// streamAttachment (what a direct-by-id download request may return) so
// both enforce exactly the same "who can see an internal note" rule — an
// attachment on a hidden internal note must never be independently
// downloadable just because its own id was guessed/known.
function canViewInternalNotes(user, ticket, userDepartmentIds = []) {
  const isAssignee = ticket.assigneeId === user.id;
  const isDepartmentStaff = user.role.name === "ADMIN" || (isManagementRole(user) && userDepartmentIds.includes(ticket.toDepartmentId));
  return isDepartmentStaff || isAssignee;
}

function scrubInternalComments(ticket, user, userDepartmentIds = []) {
  if (!canViewInternalNotes(user, ticket, userDepartmentIds)) {
    return { ...ticket, comments: ticket.comments.filter((c) => !c.isInternal) };
  }
  return ticket;
}

// A ticket's assignee must be an active EMPLOYEE belonging to the ticket's
// own (to-)department — never an ADMIN, never a MANAGER, never a TEAMLEAD
// (Managers/Team Leads manage tickets, they are never themselves a normal
// assignee), never someone from an unrelated department.
async function assertValidAssignee(assigneeId, departmentId) {
  if (!assigneeId) return;
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, include: { role: true } });
  if (!assignee || !assignee.isActive || assignee.role.name !== "EMPLOYEE" || assignee.departmentId !== departmentId) {
    throw new ApiError(400, "Invalid assignee — must be an active employee in this ticket's department");
  }
}

// Custom CC (TicketCC) — validated server-side regardless of what the
// Raise Ticket UI's search/picker already filtered client-side. Returns
// the deduped, validated id list; throws on the first id that isn't a
// real, active user, rather than silently dropping it (this is direct user
// input at ticket-creation time, not an internally-derived recipient list
// — unlike notification.service.js's CC resolution, which DOES drop
// unreachable addresses silently, this is the boundary that must give the
// caller a clear error instead).
// Raise Ticket submits as multipart/form-data (it carries file uploads), so
// a repeated `ccUserIds` field only becomes a real array once there are 2+
// entries (see the `append-field` package multer uses internally) — a
// single selected CC user instead arrives as one bare string, and a JSON
// client could also reasonably send a JSON-encoded array string. This
// normalizes all three shapes before assertValidCcUserIds ever sees them.
function normalizeCcUserIds(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

async function assertValidCcUserIds(ccUserIds) {
  const uniqueIds = [...new Set((ccUserIds || []).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const users = await prisma.user.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, isActive: true } });
  const found = new Map(users.map((u) => [u.id, u]));
  for (const id of uniqueIds) {
    const foundUser = found.get(id);
    if (!foundUser || !foundUser.isActive) {
      throw new ApiError(400, "One or more selected CC users are invalid or inactive.");
    }
  }
  return uniqueIds;
}

// Ticket.managerId is kept only for backward compatibility/history (see
// schema.prisma) — it is no longer the source of truth for department
// authorization, so a legitimate value here now means "an active MANAGER or
// TEAMLEAD with UserDepartmentAccess to this ticket's destination
// department," not the old single isManager+departmentId check. managerId
// is normally always server-derived at creation/transfer time and never
// client-chosen; this is only reached when an ADMIN explicitly overrides it
// via PATCH (see updateTicket) — a pre-existing, explicit Admin data-
// correction feature, not a new "assign" action.
async function assertValidManager(managerId, departmentId) {
  if (!managerId) return;
  const manager = await prisma.user.findUnique({ where: { id: managerId }, include: { role: true } });
  if (!manager || !manager.isActive || !isManagementRole(manager)) {
    throw new ApiError(400, "Invalid manager — must be an active Manager or Team Lead");
  }
  if (!(await userDepartmentAccessService.hasAccess(managerId, departmentId))) {
    throw new ApiError(400, "Invalid manager — this user does not have access to this ticket's department");
  }
}

// Who may transfer a ticket to a different department — a deliberately
// separate check from updateTicket's staff checks: an ADMIN (who otherwise
// may VIEW every ticket) is explicitly EXCLUDED from this action per the
// final role rules ("Admin cannot transfer"), and an EMPLOYEE may transfer
// only while they are the ticket's current assignee — not merely its
// requester, and not any EMPLOYEE in the department.
function assertCanTransferDepartment(user, ticket, userDepartmentIds = []) {
  if (user.role.name === "ADMIN") {
    throw new ApiError(403, "Administrators cannot transfer a ticket's department.");
  }
  if (isManagementRole(user)) {
    if (userDepartmentIds.includes(ticket.toDepartmentId)) return;
    throw new ApiError(403, "You can only transfer tickets belonging to a department you have access to.");
  }
  if (ticket.assigneeId === user.id) return;
  throw new ApiError(403, "Only an authorized department Manager/Team Lead or the employee currently assigned to this ticket can transfer it.");
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
// This matters specifically for MANAGER/TEAMLEAD: scopeWhereForUser
// restricts them to their own department(s), but "tickets I raised" (the
// Raised By Me view) must include tickets raised to OTHER departments too —
// ANDing the two would incorrectly hide those. Note MANAGER has no
// "assigned" scope in its own UI (Managers are never assignees), but the
// scope itself stays generic here — it's simply never requested for that
// role. For ADMIN/EMPLOYEE this produces the exact same result as the old
// AND-based version: ADMIN's scopeWhereForUser is unrestricted, and an
// EMPLOYEE's own requesterId/assigneeId is already a subset of their
// existing requesterId-OR-assigneeId scope. Shared with dashboard.service.js
// so both mean exactly the same thing for the same scope value — no
// duplicate/divergent filtering logic.
function scopeWhereForTab(user, scope, userDepartmentIds = []) {
  if (scope === "assigned") return { assigneeId: user.id };
  if (scope === "created") return { requesterId: user.id };
  // "mine" = raised by me OR assigned to me, as ONE query (never a summed
  // pair of separate counts) so a ticket matching both is never double
  // counted — the exact same OR shape scopeWhereForUser already uses for an
  // EMPLOYEE's own default scope, just made explicitly selectable via
  // `scope` for any role (most usefully TEAMLEAD, whose own default scope
  // is department-access-based and unrelated to requesterId/assigneeId).
  if (scope === "mine") return { OR: [{ requesterId: user.id }, { assigneeId: user.id }] };
  // "authorized" = global search's own scope: everything the caller is
  // allowed to VIEW, as distinct from "department" (a MANAGER/TEAMLEAD's
  // normal list default, scopeWhereForUser below — every accessible
  // department, not just one) and "mine"/"created"/"assigned" (an explicit
  // personal tab). For ADMIN/EMPLOYEE, scopeWhereForUser(user) already
  // covers everything they're allowed to view (unrestricted / raised-OR-
  // assigned respectively), so this is identical to the default branch for
  // them. For MANAGER/TEAMLEAD specifically, scopeWhereForUser only covers
  // their accessible departments and misses a ticket they personally raised
  // to a department they DON'T have access to — exactly the one extra case
  // assertCanViewForRead's own read-only exception already grants a single
  // ticket at a time, mirrored here as a list-query OR so global search can
  // find that ticket too, never more than what that existing exception
  // already permits.
  if (scope === "authorized") {
    return isManagementRole(user)
      ? { OR: [scopeWhereForUser(user, userDepartmentIds), { requesterId: user.id }] }
      : scopeWhereForUser(user, userDepartmentIds);
  }
  return scopeWhereForUser(user, userDepartmentIds);
}

async function listTickets(user, query) {
  const { page, limit, skip, take } = parsePagination(query);
  const userDepartmentIds = await resolveUserDepartmentIds(user);

  const where = {
    AND: [
      scopeWhereForTab(user, query.scope, userDepartmentIds),
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
      // A date-only string (e.g. "2026-09-23") parses as that day's UTC
      // midnight — using `lte` on that instant would exclude every ticket
      // created later the same day (14:00 UTC, say), making "To" behave as
      // if it meant the very start of the selected day rather than its end.
      // Instead this treats dateTo as an EXCLUSIVE upper bound at the next
      // day's UTC midnight, so the entire selected day is included no
      // matter what time within it a ticket was created — symmetric with
      // dateFrom's own UTC-midnight boundary above.
      query.dateTo ? { createdAt: { lt: new Date(new Date(query.dateTo).getTime() + 24 * 60 * 60 * 1000) } } : {},
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

// Flattens the raw Prisma junction shapes (userAccess -> user, ccUsers ->
// user) into plain arrays the frontend can render directly, split by role
// into `managers`/`teamLeads` — same convention as
// department.service.js#toDepartmentShape's own flattening.
function shapeTicketDetail(ticket) {
  return {
    ...ticket,
    toDepartment: ticket.toDepartment && {
      id: ticket.toDepartment.id,
      name: ticket.toDepartment.name,
      managers: ticket.toDepartment.userAccess.filter((a) => a.user.role.name === "MANAGER").map((a) => a.user),
      teamLeads: ticket.toDepartment.userAccess.filter((a) => a.user.role.name === "TEAMLEAD").map((a) => a.user),
    },
    ccUsers: ticket.ccUsers.map((cc) => cc.user),
  };
}

async function getTicketById(user, id) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: ticketDetailInclude });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  const userDepartmentIds = await resolveUserDepartmentIds(user);
  assertCanViewForRead(user, ticket, userDepartmentIds);
  return shapeTicketDetail(scrubInternalComments(ticket, user, userDepartmentIds));
}

async function createTicket(user, payload, files = []) {
  // Final role rule: Admin may view every ticket but never raises one.
  if (user.role.name === "ADMIN") {
    throw new ApiError(403, "Administrators cannot raise tickets.");
  }

  // Checked first, before any other validation or async work — a brand
  // new ticket has zero existing attachments, so this is simply "the whole
  // bundled batch must fit," and it must reject the entire request before
  // a single file is uploaded to Azure (never a partial upload of some of
  // the 6+ files submitted).
  if (files.length > MAX_ATTACHMENTS_PER_TICKET) {
    throw new ApiError(400, `Maximum ${MAX_ATTACHMENTS_PER_TICKET} attachments are allowed per ticket.`);
  }

  const { title, description, categoryId, priorityId, teamId, assigneeId, toDepartmentId, issueId, customIssueText, ccUserIds } = payload;

  // A MANAGER/TEAMLEAD's own department membership isn't the legacy
  // User.departmentId field (they may have none, or several, via
  // UserDepartmentAccess) — falling back to the ticket's own destination
  // department for that case means "this request effectively originates
  // within the department it's being raised to," which is the closest
  // sensible meaning fromDepartmentId (an informational field, never used
  // for authorization) can have for those two roles. An EMPLOYEE still
  // requires their normal departmentId exactly as before.
  const fromDepartmentId = user.departmentId || (isManagementRole(user) ? toDepartmentId : null);
  if (!fromDepartmentId) {
    throw new ApiError(400, "Your account has no department assigned. Contact an administrator.");
  }

  const [priority, category, toDepartment, activeTeamLeads, activeManagers, issue, validCcUserIds] = await Promise.all([
    prisma.priority.findUnique({ where: { id: priorityId } }),
    categoryId ? prisma.category.findUnique({ where: { id: categoryId } }) : Promise.resolve(null),
    prisma.department.findUnique({ where: { id: toDepartmentId } }),
    // The department's management users are never client-chosen — every
    // ACTIVE TEAMLEAD/MANAGER currently granted UserDepartmentAccess to this
    // department (there may be several, or none). Ticket.managerId below is
    // set from the first TEAMLEAD (falling back to the first MANAGER) purely
    // as a backward-compatible historical record — it is no longer read for
    // authorization/email purposes anywhere; the full
    // activeTeamLeads/activeManagers lists are what actually drive the
    // TICKET_CREATED recipients further down (TO TeamLeads, CC Managers).
    userDepartmentAccessService.getActiveDepartmentTeamLeads(toDepartmentId),
    userDepartmentAccessService.getActiveDepartmentManagers(toDepartmentId),
    prisma.issue.findUnique({ where: { id: issueId } }),
    assertValidCcUserIds(normalizeCcUserIds(ccUserIds)),
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
        managerId: activeTeamLeads[0]?.id || activeManagers[0]?.id || null,
        issueId,
        customIssueText: issue.isOther ? customIssueText.trim() : null,
        dueAt,
      },
    });

    await recordHistory(tx, { ticketId: created.id, userId: user.id, action: "CREATED" });

    // Custom CC — fixed for the life of the ticket (never changes on a
    // later department transfer, see transferDepartment below).
    if (validCcUserIds.length) {
      await tx.ticketCC.createMany({
        data: validCcUserIds.map((userId) => ({ ticketId: created.id, userId, addedBy: user.id })),
        skipDuplicates: true,
      });
    }

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

  // TICKET_CREATED — TO every active TEAMLEAD with access to the selected
  // department, CC every active MANAGER + the ticket's Custom CC users (see
  // utils/recipientBuilder.js#buildCreatedRecipients). If the department
  // currently has no active Team Lead at all, fall back to a solo
  // confirmation TO the requester — there's no valid reviewer to address it
  // to, but the requester should still know their ticket was recorded
  // (handles "no Team Lead yet" safely without silently sending nothing).
  const created = await buildCreatedRecipients(finalTicket);
  await notificationService.notify({
    eventKey: "TICKET_CREATED",
    userIds: created.userIds.length ? created.userIds : [user.id],
    ticketId: finalTicket.id,
    type: "TICKET_CREATED",
    ticket: finalTicket,
    ccUserIds: created.userIds.length ? created.ccUserIds : [],
  });

  // A ticket created with an assignee already attached (e.g. an Admin
  // pre-assigning at creation) follows the SAME standard recipient rule as
  // a normal post-creation assignment (see notifyOnUpdate's ASSIGNED
  // handling below) — TO requester + assignee, CC current department
  // agents + Custom CC.
  if (finalTicket.assigneeId) {
    const standard = await buildStandardRecipients(finalTicket);
    await notificationService.notify({
      eventKey: "TICKET_ASSIGNED",
      userIds: standard.userIds,
      ticketId: finalTicket.id,
      type: "TICKET_ASSIGNED",
      ticket: finalTicket,
      ccUserIds: standard.ccUserIds,
    });
  }

  return shapeTicketDetail(finalTicket);
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
  const userDepartmentIds = await resolveUserDepartmentIds(user);
  assertCanView(user, ticket, userDepartmentIds);

  const isAdmin = user.role.name === "ADMIN";
  const isOwner = ticket.requesterId === user.id;
  const isAssignee = ticket.assigneeId === user.id;
  // A MANAGER or TEAMLEAD with access to this ticket's department (already
  // guaranteed by assertCanView above) can fully manage it — reassign,
  // change priority/department/manager/etc. ADMIN may VIEW and drive its
  // status/content but, per the final role rules, may never assign,
  // reassign, or transfer it — see the dedicated `isManagement`-gated block
  // below, which deliberately excludes isAdmin. The EMPLOYEE actually
  // assigned to work the ticket may drive it through its status workflow
  // but never reassign or change its routing.
  const isManagement = isManagementRole(user);
  const canDriveWorkflow = isAdmin || isManagement || isAssignee;

  // The requester may edit the ORIGINAL content of a ticket they raised
  // (priority/issue/description/title) — never merely because they're the
  // assignee, and never once the ticket has reached a terminal state
  // (mirrors the same RESOLVED/CLOSED gate the owner-reopen rule below
  // already uses). This is a separate authorization path from isAdmin/
  // isManagement, converging on the same handful of "content" fields
  // further down — never on assignment/routing/status, which stay
  // exclusively behind isManagement or canDriveWorkflow.
  const canRequesterEditDetails = isOwner && !["RESOLVED", "CLOSED"].includes(ticket.status);
  // Distinguishes "the requester used their edit-my-own-ticket path" from
  // "a manager/team lead/admin changed priority via the existing Edit
  // Ticket dialog" — only the former should produce the new
  // TICKET_DETAILS_UPDATED history marker/email; the latter's existing
  // behavior (silent priority-only update, no email) must stay exactly as
  // it was before this change.
  const isRequesterEditPath = !isAdmin && !isManagement && canRequesterEditDetails;

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

  // Assignment / routing — MANAGER or TEAMLEAD ONLY. ADMIN is deliberately
  // excluded from this entire block per the final role rules ("Admin cannot
  // assign, reassign, or transfer") even though isAdmin still participates
  // in canDriveWorkflow (status) and the general content-edit block below.
  if (isManagement) {
    // "Assign to Me" — a separate, narrow path from the generic assigneeId
    // field just below. It is the ONLY way a ticket's assigneeId can ever
    // become the ACTING caller's own id: never derived from a client-
    // supplied assigneeId (which stays restricted to active EMPLOYEEs via
    // assertValidAssignee, unchanged in the branch below), so a caller can
    // never use the raw assigneeId field to self-assign or to assign to
    // some OTHER staff member — only this explicit, self-only flag, and
    // only for a TEAMLEAD. A MANAGER must never be a ticket's assignee (see
    // the final role rules — "Manager cannot be assigned tickets"), so this
    // flag is rejected outright for a MANAGER caller even though they
    // otherwise sit inside this same isManagement block. assertCanView
    // already guarantees the caller here has UserDepartmentAccess to this
    // ticket's department.
    if (payload.assignToMe === true) {
      if (user.role.name !== "TEAMLEAD") {
        throw new ApiError(403, "Only a Team Lead can assign a ticket to themselves — Managers cannot be assigned tickets.");
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
    if (payload.toDepartmentId !== undefined && payload.toDepartmentId !== ticket.toDepartmentId) {
      data.toDepartmentId = payload.toDepartmentId || null;
      historyEntries.push({ action: "DEPARTMENT_CHANGE", fieldName: "toDepartmentId", oldValue: ticket.toDepartmentId, newValue: payload.toDepartmentId });
    }
  }

  // Ticket metadata (team/category) and the Admin-only manager override —
  // none of these are "assign/reassign/transfer," so ADMIN keeps this
  // pre-existing capability alongside MANAGER/TEAMLEAD.
  if (isAdmin || isManagement) {
    if (payload.teamId !== undefined && payload.teamId !== ticket.teamId) {
      data.teamId = payload.teamId || null;
      historyEntries.push({ action: "TEAM_CHANGE", fieldName: "teamId", oldValue: ticket.teamId, newValue: payload.teamId });
    }
    if (payload.categoryId !== undefined && payload.categoryId !== ticket.categoryId) {
      data.categoryId = payload.categoryId;
      historyEntries.push({ action: "CATEGORY_CHANGE", fieldName: "categoryId", oldValue: ticket.categoryId, newValue: payload.categoryId });
    }
    if (payload.managerId !== undefined && payload.managerId !== ticket.managerId) {
      // Only an Administrator may manually override a ticket's manager.
      // The department's manager is otherwise always server-derived (see
      // createTicket's manager lookup) — a MANAGER/TEAMLEAD sits inside
      // this same block for team/category, but must not be able to
      // arbitrarily reassign a ticket's manager (e.g. to themselves), so
      // that specific field is carved out to ADMIN-only here rather than
      // being gated by isManagement like the rest. This is a pre-existing,
      // explicit Admin data-correction feature, not a new "assign" action.
      if (!isAdmin) {
        throw new ApiError(403, "Only an Administrator can change a ticket's manager");
      }
      const targetDepartmentId = payload.toDepartmentId !== undefined ? payload.toDepartmentId : ticket.toDepartmentId;
      await assertValidManager(payload.managerId, targetDepartmentId);
      data.managerId = payload.managerId || null;
      historyEntries.push({ action: "MANAGER_CHANGE", fieldName: "managerId", oldValue: ticket.managerId, newValue: payload.managerId });
    }
  }

  // Content fields — priority, issue, description, title. Editable by
  // staff (isAdmin/isManagement, exactly as before for priority/issue) OR by
  // the requester editing their own still-open ticket
  // (canRequesterEditDetails). Assignment/routing/status are NEVER part of
  // this block — those stay exclusively above, gated by isManagement /
  // canDriveWorkflow, so a requester can never use this path to reassign,
  // reroute, or change status.
  if (isAdmin || isManagement || canRequesterEditDetails) {
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
  return shapeTicketDetail(scrubInternalComments(updated, user, userDepartmentIds));
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
  // Distinguishes a ticket's first-ever assignment from a later reassignment
  // — purely to pick the right event key; who gets notified is unchanged.
  const wasAlreadyAssigned = Boolean(before.assigneeId);

  // Every event below shares the SAME standard recipient shape — TO
  // requester + current assignee, CC the ticket's current department's
  // active AGENTs + its Custom CC list (see utils/recipientBuilder.js).
  // Computed once per call (not per history entry) since `after` — the
  // ticket's post-update state — doesn't change across entries in the
  // same updateTicket() call.
  const { userIds: standardUserIds, ccUserIds: standardCcUserIds } = await buildStandardRecipients(after);

  for (const entry of historyEntries) {
    // --- Status changes (OPEN/IN_PROGRESS/ON_HOLD/RESOLVED/CLOSED) -------
    // One consolidated email per transition, never one-per-recipient.
    // REOPENED shares this exact same recipient rule too now — no more
    // special-cased "TO the assignee, not the requester" shape.
    if (entry.action === "STATUS_CHANGE" && standardUserIds.length) {
      await notificationService.notify({
        eventKey: statusEventKey(entry.newValue),
        userIds: standardUserIds,
        ticketId: after.id,
        type: "STATUS_CHANGED",
        ticket: after,
        statusChange: { oldValue: entry.oldValue, newValue: entry.newValue },
        ccUserIds: standardCcUserIds,
      });
    }

    // --- Assignment ----------------------------------------------------
    // Self-assignment ("Assign to Me") is a dedicated event handled in its
    // own block below — never reuses this one, and is excluded here via
    // `entry.newValue !== actor.id`.
    if (entry.action === "ASSIGNED" && after.assigneeId && entry.newValue === after.assigneeId && entry.newValue !== actor.id && standardUserIds.length) {
      await notificationService.notify({
        eventKey: wasAlreadyAssigned ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED",
        userIds: standardUserIds,
        ticketId: after.id,
        type: "TICKET_ASSIGNED",
        ticket: after,
        ccUserIds: standardCcUserIds,
      });
    }

    // Self-assignment ("Assign to Me") — a narrow, dedicated event outside
    // the standard 10-event recipient matrix, left exactly as it already
    // was: TO the requester only (never the acting Team Lead themselves), no
    // CC, skipped entirely if the requester happens to be the actor.
    if (entry.action === "ASSIGNED" && entry.newValue === actor.id && after.requesterId && after.requesterId !== actor.id) {
      await notificationService.notify({
        eventKey: "TICKET_SELF_ASSIGNED",
        userIds: [after.requesterId],
        ticketId: after.id,
        type: "TICKET_ASSIGNED",
        ticket: after,
      });
    }

    // --- Requester edited their own ticket's content --------------------
    if (entry.action === "TICKET_DETAILS_UPDATED" && standardUserIds.length) {
      await notificationService.notify({
        eventKey: "TICKET_UPDATED",
        userIds: standardUserIds,
        ticketId: after.id,
        type: "TICKET_UPDATED",
        ticket: after,
        ccUserIds: standardCcUserIds,
      });
    }
  }
}

// Moves a ticket to a different department — a separate action from
// updateTicket's generic toDepartmentId field (which is MANAGER/TEAMLEAD-
// only and does NOT touch manager/assignee). This is the only path that:
// (a) lets an assigned EMPLOYEE move their own ticket, and (b) automatically
// re-derives the manager and clears the assignee, since the old assignee
// belongs to the old department and the new department's management must
// review and re-assign it themselves.
async function transferDepartment(user, ticketId, { toDepartmentId, transferReason }) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { toDepartment: { select: { id: true, name: true } } },
  });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  const userDepartmentIds = await resolveUserDepartmentIds(user);
  assertCanView(user, ticket, userDepartmentIds);
  assertCanTransferDepartment(user, ticket, userDepartmentIds);

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

  // The department's management users are never client-chosen — every
  // ACTIVE TEAMLEAD/MANAGER currently granted UserDepartmentAccess to the
  // destination department, exactly like createTicket's own lookup. A
  // department with nobody currently holding access cannot receive a
  // transferred ticket at all. Ticket.managerId is set from the first
  // TEAMLEAD (falling back to the first MANAGER) purely as a backward-
  // compatible historical record.
  const [newActiveTeamLeads, newActiveManagers] = await Promise.all([
    userDepartmentAccessService.getActiveDepartmentTeamLeads(toDepartmentId),
    userDepartmentAccessService.getActiveDepartmentManagers(toDepartmentId),
  ]);
  if (!newActiveTeamLeads.length && !newActiveManagers.length) {
    throw new ApiError(400, "The selected department does not have an active Manager or Team Lead and cannot receive transferred tickets.");
  }

  const oldDepartmentName = ticket.toDepartment?.name || "Unassigned";

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        toDepartmentId,
        managerId: newActiveTeamLeads[0]?.id || newActiveManagers[0]?.id || null,
        // The old assignee belongs to the OLD department and must never
        // remain assigned once the ticket routes elsewhere — the new
        // department's agent(s) review the ticket and assign it themselves.
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

  // Dedicated event — never reuses TICKET_UPDATED. Uses the SAME standard
  // recipient shape as every other post-creation event (TO requester +
  // current assignee — the assignee was just cleared above, so this is
  // effectively "requester only" right after a transfer; CC every active
  // TEAMLEAD and MANAGER of the ticket's CURRENT department, which by this
  // point is already the NEW department — see buildStandardRecipients,
  // which reads `updated.toDepartmentId`/`updated.assigneeId` as-is — plus
  // the ticket's original Custom CC list, unchanged by the transfer). The
  // OLD department's management users are never included: this function
  // never queries them, and buildStandardRecipients only ever looks at the
  // ticket's current toDepartmentId.
  const standard = await buildStandardRecipients(updated);
  await notificationService.notify({
    eventKey: "TICKET_DEPARTMENT_TRANSFERRED",
    userIds: standard.userIds,
    ticketId: updated.id,
    type: "TICKET_DEPARTMENT_TRANSFERRED",
    ticket: updated,
    ccUserIds: standard.ccUserIds,
    departmentTransfer: { oldDepartmentName, reason },
  });

  return shapeTicketDetail(scrubInternalComments(updated, user, userDepartmentIds));
}

async function addComment(user, ticketId, { body, isInternal }, files = []) {
  // Includes the same relations as ticketListInclude so the comment-
  // notification email template has department/priority/issue to show,
  // not just the bare ticket row.
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: ticketListInclude });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  const userDepartmentIds = await resolveUserDepartmentIds(user);
  assertCanView(user, ticket, userDepartmentIds);

  // Internal notes / "first response" credit go to whoever is actually
  // handling the ticket: Admin, Manager, Team Lead, or the EMPLOYEE assigned
  // to work it (the assignee is never staff in this model, but plays the
  // same role).
  const isHandler = user.role.name === "ADMIN" || isManagementRole(user) || ticket.assigneeId === user.id;
  if (isInternal && !isHandler) {
    throw new ApiError(403, "Only a manager, team lead, admin, or the assigned employee can add internal notes");
  }

  // Authoritative check (the commentValidator chain in ticket.routes.js is
  // only the fast-fail layer) — a comment needs text, attachment(s), or
  // both; rejected only when both are absent. Checked against the RAW
  // trimmed input, not the sanitized HTML below, since sanitizing an empty
  // string can still yield non-empty markup for some inputs.
  const trimmedBody = (body || "").trim();
  if (!trimmedBody && files.length === 0) {
    throw new ApiError(400, "Comment must include text or at least one attachment");
  }

  // Early guard — same philosophy as createTicket/addAttachment: reject the
  // whole batch before a single Azure upload starts (and before the comment
  // itself is even created) if it obviously can't fit, rather than creating
  // a comment and then silently dropping some of its attachments.
  if (files.length > 0) {
    await assertAttachmentLimit(ticketId, files.length);
  }

  const cleanBody = trimmedBody ? sanitizeRichText(trimmedBody) : "";

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

  // Attachments are uploaded to Azure (and their metadata saved) AFTER the
  // comment above commits — same reasoning and the same reused
  // addAttachment() call createTicket's own initial attachments already go
  // through: the blob naming convention needs a real id that only exists
  // once the row does, and network calls don't belong inside a DB
  // transaction. Each file is independent and best-effort — a single
  // failed upload is logged but doesn't undo the comment that was already
  // successfully posted (same "a secondary side-effect failing must not
  // roll back the primary action" precedent used throughout this file).
  for (const file of files) {
    await addAttachment(user, ticketId, file, comment.id).catch((err) => {
      console.error(`[tickets] Failed to save attachment "${file.originalname}" for comment ${comment.id}:`, err.message);
    });
  }
  const finalComment = files.length > 0
    ? await prisma.ticketComment.findUnique({
        where: { id: comment.id },
        include: { author: { select: { id: true, name: true, role: { select: { name: true } } } }, attachments: true },
      })
    : comment;

  // Public comments notify the ticket's normal recipient group — internal
  // notes never leave staff (skipped entirely below — no email for
  // anyone). Uses the SAME standard TO/CC rule as every other
  // post-creation event (TO requester + current assignee, CC current
  // department's active agents + Custom CC) — this supersedes the old
  // role-based comment-recipient matrix entirely, per the current
  // recipient-architecture requirement. An attachment-only public comment
  // still triggers exactly this one email — there is no separate
  // "attachment added" event, and addAttachment() itself never sends its
  // own notification.
  if (!isInternal) {
    const { userIds, ccUserIds } = await buildStandardRecipients(ticket);
    if (userIds.length) {
      await notificationService.notify({
        eventKey: "TICKET_COMMENT_ADDED",
        userIds,
        ticketId,
        type: "NEW_COMMENT",
        ticket,
        comment: finalComment,
        ccUserIds,
      });
    }
  }

  return finalComment;
}

async function bulkUpdate(user, { ticketIds, status, priorityId, assigneeId, teamId }) {
  if (user.role.name !== "ADMIN") throw new ApiError(403, "Only Admins can perform bulk actions");
  if (!ticketIds?.length) throw new ApiError(400, "ticketIds is required");
  // Bulk actions are an Admin-only feature, but "assign" is still one of the
  // operations the final role rules explicitly forbid for Admin — status/
  // priority/team bulk edits are unaffected.
  if (assigneeId !== undefined) {
    throw new ApiError(403, "Administrators cannot assign tickets.");
  }

  const data = {};
  if (status) data.status = status;
  if (priorityId) data.priorityId = priorityId;
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
  assertCanView(user, ticket, await resolveUserDepartmentIds(user));

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
          // Some browsers/OS combinations report an empty mimetype for
          // less common file types (e.g. certain .csv/.7z uploads) — stored
          // as a safe generic fallback rather than an empty string so
          // streamAttachment always has something valid to set as
          // Content-Type.
          mimeType: file.mimetype || "application/octet-stream",
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
  const userDepartmentIds = await resolveUserDepartmentIds(user);
  assertCanView(user, ticket, userDepartmentIds);

  const attachment = await prisma.ticketAttachment.findUnique({
    where: { id: attachmentId },
    include: { comment: { select: { isInternal: true } } },
  });
  if (!attachment || attachment.ticketId !== ticketId) throw new ApiError(404, "Attachment not found");

  // An attachment on an internal note must be exactly as hidden as the note
  // itself (see scrubInternalComments) — a requester who can't see the note
  // in the comment list must not be able to fetch its attachment either,
  // just by knowing/guessing the attachment's own id.
  if (attachment.comment?.isInternal && !canViewInternalNotes(user, ticket, userDepartmentIds)) {
    throw new ApiError(404, "Attachment not found");
  }

  res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
  // "attachment" (not "inline") — this is a general file-download endpoint
  // now that arbitrary file types are supported, and the frontend always
  // fetches these bytes as a Blob rather than navigating the browser to
  // this URL directly (see AttachmentList.jsx/CommentThread.jsx), so this
  // has no effect on the existing inline image-preview behavior either way
  // — it only matters for anything that DOES navigate here directly, which
  // should always save-as using the original filename, never try to render
  // a PDF/image in-tab.
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.fileName)}"`);

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
// ticket (Admin, Manager, or Team Lead), may remove it — mirrors the
// existing uploader-or-handler pattern addComment already uses for internal
// notes. Azure deletion happens BEFORE the Postgres row is removed, and its
// failure is never swallowed: if the blob can't be deleted, the DB record is
// deliberately left in place (a dangling reference to a blob nobody can
// find is far worse than a metadata row for a blob that still safely
// exists) and the error propagates to the caller.
async function deleteAttachment(user, ticketId, attachmentId) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  assertCanView(user, ticket, await resolveUserDepartmentIds(user));

  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.ticketId !== ticketId) throw new ApiError(404, "Attachment not found");

  const isStaff = user.role.name === "ADMIN" || isManagementRole(user);
  if (attachment.uploadedById !== user.id && !isStaff) {
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
  resolveUserDepartmentIds,
  isManagementRole,
};
