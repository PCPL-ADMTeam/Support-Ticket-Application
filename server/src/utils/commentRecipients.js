// Pure TICKET_COMMENT_ADDED TO/CC recipient matrix — kept in its own
// dependency-free module (no Prisma, no other services) so it can be
// unit-tested directly without pulling in the rest of ticket.service.js
// (and its transitive deps, e.g. sanitize-html). Not reused by any other
// event; every other event still computes its own TO/CC inline in
// ticket.service.js#notifyOnUpdate, via that file's own ccExcluding.

// Deduped id list: every candidate except falsy ones and whichever ids are
// passed in `exclude` (the comment author, and whichever id was already
// chosen as TO). A local copy of ticket.service.js's own ccExcluding,
// intentionally duplicated rather than imported so this file stays
// dependency-free.
function ccExcluding(candidates, ...exclude) {
  const excluded = new Set(exclude.filter(Boolean));
  return [...new Set(candidates.filter((id) => id && !excluded.has(id)))];
}

// Priority order: requester check first, so an actor who is BOTH the
// requester AND staff (an Agent commenting on their own ticket) is treated
// as the requester case, not the manager case — this is the ONE event with
// its own recipient rule, never the generic "CC the department manager"
// behavior other events use. Returns { to: null, ccUserIds: [] } — meaning
// "send nothing" — whenever the required TO participant doesn't exist or
// is the author themself; a missing participant is never substituted for
// another, and the author never appears in TO or CC.
function resolveCommentRecipients(ticket, authorId, authorRole) {
  const isActorRequester = authorId === ticket.requesterId;
  const isActorStaff = authorRole === "ADMIN" || authorRole === "AGENT";
  const managerId = ticket.managerId;

  let to;
  let ccCandidates;
  if (isActorRequester) {
    // Requester comments -> TO the assignee, CC the manager.
    to = ticket.assigneeId;
    ccCandidates = [managerId];
  } else if (isActorStaff) {
    // Manager/staff comments -> TO the requester, CC the assignee.
    to = ticket.requesterId;
    ccCandidates = [ticket.assigneeId];
  } else {
    // Assignee (or any other non-staff USER) comments -> TO the manager,
    // CC the requester.
    to = managerId;
    ccCandidates = [ticket.requesterId];
  }

  if (!to || to === authorId) return { to: null, ccUserIds: [] };
  return { to, ccUserIds: ccExcluding(ccCandidates, authorId, to) };
}

module.exports = { resolveCommentRecipients };
