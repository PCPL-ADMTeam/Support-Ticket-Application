import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Stack, Tabs, Tab, Typography, ToggleButtonGroup, ToggleButton } from "@mui/material";
import TicketsListPage from "../TicketsListPage";

// ONE page (/agent/queue), ONE ticket list at a time, driven by `?view=`
// ("my", default, or "department") and, within "my", `?scope=` ("created",
// default = Raised by Me, or "assigned" = Assigned to Me). This is NOT
// separate sidebar pages; switching either control only changes this
// component's own content, it never navigates away from /agent/queue.
// `key` forces a clean remount on switch so TicketsListPage's own internal
// filter state (status/search/etc, initialized once from the URL) never
// leaks between fundamentally different ticket sets.
//
// Backend scopes reused as-is (ticket.service.js#scopeWhereForTab):
// scope=created -> requesterId = me, regardless of department; scope=
// assigned -> assigneeId = me. Both are self-sufficient authorization
// rules the server already enforces — this page only ever selects WHICH
// of the server's own scopes to request, never filters a full dataset
// client-side.
export default function AgentQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "department" ? "department" : "my";
  const isMy = view === "my";
  const myScope = searchParams.get("scope") === "assigned" ? "assigned" : "created";

  const handleViewChange = (_, value) => setSearchParams({ view: value });
  const handleMyScopeChange = (_, value) => {
    if (!value) return; // ToggleButtonGroup fires with null when the active button is clicked again
    setSearchParams({ view: "my", scope: value });
  };

  // "" for scope on the department side deliberately clears any stale
  // ?scope= left over in the URL (e.g. an old bookmark), guaranteeing the
  // department view is never accidentally narrowed by a leftover personal
  // scope.
  const additionalFilters = useMemo(
    () => (isMy ? { scope: myScope } : { scope: "" }),
    [isMy, myScope]
  );

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{isMy ? "My Tickets" : "Department Tickets"}</Typography>

      <Tabs value={view} onChange={handleViewChange} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab label="My Tickets" value="my" id="agent-tickets-my-tab" />
        <Tab label="Department Tickets" value="department" id="agent-tickets-department-tab" />
      </Tabs>

      {isMy && (
        <ToggleButtonGroup exclusive size="small" value={myScope} onChange={handleMyScopeChange}>
          <ToggleButton value="created" sx={{ minWidth: 140, justifyContent: "center" }}>Raised by Me</ToggleButton>
          <ToggleButton value="assigned" sx={{ minWidth: 140, justifyContent: "center" }}>Assigned to Me</ToggleButton>
        </ToggleButtonGroup>
      )}

      <Box>
        <TicketsListPage
          key={isMy ? `my-${myScope}` : "department"}
          hideHeading
          showRequester
          showIssue
          showIssueFilter
          showAssignee={!isMy || myScope === "created"}
          showAssigneeFilter={!isMy}
          showAssignedFilter={!isMy}
          showDepartment={isMy}
          highlightUnassigned={!isMy}
          additionalFilters={additionalFilters}
        />
      </Box>
    </Stack>
  );
}
