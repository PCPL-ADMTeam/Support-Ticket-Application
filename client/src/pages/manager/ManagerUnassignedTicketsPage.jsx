import TicketsListPage from "../TicketsListPage";

const UNASSIGNED_FILTERS = { unassigned: "true" };

// Department tickets with no assignee yet. The inline "Assign To" dropdown
// (TicketsListPage#inlineAssign) is scoped to department Users only via
// usersApi.assignableUsers() — once assigned, the ticket naturally drops out
// of this filtered list on reload.
export default function ManagerUnassignedTicketsPage() {
  return <TicketsListPage title="Unassigned" showAssignee showCategory inlineAssign additionalFilters={UNASSIGNED_FILTERS} />;
}
