import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Grid,
  Stack,
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Link as MuiLink,
} from "@mui/material";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import { format } from "date-fns";
import { dashboardApi } from "../../api/dashboard";
import LoadingState from "../../components/common/LoadingState";
import EmptyState from "../../components/common/EmptyState";
import KpiCard from "../../components/dashboard/KpiCard";
import StatusPieChart from "../../components/dashboard/StatusPieChart";
import StatusBadge from "../../components/common/StatusBadge";
import PriorityBadge from "../../components/common/PriorityBadge";

// The Manager's landing page: statistics for their own department only.
// GET /dashboard/stats is scoped server-side (dashboard.service.js ->
// scopeWhereForUser) to `toDepartmentId = user.departmentId` for a MANAGER,
// so every number here already excludes every other department — nothing
// extra to filter client-side.
export default function ManagerDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await dashboardApi.getStats({ days: 30 });
    setStats(data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goToTickets = (path, params = {}) => {
    const query = new URLSearchParams(params).toString();
    navigate(query ? `${path}?${query}` : path);
  };

  if (loading || !stats) return <LoadingState minHeight={400} />;

  const { kpis, byStatus, recentTickets } = stats;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Dashboard</Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4} md={3}>
          <KpiCard
            label="Total Tickets"
            value={kpis.total}
            color="#c81e2a"
            icon={<ConfirmationNumberIcon />}
            onClick={() => goToTickets("/manager/tickets")}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <KpiCard
            label="Unassigned"
            value={kpis.unassigned}
            color="#eda100"
            icon={<AssignmentLateIcon />}
            onClick={() => goToTickets("/manager/unassigned")}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <KpiCard
            label="Assigned"
            value={kpis.assigned}
            color="#2e7d32"
            icon={<AssignmentTurnedInIcon />}
            onClick={() => goToTickets("/manager/assigned")}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <KpiCard
            label="In Progress"
            value={kpis.in_progress}
            color="#eb6834"
            icon={<HourglassBottomIcon />}
            onClick={() => goToTickets("/manager/tickets", { status: "IN_PROGRESS" })}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <KpiCard
            label="Resolved"
            value={kpis.resolved}
            color="#0ca30c"
            icon={<TaskAltIcon />}
            onClick={() => goToTickets("/manager/tickets", { status: "RESOLVED" })}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <KpiCard
            label="Overdue"
            value={kpis.overdue}
            color="#c81e2a"
            icon={<WarningAmberIcon />}
            onClick={() => goToTickets("/manager/overdue")}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <KpiCard
            label="High/Critical"
            value={kpis.highCritical}
            color="#d03b3b"
            icon={<LocalFireDepartmentIcon />}
            onClick={() => goToTickets("/manager/tickets", { highCritical: "true" })}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <StatusPieChart data={byStatus} onSliceClick={(status) => goToTickets("/manager/tickets", { status })} />
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, height: 340, overflow: "auto" }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Recent Tickets</Typography>
            {recentTickets.length === 0 ? (
              <EmptyState title="No tickets yet" subtitle="New department tickets will show up here." />
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Ticket #</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentTickets.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell>
                        <MuiLink component={RouterLink} to={`/tickets/${t.id}`} underline="hover" fontWeight={600}>
                          {t.ticketNumber}
                        </MuiLink>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</TableCell>
                      <TableCell><PriorityBadge name={t.priority.name} color={t.priority.color} /></TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell>{t.assignee?.name || "—"}</TableCell>
                      <TableCell>{format(new Date(t.createdAt), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
