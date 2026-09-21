import TicketsListPage from "../TicketsListPage";

// Every ticket routed to the Manager's department — scopeWhereForUser
// already restricts GET /tickets to toDepartmentId for a MANAGER (see
// ticket.service.js), so no client-side filtering is needed here.
export default function ManagerAllTicketsPage() {
  return <TicketsListPage title="All Department Tickets" showAssignee showCategory inlineAssign />;
}
