import TicketsListPage from "../TicketsListPage";

// "My Queue" renamed to "Department Tickets" — AGENT is the department
// manager, not an individual assignee, so this shows every ticket routed
// to their department (scoped server-side, see ticket.service.js#
// scopeWhereForUser), not just tickets personally assigned to them.
export default function AgentQueuePage() {
  return (
    <TicketsListPage
      title="Department Tickets"
      showAssignee
      showAssigneeFilter
      showRequester
      showIssue
      showIssueFilter
      showAssignedFilter
      showDepartment={false}
      highlightUnassigned
      newTicketPath="/agent/new-ticket"
    />
  );
}
