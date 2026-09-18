import { useEffect, useState, useCallback } from "react";
import { Box, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell, Chip, TextField, Stack } from "@mui/material";
import { format } from "date-fns";
import { auditLogsApi } from "../../api/auditLogs";
import LoadingState from "../../components/common/LoadingState";
import PaginationBar from "../../components/common/PaginationBar";
import EmptyState from "../../components/common/EmptyState";

export default function AuditLogsPage() {
  const [filters, setFilters] = useState({ page: 1, limit: 20, entityType: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""));
    const { data } = await auditLogsApi.list(params);
    setResult(data);
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Audit Logs</Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Entity Type"
          placeholder="e.g. User, Ticket, Team"
          value={filters.entityType}
          onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value, page: 1 }))}
        />
      </Stack>

      {loading && <LoadingState />}
      {!loading && result?.data.length === 0 && <EmptyState title="No audit entries found" />}
      {!loading && result?.data.length > 0 && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entity</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.data.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell>{format(new Date(log.createdAt), "MMM d, yyyy h:mm a")}</TableCell>
                  <TableCell>{log.user?.name || "System"}</TableCell>
                  <TableCell><Chip size="small" label={log.action} /></TableCell>
                  <TableCell>{log.entityType}{log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}</TableCell>
                  <TableCell sx={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.newValues ? JSON.stringify(log.newValues) : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar
            pagination={result.pagination}
            onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
            onLimitChange={(limit) => setFilters((f) => ({ ...f, limit, page: 1 }))}
          />
        </Paper>
      )}
    </Box>
  );
}
