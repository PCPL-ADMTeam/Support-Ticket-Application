// Unit tests for resolveCommentRecipients — the fixed TICKET_COMMENT_ADDED
// TO/CC recipient matrix. Imported from utils/commentRecipients.js (not
// ticket.service.js, which re-exports the same function) specifically so
// this test never pulls in ticket.service.js's transitive dependencies
// (sanitize-html -> htmlparser2, which ships ESM-only and can't be
// require()'d under Jest's default CJS transform — a pre-existing gap in
// this project's test setup, unrelated to this change). Pure function, no
// Prisma or notification.service involved, so these run with no DB/mocking.
const { resolveCommentRecipients } = require("../../utils/commentRecipients");

const REQUESTER = "user-requester";
const ASSIGNEE = "user-assignee";
const MANAGER = "user-manager";

function makeTicket(overrides = {}) {
  return {
    requesterId: REQUESTER,
    assigneeId: ASSIGNEE,
    managerId: MANAGER,
    ...overrides,
  };
}

describe("resolveCommentRecipients", () => {
  test("CASE A: manager/AGENT comments -> TO requester, CC assignee", () => {
    const ticket = makeTicket();
    const result = resolveCommentRecipients(ticket, MANAGER, "AGENT");
    expect(result.to).toBe(REQUESTER);
    expect(result.ccUserIds).toEqual([ASSIGNEE]);
    expect(result.to).not.toBe(MANAGER);
    expect(result.ccUserIds).not.toContain(MANAGER);
  });

  test("CASE A (ADMIN variant): admin comments -> TO requester, CC assignee", () => {
    const ticket = makeTicket();
    const result = resolveCommentRecipients(ticket, "some-admin-id", "ADMIN");
    expect(result.to).toBe(REQUESTER);
    expect(result.ccUserIds).toEqual([ASSIGNEE]);
  });

  test("CASE B: assignee/USER comments -> TO manager, CC requester", () => {
    const ticket = makeTicket();
    const result = resolveCommentRecipients(ticket, ASSIGNEE, "USER");
    expect(result.to).toBe(MANAGER);
    expect(result.ccUserIds).toEqual([REQUESTER]);
    expect(result.to).not.toBe(ASSIGNEE);
    expect(result.ccUserIds).not.toContain(ASSIGNEE);
  });

  test("CASE C: requester/USER comments -> TO assignee, CC manager", () => {
    const ticket = makeTicket();
    const result = resolveCommentRecipients(ticket, REQUESTER, "USER");
    expect(result.to).toBe(ASSIGNEE);
    expect(result.ccUserIds).toEqual([MANAGER]);
    expect(result.to).not.toBe(REQUESTER);
    expect(result.ccUserIds).not.toContain(REQUESTER);
  });

  test("the comment author is never in TO or CC, across all three cases", () => {
    const ticket = makeTicket();
    for (const [authorId, authorRole] of [
      [MANAGER, "AGENT"],
      [ASSIGNEE, "USER"],
      [REQUESTER, "USER"],
    ]) {
      const { to, ccUserIds } = resolveCommentRecipients(ticket, authorId, authorRole);
      expect(to).not.toBe(authorId);
      expect(ccUserIds).not.toContain(authorId);
    }
  });

  test("requester comments on an unassigned ticket -> no invented TO (no fallback to manager)", () => {
    const ticket = makeTicket({ assigneeId: null });
    const result = resolveCommentRecipients(ticket, REQUESTER, "USER");
    expect(result.to).toBeNull();
    expect(result.ccUserIds).toEqual([]);
  });

  test("manager comments on an unassigned ticket -> TO requester, no invented CC", () => {
    const ticket = makeTicket({ assigneeId: null });
    const result = resolveCommentRecipients(ticket, MANAGER, "AGENT");
    expect(result.to).toBe(REQUESTER);
    expect(result.ccUserIds).toEqual([]);
  });

  test("assignee comments on a ticket with no manager -> no invented TO", () => {
    const ticket = makeTicket({ managerId: null });
    const result = resolveCommentRecipients(ticket, ASSIGNEE, "USER");
    expect(result.to).toBeNull();
    expect(result.ccUserIds).toEqual([]);
  });

  test("dedupe: assignee and requester are the same person -> not duplicated across TO/CC", () => {
    // Manager comments; assignee (the CC candidate) happens to equal the
    // requester (the TO) — CC must not repeat the TO recipient.
    const ticket = makeTicket({ assigneeId: REQUESTER });
    const result = resolveCommentRecipients(ticket, MANAGER, "AGENT");
    expect(result.to).toBe(REQUESTER);
    expect(result.ccUserIds).toEqual([]);
  });

  test("dedupe: manager is also the assignee they'd otherwise CC when the assignee comments", () => {
    // Assignee comments; manager (TO) equals the assignee themself -> the
    // author must never become their own recipient.
    const ticket = makeTicket({ managerId: ASSIGNEE });
    const result = resolveCommentRecipients(ticket, ASSIGNEE, "USER");
    expect(result.to).toBeNull();
    expect(result.ccUserIds).toEqual([]);
  });

  test("priority order: an Agent commenting on their own ticket (requester AND staff) is treated as requester", () => {
    const ticket = makeTicket({ requesterId: MANAGER });
    const result = resolveCommentRecipients(ticket, MANAGER, "AGENT");
    // Requester case wins: TO assignee, CC manager (= the author here) ->
    // manager must be excluded from CC since they are the author.
    expect(result.to).toBe(ASSIGNEE);
    expect(result.ccUserIds).toEqual([]);
  });
});
