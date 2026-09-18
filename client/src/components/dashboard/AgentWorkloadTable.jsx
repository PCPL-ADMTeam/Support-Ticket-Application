import { Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, LinearProgress, Box } from "@mui/material";

export default function AgentWorkloadTable({ workload }) {
  const max = Math.max(...workload.map((w) => w.openTickets), 1);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Agent Workload (Open Tickets)</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Agent</TableCell>
            <TableCell>Load</TableCell>
            <TableCell align="right">Open</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {workload.map((w) => (
            <TableRow key={w.agentId}>
              <TableCell>{w.agentName}</TableCell>
              <TableCell sx={{ width: "50%" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={(w.openTickets / max) * 100}
                    sx={{ flex: 1, height: 8, borderRadius: 4 }}
                  />
                </Box>
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{w.openTickets}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
