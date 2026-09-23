import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Fade, Grid, Stack, Typography, Button, ToggleButtonGroup, ToggleButton } from "@mui/material";
import ListAltIcon from "@mui/icons-material/ListAlt";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import ApartmentIcon from "@mui/icons-material/Apartment";
import { subDays } from "date-fns";
import { dashboardApi } from "../../api/dashboard";
import { useAuth } from "../../context/AuthContext";
import LoadingState from "../../components/common/LoadingState";
import KpiCard from "../../components/dashboard/KpiCard";
import StatusPieChart from "../../components/dashboard/StatusPieChart";
import PriorityBarChart from "../../components/dashboard/PriorityBarChart";
import TrendLineChart from "../../components/dashboard/TrendLineChart";
import DateRangeFilter from "../../components/dashboard/DateRangeFilter";
import EmployeeWorkloadTable from "../../components/dashboard/EmployeeWorkloadTable";
import { STATUS_SCALE } from "../../theme/theme";

// Two large, clickable page-level headings standing in for the usual
// single H4 title — literally variant="h4" (same font family/size/weight
// as AgentQueuePage.jsx's "My Tickets" heading; the theme applies its own
// fontWeight:800 to every h4, so both options are always equally bold, no
// active-vs-inactive weight difference), differentiated only by color (dark
// "text.primary" when active, muted "text.secondary" otherwise) and a red
// underline mirroring a Tabs indicator's thickness/position.
function DashboardViewSwitch({ view, onChange }) {
  const OPTIONS = [
    { value: "my", label: "My Dashboard" },
    { value: "department", label: "Department Dashboard" },
  ];
  return (
    <Stack direction="row" spacing={4} flexWrap="wrap" rowGap={1}>
      {OPTIONS.map((opt) => {
        const active = view === opt.value;
        return (
          <Typography
            key={opt.value}
            variant="h4"
            onClick={() => onChange(opt.value)}
            sx={{
              cursor: "pointer",
              userSelect: "none",
              color: active ? "text.primary" : "text.secondary",
              pb: "6px",
              borderBottom: "2px solid",
              borderColor: active ? "primary.main" : "transparent",
              transition: "color 0.15s ease, border-color 0.15s ease",
              "&:hover": active ? undefined : { color: "text.primary" },
            }}
          >
            {opt.label}
          </Typography>
        );
      })}
    </Stack>
  );
}

// ONE page (/agent), ONE `stats` fetch at a time, driven by `?view=` ("my",
// default, or "department") and, within "my", `?scope=` ("created", default
// = Raised by Me, or "assigned" = Assigned to Me). This is NOT two sidebar
// pages and Raised by Me / Assigned to Me are NOT two separate dashboards —
// switching either control only changes this component's own content and
// re-fetches GET /dashboard/stats with the right scope, it never navigates
// away from /agent.
//
// "my" + scope=created/assigned: the ENTIRE stats payload (KPI totals,
// status/priority breakdown, trend, and every chart built from them) comes
// back requesterId- or assigneeId-filtered — dashboardService.getStats
// already threads `scope` through scopeWhereForTab (ticket.service.js) for
// every query it runs, so passing "created"/"assigned" here needed no
// backend change at all, and the user id always comes from the
// authenticated req.user server-side, never a client-supplied value.
//
// "department": no scope passed, so dashboardService's normal role-based
// visibility (scopeWhereForUser) applies — for an AGENT that's exactly
// "every ticket routed to my department," real backend-enforced scoping,
// unaffected by who raised a given ticket.
export default function AgentDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "department" ? "department" : "my";
  const myScope = searchParams.get("scope") === "assigned" ? "assigned" : "created";

  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const dateFrom = subDays(new Date(), days).toISOString();
    const scope = view === "my" ? myScope : undefined;
    const { data } = await dashboardApi.getStats({ days, dateFrom, scope });
    setStats(data.data);
    setLoading(false);
  }, [days, view, myScope]);

  useEffect(() => {
    load();
  }, [load]);

  const handleViewChange = (value) => setSearchParams({ view: value });
  const handleMyScopeChange = (_event, value) => {
    if (!value) return; // ToggleButtonGroup fires with null when the active button is clicked again
    setSearchParams({ view: "my", scope: value });
  };

  // Drills into the SAME /agent/queue page's own My Tickets sub-filter (see
  // AgentQueuePage.jsx) — never a separate route — always using the My
  // Dashboard's CURRENTLY active mode (myScope), so an "Open" KPI clicked
  // while viewing Assigned to Me opens the queue scoped to assigned+OPEN,
  // never silently falling back to Raised by Me.
  const goToMyFilteredTickets = (params) => navigate(`/agent/queue?${new URLSearchParams({ view: "my", scope: myScope, ...params }).toString()}`);
  const goToDepartmentTickets = (params) => navigate(`/agent/queue?${new URLSearchParams({ view: "department", ...params }).toString()}`);

  const kpis = stats?.kpis;
  const byStatus = stats?.byStatus;
  const byPriority = stats?.byPriority;
  const trend = stats?.trend;
  const workload = stats?.workload;

  return (
    <Stack spacing={3}>
      {/* Header stays mounted across both loading and view-switch — this is
          what keeps the layout stable instead of flashing a full-page
          spinner (and losing scroll position) every time the switch or the
          date range is touched. DashboardViewSwitch is the page's only
          top-of-page heading (there is deliberately no separate large
          "Dashboard" title above it). */}
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "flex-end" }} spacing={1.5} flexWrap="wrap">
        <Box>
          <DashboardViewSwitch view={view} onChange={handleViewChange} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {view === "my"
              ? "Your personal tickets and assignments"
              : (user.department ? `${user.department.name} Department` : "No department assigned — contact an administrator")}
          </Typography>
        </Box>
        <DateRangeFilter days={days} onChange={setDays} />
      </Stack>

      {loading || !stats ? (
        <LoadingState minHeight={300} />
      ) : (
        // key={view} forces a clean remount on switch so the fade-in always
        // plays; entry-only (no coordinated exit) keeps this simple while
        // still reading as a subtle crossfade rather than a hard cut.
        <Fade in appear timeout={200} key={view}>
          <Box>
            {view === "my" ? (
              <Stack spacing={3}>
                {/* Same ToggleButtonGroup component/sx as AgentQueuePage.jsx's
                    "Raised by Me"/"Assigned to Me" control. Unlike a plain
                    nav shortcut, this one IS the My Dashboard's own data
                    mode: selecting it re-fetches stats with scope=created or
                    scope=assigned (see `load` above) rather than navigating
                    away — one dashboard, two datasets, same layout. */}
                <ToggleButtonGroup exclusive size="small" value={myScope} onChange={handleMyScopeChange}>
                  <ToggleButton value="created" sx={{ minWidth: 140, justifyContent: "center" }}>Raised by Me</ToggleButton>
                  <ToggleButton value="assigned" sx={{ minWidth: 140, justifyContent: "center" }}>Assigned to Me</ToggleButton>
                </ToggleButtonGroup>

                {/* Personal KPIs — one flex row (not the 12-column Grid,
                    since 6 doesn't divide evenly into 12) keeps all 6 cards
                    on one line on desktop. Every value here (and every chart
                    below) comes from the SAME scope=myScope stats payload,
                    so all of it — KPIs, pie/bar charts, trend — already
                    reflects whichever mode (Raised by Me / Assigned to Me)
                    is currently selected with no separate per-card scope
                    logic needed. */}
                <Box sx={{ display: "flex", flexWrap: { xs: "wrap", md: "nowrap" }, gap: 2 }}>
                  <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
                    <KpiCard label="Total Tickets" value={kpis.total} color="#6b1f25" icon={<ListAltIcon />} onClick={() => goToMyFilteredTickets({})} />
                  </Box>
                  <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
                    <KpiCard label="Open" value={kpis.open} color="#c81e2a" icon={<PendingActionsIcon />} onClick={() => goToMyFilteredTickets({ status: "OPEN" })} />
                  </Box>
                  <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
                    <KpiCard label="In Progress" value={kpis.in_progress} color="#eb6834" icon={<HourglassBottomIcon />} onClick={() => goToMyFilteredTickets({ status: "IN_PROGRESS" })} />
                  </Box>
                  <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
                    <KpiCard label="On Hold" value={kpis.on_hold} color="#eda100" icon={<PauseCircleOutlineIcon />} onClick={() => goToMyFilteredTickets({ status: "ON_HOLD" })} />
                  </Box>
                  <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
                    <KpiCard label="Resolved" value={kpis.resolved} color="#0ca30c" icon={<TaskAltIcon />} onClick={() => goToMyFilteredTickets({ status: "RESOLVED" })} />
                  </Box>
                  <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
                    <KpiCard label="Closed" value={kpis.closed} color="#898781" onClick={() => goToMyFilteredTickets({ status: "CLOSED" })} />
                  </Box>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <StatusPieChart data={byStatus} onSliceClick={(status) => goToMyFilteredTickets({ status })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <PriorityBarChart data={byPriority} />
                  </Grid>
                </Grid>

                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TrendLineChart data={trend} />
                  </Grid>
                </Grid>
              </Stack>
            ) : (
              <Stack spacing={3}>
                {/* Department KPIs — same flex-row treatment as above. */}
                <Box sx={{ display: "flex", flexWrap: { xs: "wrap", md: "nowrap" }, gap: 2 }}>
                  <Box sx={{ flex: { xs: "1 1 45%", sm: "1 1 30%", md: "1 1 0" }, minWidth: 0 }}>
                    <KpiCard label="Total Department Tickets" value={kpis.totalDepartmentTickets} color="#6b1f25" icon={<ApartmentIcon />} onClick={() => goToDepartmentTickets({})} />
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

                <Box>
                  <Button variant="outlined" startIcon={<ListAltIcon />} onClick={() => goToDepartmentTickets({})}>
                    View Department Tickets
                  </Button>
                </Box>
              </Stack>
            )}
          </Box>
        </Fade>
      )}
    </Stack>
  );
}
