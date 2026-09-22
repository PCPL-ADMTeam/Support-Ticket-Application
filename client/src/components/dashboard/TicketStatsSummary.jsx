import { Grid } from "@mui/material";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import KpiCard from "./KpiCard";
import StatusPieChart from "./StatusPieChart";
import PriorityBarChart from "./PriorityBarChart";
import TrendLineChart from "./TrendLineChart";

// The standard "Total / Open / In Progress / On Hold / Resolved / Closed"
// KPI row + Status/Priority charts + created-vs-resolved trend chart.
// Shared by DashboardPage.jsx (Admin's full view and every USER personal
// tab) and AgentDashboardPage.jsx (the Agent's own Raised-by-Me/Assigned-
// to-Me tabs) so all of these views render from exactly one implementation
// — never a visually-similar duplicate — whatever `stats` they're handed
// (already scoped server-side by the caller, e.g. a `scope=created` stats
// response for a "Raised by Me" tab).
export default function TicketStatsSummary({ stats, goToTickets }) {
  const { kpis, byStatus, byPriority, trend } = stats;

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
          <KpiCard label="On Hold" value={kpis.on_hold} color="#eda100" icon={<PauseCircleOutlineIcon />} onClick={() => goToTickets({ status: "ON_HOLD" })} />
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

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TrendLineChart data={trend} />
        </Grid>
      </Grid>
    </>
  );
}
