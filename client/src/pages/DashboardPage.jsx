import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Grid, Stack, Box, Typography, Tabs, Tab } from "@mui/material";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
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
import DateRangeFilter from "../components/dashboard/DateRangeFilter";

const SCOPES = ["assigned", "created"];

// Shared dashboard used by all three portals. `variant="full"` (Admin) shows
// every widget; `variant="personal"` (Agent/User) shows a lighter set scoped
// server-side to the caller's own tickets — see dashboard.service.js.
// The My Tickets / My Requests tabs re-fetch stats scoped to tickets
// assigned to, or raised by, the current user (dashboard.service.js scope
// param) — every number below reflects real tickets, nothing hardcoded.
export default function DashboardPage({ variant = "personal", ticketsPath }) {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const scope = SCOPES[tab];

  const load = useCallback(async () => {
    setLoading(true);
    const dateFrom = subDays(new Date(), days).toISOString();
    const { data } = await dashboardApi.getStats({ days, dateFrom, scope });
    setStats(data.data);
    setLoading(false);
  }, [days, scope]);

  useEffect(() => {
    load();
  }, [load]);

  const goToTickets = (params) => navigate(`${ticketsPath}?${new URLSearchParams(params).toString()}`);

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h4">{variant === "full" ? "Dashboard" : "My Dashboard"}</Typography>
        <DateRangeFilter days={days} onChange={setDays} />
      </Box>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab label="My Tickets" id="dashboard-my-tickets-tab" />
        <Tab label="My Requests" id="dashboard-my-requests-tab" />
      </Tabs>

      {loading || !stats ? (
        <LoadingState minHeight={400} />
      ) : (
        <DashboardContent
          variant={variant}
          stats={stats}
          goToTickets={goToTickets}
        />
      )}
    </Stack>
  );
}

function DashboardContent({ variant, stats, goToTickets }) {
  const { kpis, byStatus, byPriority, byCategory, trend, workload } = stats;

  return (
    <>
      <Grid container spacing={2}>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard label="Total" value={kpis.total} color="#c81e2a" icon={<ConfirmationNumberIcon />} onClick={() => goToTickets({})} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard label="Open" value={kpis.open} color="#c81e2a" icon={<PendingActionsIcon />} onClick={() => goToTickets({ status: "OPEN" })} />
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
          <KpiCard label="Closed" value={kpis.closed} color="#898781" onClick={() => goToTickets({ status: "CLOSED" })} />
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
    </>
  );
}
