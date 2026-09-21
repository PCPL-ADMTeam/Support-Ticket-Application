import TicketsListPage from "../TicketsListPage";

const OVERDUE_FILTERS = { overdue: "true" };

// Department tickets past their due date and not yet resolved/closed.
// TicketsListPage already renders overdue due dates in bold red
// (see its isOverdue() helper) regardless of this filter.
export default function ManagerOverdueTicketsPage() {
  return <TicketsListPage title="Overdue" showAssignee showCategory additionalFilters={OVERDUE_FILTERS} />;
}
