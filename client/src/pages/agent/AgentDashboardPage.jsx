import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Grid, Stack, Typography, Chip } from "@mui/material";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import { subDays } from "date-fns";
import { dashboardApi } from "../../api/dashboard";
import { useAuth } from "../../context/AuthContext";
import LoadingState from "../../components/common/LoadingState";
import KpiCard from "../../components/dashboard/KpiCard";
import StatusPieChart from "../../components/dashboard/StatusPieChart";
import PriorityBarChart from "../../components/dashboard/PriorityBarChart";
import DateRangeFilter from "../../components/dashboard/DateRangeFilter";
import EmployeeWorkloadTable from "../../components/dashboard/EmployeeWorkloadTable";
import TicketsListPage from "../TicketsListPage";
import { STATUS_SCALE } from "../../theme/theme";

// AGENT = department manager (never an individual contributor with a
// personal ticket queue), so unlike the shared DashboardPage used by
// Admin/User, this page has no "Raised by Me" / "Assigned to Me" tabs and
// never passes a `scope` to GET /dashboard/stats. Omitting `scope` falls
// through to dashboardService's normal role-based visibility
// (scopeWhereForUser in ticket.service.js), which for an AGENT already
// means "every ticket routed to my department" — real backend-enforced
// scoping, not a client-side filter, so this can never be tricked into
// showing another department's data.
export default function AgentDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const dateFrom = subDays(new Date(), days).toISOString();
    const { data } = await dashboardApi.getStats({ days, dateFrom });
    setStats(data.data);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const goToQueue = (params) => navigate(`/agent/queue?${new URLSearchParams(params).toString()}`);

  if (loading || !stats) return <LoadingState minHeight={400} />;

  const { kpis, byStatus, byPriority, workload } = stats;

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5} flexWrap="wrap">
        <Box>
          <Typography variant="h4">My Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            {user.department ? `${user.department.name} Department` : "No department assigned — contact an administrator"}
          </Typography>
        </Box>
        <DateRangeFilter days={days} onChange={setDays} />
      </Stack>

      {/* Unassigned is a real KPI (kept in exact department-manager order:
          Total, Unassigned, Open, In Progress, On Hold, Resolved, Closed)
          but gets the warning accent color + its own icon so it's the one
          that visually jumps out as an action item, per the manager's #1
          responsibility (assigning department tickets). `md` with no value
          (rather than a fixed integer) splits 7 cards evenly instead of
          fighting the 12-column grid. */}
      <Grid container spacing={2}>
        <Grid item xs={6} sm={4} md>
          <KpiCard label="Total" value={kpis.total} color="#c81e2a" icon={<ConfirmationNumberIcon />} onClick={() => goToQueue({})} />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <KpiCard label="Unassigned" value={kpis.unassigned} color={STATUS_SCALE.warning} icon={<AssignmentLateIcon />} onClick={() => goToQueue({ assigned: "false" })} />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <KpiCard label="Open" value={kpis.open} color="#c81e2a" icon={<PendingActionsIcon />} onClick={() => goToQueue({ status: "OPEN" })} />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <KpiCard label="In Progress" value={kpis.in_progress} color="#eb6834" icon={<HourglassBottomIcon />} onClick={() => goToQueue({ status: "IN_PROGRESS" })} />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <KpiCard label="On Hold" value={kpis.on_hold} color="#eda100" onClick={() => goToQueue({ status: "ON_HOLD" })} />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <KpiCard label="Resolved" value={kpis.resolved} color="#0ca30c" icon={<TaskAltIcon />} onClick={() => goToQueue({ status: "RESOLVED" })} />
        </Grid>
        <Grid item xs={6} sm={4} md>
          <KpiCard label="Closed" value={kpis.closed} color="#898781" onClick={() => goToQueue({ status: "CLOSED" })} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <StatusPieChart data={byStatus} onSliceClick={(status) => goToQueue({ status })} />
        </Grid>
        <Grid item xs={12} md={6}>
          <PriorityBarChart data={byPriority} />
        </Grid>
      </Grid>

      <EmployeeWorkloadTable workload={workload} />

      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
          <Typography variant="h6">Department Ticket Queue</Typography>
          <Chip
            label={unassignedOnly ? "Showing unassigned only" : "Show unassigned only"}
            color={unassignedOnly ? "warning" : "default"}
            variant={unassignedOnly ? "filled" : "outlined"}
            onClick={() => setUnassignedOnly((v) => !v)}
            clickable
          />
        </Stack>
        <TicketsListPage
          hideHeading
          showAssignee
          showAssigneeFilter
          showRequester
          showIssue
          showIssueFilter
          showAssignedFilter
          showDepartment={false}
          highlightUnassigned
          additionalFilters={unassignedOnly ? { assigned: "false" } : {}}
        />
      </Box>
    </Stack>
  );
}
