import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Grid, Stack, Typography, Tabs, Tab } from "@mui/material";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import ApartmentIcon from "@mui/icons-material/Apartment";
import { subDays } from "date-fns";
import { dashboardApi } from "../../api/dashboard";
import { useAuth } from "../../context/AuthContext";
import LoadingState from "../../components/common/LoadingState";
import KpiCard from "../../components/dashboard/KpiCard";
import StatusPieChart from "../../components/dashboard/StatusPieChart";
import PriorityBarChart from "../../components/dashboard/PriorityBarChart";
import DateRangeFilter from "../../components/dashboard/DateRangeFilter";
import EmployeeWorkloadTable from "../../components/dashboard/EmployeeWorkloadTable";
import TicketStatsSummary from "../../components/dashboard/TicketStatsSummary";
import { STATUS_SCALE } from "../../theme/theme";

// Tab order matches the requested left-to-right label order (My Tickets,
// Department Tickets); the DEFAULT selected index is 1 (Department
// Tickets) — an Agent is a department manager first, so that's what they
// should see on landing, per "Default Agent dashboard view: DEPARTMENT
// TICKETS." Only one of these is ever fetched/rendered at a time — see
// `activeView` below — never both dashboards stacked together.
const VIEWS = ["personal", "department"];

// ONE Agent dashboard, ONE `stats` fetch at a time, driven by whichever tab
// is active — switching tabs re-fetches GET /dashboard/stats with the
// right scope (scope=created for "My Tickets", no scope for "Department
// Tickets", which dashboard.service.js's scopeWhereForUser already resolves
// to "every ticket in my department" for an AGENT). Never a second,
// simultaneously-rendered dashboard section.
export default function AgentDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState(1);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const activeView = VIEWS[tab];

  const load = useCallback(async () => {
    setLoading(true);
    const dateFrom = subDays(new Date(), days).toISOString();
    const scope = activeView === "personal" ? "created" : undefined;
    const { data } = await dashboardApi.getStats({ days, dateFrom, scope });
    setStats(data.data);
    setLoading(false);
  }, [days, activeView]);

  useEffect(() => {
    load();
  }, [load]);

  // My Tickets drill-down reuses the existing scope-from-URL mechanism
  // TicketsListPage already reads (see the USER portal's own dashboard
  // tabs) — a ticket raised by this Agent but since transferred to
  // another department won't appear here even though it's still correctly
  // counted in "Total" above, since /agent/queue stays department-scoped
  // server-side for an Agent; an existing, unmodified visibility rule.
  const goToPersonalTickets = (params) =>
    navigate(`/agent/queue?${new URLSearchParams({ scope: "created", ...params }).toString()}`);
  const goToDepartmentTickets = (params) => navigate(`/agent/queue?${new URLSearchParams(params).toString()}`);

  if (loading || !stats) return <LoadingState minHeight={400} />;

  const { kpis, byStatus, byPriority, workload } = stats;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5} flexWrap="wrap">
        <Box>
          <Typography variant="h4">My Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            {user.department ? `${user.department.name} Department` : "No department assigned — contact an administrator"}
          </Typography>
        </Box>
        <DateRangeFilter days={days} onChange={setDays} />
      </Stack>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab label="My Tickets" id="agent-dashboard-my-tickets-tab" />
        <Tab label="Department Tickets" id="agent-dashboard-department-tickets-tab" />
      </Tabs>

      {activeView === "personal" ? (
        // "My Tickets" — tickets raised by the logged-in Agent (kpis here
        // come from the scope=created stats response above, the exact same
        // raisedByMe definition/backend logic already relied on elsewhere).
        // Identical component/layout to the USER portal's own dashboard
        // tabs — TicketStatsSummary, unchanged.
        <TicketStatsSummary stats={stats} goToTickets={goToPersonalTickets} />
      ) : (
        <>
          {/* "Department Tickets" — Agent-specific: its own 7-card KPI set
              (Total Tickets / Unassigned use the existing
              kpis.totalDepartmentTickets / kpis.unassigned backend values),
              its own Status/Priority charts, and Employee Workload — none
              of which belongs under "My Tickets". A flex row (not the
              12-column Grid, since 7 doesn't divide evenly into 12) keeps
              all 7 cards on one line on desktop — `flex: 1 1 0` gives each
              card equal, shrinkable width so they all fit without wrapping
              — while still wrapping naturally on narrow screens. */}
          <Box sx={{ display: "flex", flexWrap: { xs: "wrap", md: "nowrap" }, gap: 2 }}>
            <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
              <KpiCard label="Total Tickets" value={kpis.totalDepartmentTickets} color="#6b1f25" icon={<ApartmentIcon />} onClick={() => goToDepartmentTickets({})} />
            </Box>
            <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
              <KpiCard label="Unassigned" value={kpis.unassigned} color={STATUS_SCALE.warning} icon={<AssignmentLateIcon />} onClick={() => goToDepartmentTickets({ assigned: "false" })} />
            </Box>
            <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
              <KpiCard label="Open" value={kpis.open} color="#c81e2a" icon={<PendingActionsIcon />} onClick={() => goToDepartmentTickets({ status: "OPEN" })} />
            </Box>
            <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
              <KpiCard label="In Progress" value={kpis.in_progress} color="#eb6834" icon={<HourglassBottomIcon />} onClick={() => goToDepartmentTickets({ status: "IN_PROGRESS" })} />
            </Box>
            <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
              <KpiCard label="On Hold" value={kpis.on_hold} color="#eda100" icon={<PauseCircleOutlineIcon />} onClick={() => goToDepartmentTickets({ status: "ON_HOLD" })} />
            </Box>
            <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
              <KpiCard label="Resolved" value={kpis.resolved} color="#0ca30c" icon={<TaskAltIcon />} onClick={() => goToDepartmentTickets({ status: "RESOLVED" })} />
            </Box>
            <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
              <KpiCard label="Closed" value={kpis.closed} color="#898781" onClick={() => goToDepartmentTickets({ status: "CLOSED" })} />
            </Box>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <StatusPieChart data={byStatus} onSliceClick={(status) => goToDepartmentTickets({ status })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <PriorityBarChart data={byPriority} />
            </Grid>
          </Grid>

          <EmployeeWorkloadTable workload={workload} />
        </>
      )}
    </Stack>
  );
}
