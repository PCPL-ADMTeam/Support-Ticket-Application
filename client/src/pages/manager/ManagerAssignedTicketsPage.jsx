import TicketsListPage from "../TicketsListPage";

const ASSIGNED_FILTERS = { assigned: "true" };

// Department tickets already handed off to a User — filterable by assignee
// (TicketFilters#showAssignee) and reassignable inline to another User in
// the same department.
export default function ManagerAssignedTicketsPage() {
  return <TicketsListPage title="Assigned to Department Users" showAssignee showCategory inlineAssign additionalFilters={ASSIGNED_FILTERS} />;
}
