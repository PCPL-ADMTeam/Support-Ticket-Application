import { Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell, Link as MuiLink } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { format } from "date-fns";
import StatusBadge from "../common/StatusBadge";
import PriorityBadge from "../common/PriorityBadge";

export default function RecentTicketsTable({ tickets }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Recent Tickets</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Ticket</TableCell>
            <TableCell>Requester</TableCell>
            <TableCell>Priority</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t.id} hover>
              <TableCell>
                <MuiLink component={RouterLink} to={`/tickets/${t.id}`} underline="hover">
                  {t.ticketNumber} — {t.title}
                </MuiLink>
              </TableCell>
              <TableCell>{t.requester?.name}</TableCell>
              <TableCell><PriorityBadge name={t.priority.name} color={t.priority.color} /></TableCell>
              <TableCell><StatusBadge status={t.status} /></TableCell>
              <TableCell>{format(new Date(t.createdAt), "MMM d, yyyy")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
