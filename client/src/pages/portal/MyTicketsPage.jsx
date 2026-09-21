import { useSearchParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import TicketsListPage from "../TicketsListPage";

const SCOPE_LABELS = {
  created: "Raised by Me",
  assigned: "Assigned to Me",
};

// A single unified list by default — not "Created"/"Assigned" tabs. USER's
// backend scope (ticket.service.js#scopeWhereForUser) already means
// "requesterId = me OR assigneeId = me" as ONE query, so a ticket the user
// both raised and is assigned to is never duplicated. When arriving from a
// dashboard KPI/card (DashboardPage.jsx's goToTickets), the URL carries
// ?scope=created|assigned, which TicketsListPage forwards straight through
// to GET /tickets — this page just reflects that back in the heading so
// the active scope is obvious, per the dashboard-navigation fix.
export default function MyTicketsPage() {
  const [searchParams] = useSearchParams();
  const scopeLabel = SCOPE_LABELS[searchParams.get("scope")];

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4">My Tickets</Typography>
        {scopeLabel && (
          <Typography variant="body2" color="text.secondary">{scopeLabel}</Typography>
        )}
      </Box>
      <TicketsListPage hideHeading showAssignee />
    </Box>
  );
}
