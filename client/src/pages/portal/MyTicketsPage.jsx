import { useState } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import TicketsListPage from "../TicketsListPage";

const ASSIGNED_FILTERS = { assigned: "true" };

export default function MyTicketsPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Tickets</Typography>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tab label="Created Tickets" id="raised-tickets-tab" aria-controls="raised-tickets-panel" />
        <Tab label="Assigned Ticket" id="assigned-tickets-tab" aria-controls="assigned-tickets-panel" />
      </Tabs>

      {tab === 0 && (
        <Box role="tabpanel" id="raised-tickets-panel" aria-labelledby="raised-tickets-tab">
          <TicketsListPage title="Created Tickets" hideHeading />
        </Box>
      )}
      {tab === 1 && (
        <Box role="tabpanel" id="assigned-tickets-panel" aria-labelledby="assigned-tickets-tab">
          <TicketsListPage title="Assigned Ticket" hideHeading additionalFilters={ASSIGNED_FILTERS} />
        </Box>
      )}
    </Box>
  );
}
