import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Grid, Stack, Box, Typography } from "@mui/material";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import { subDays } from "date-fns";
import { dashboardApi } from "../api/dashboard";
import LoadingState from "../components/common/LoadingState";
import KpiCard from "../components/dashboard/KpiCard";
import StatusPieChart from "../components/dashboard/StatusPieChart";
import PriorityBarChart from "../components/dashboard/PriorityBarChart";
import CategoryBarChart from "../components/dashboard/CategoryBarChart";
import TrendLineChart from "../components/dashboard/TrendLineChart";
import AgentWorkloadTable from "../components/dashboard/AgentWorkloadTable";
import RecentTicketsTable from "../components/dashboard/RecentTicketsTable";
import DateRangeFilter from "../components/dashboard/DateRangeFilter";

// Shared dashboard used by all three portals. `variant="full"` (Admin) shows
// every widget; `variant="personal"` (Agent/User) shows a lighter set scoped
// server-side to the caller's own tickets — see dashboard.service.js.
export default function DashboardPage({ variant = "personal", ticketsPath }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  const goToTickets = (params) => navigate(`${ticketsPath}?${new URLSearchParams(params).toString()}`);

  if (loading || !stats) return <LoadingState minHeight={400} />;

  const { kpis, byStatus, byPriority, byCategory, trend, workload, avgResolutionHours, slaComplianceRate, recentTickets } = stats;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h4">{variant === "full" ? "Dashboard" : "My Dashboard"}</Typography>
        <DateRangeFilter days={days} onChange={setDays} />
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard label="Total" value={kpis.total} color="#2a78d6" icon={<ConfirmationNumberIcon />} onClick={() => goToTickets({})} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard label="Open" value={kpis.open} color="#2a78d6" icon={<PendingActionsIcon />} onClick={() => goToTickets({ status: "OPEN" })} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard label="In Progress" value={kpis.in_progress} color="#eb6834" icon={<HourglassBottomIcon />} onClick={() => goToTickets({ status: "IN_PROGRESS" })} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard label="On Hold" value={kpis.on_hold} color="#eda100" onClick={() => goToTickets({ status: "ON_HOLD" })} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard label="Resolved" value={kpis.resolved} color="#0ca30c" icon={<TaskAltIcon />} onClick={() => goToTickets({ status: "RESOLVED" })} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard label="Overdue (SLA)" value={kpis.overdue} color="#d03b3b" icon={<WarningAmberIcon />} onClick={() => goToTickets({ overdue: "true" })} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <KpiCard label="Closed" value={kpis.closed} color="#898781" />
        </Grid>
        <Grid item xs={12} md={4}>
          <KpiCard label="Avg. Resolution Time" value={avgResolutionHours != null ? `${avgResolutionHours}h` : "—"} color="#4a3aa7" />
        </Grid>
        <Grid item xs={12} md={4}>
          <KpiCard label="SLA Compliance" value={slaComplianceRate != null ? `${slaComplianceRate}%` : "—"} color="#1baf7a" />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <StatusPieChart data={byStatus} onSliceClick={(status) => goToTickets({ status })} />
        </Grid>
        <Grid item xs={12} md={6}>
          <PriorityBarChart data={byPriority} onBarClick={() => {}} />
        </Grid>
      </Grid>

      {variant === "full" && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <CategoryBarChart data={byCategory} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TrendLineChart data={trend} />
          </Grid>
        </Grid>
      )}

      {variant === "personal" && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TrendLineChart data={trend} />
          </Grid>
        </Grid>
      )}

      {variant === "full" && workload.length > 0 && <AgentWorkloadTable workload={workload} />}

      <RecentTicketsTable tickets={recentTickets} />
    </Stack>
  );
}
