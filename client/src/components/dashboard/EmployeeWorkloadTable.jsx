import { Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, Chip } from "@mui/material";

// Department-manager view of per-employee ticket load — distinct from the
// Admin dashboard's AgentWorkloadTable (single "Open" column) because a
// manager needs the Open/In Progress/Resolved breakdown to see who's
// actively working something vs. who's free to take on more. Backed by the
// same /dashboard/stats `workload` array (see dashboard.service.js), which
// is already scoped to the caller's own department for an AGENT.
export default function EmployeeWorkloadTable({ workload }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Employee Workload</Typography>
      {workload.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No active employees in this department yet.</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Employee</TableCell>
              <TableCell align="right">Open</TableCell>
              <TableCell align="right">In Progress</TableCell>
              <TableCell align="right">Resolved</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {workload.map((w) => (
              <TableRow key={w.agentId} hover>
                <TableCell>{w.agentName}</TableCell>
                <TableCell align="right">
                  {w.openTickets > 0 ? (
                    <Chip size="small" label={w.openTickets} color="warning" variant="outlined" />
                  ) : (
                    <Chip size="small" label="0" variant="outlined" />
                  )}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{w.inProgressTickets}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{w.resolvedTickets}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
