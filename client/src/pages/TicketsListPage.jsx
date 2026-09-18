import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  Link as MuiLink,
  TableSortLabel,
  Toolbar,
  Button,
  MenuItem,
  TextField,
  Stack,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { format } from "date-fns";
import { ticketsApi } from "../api/tickets";
import { usersApi } from "../api/users";
import { prioritiesApi } from "../api/catalog";
import StatusBadge from "../components/common/StatusBadge";
import PriorityBadge from "../components/common/PriorityBadge";
import LoadingState from "../components/common/LoadingState";
import EmptyState from "../components/common/EmptyState";
import PaginationBar from "../components/common/PaginationBar";
import TicketFilters from "../components/tickets/TicketFilters";

const EMPTY_FILTERS = {};

// Shared ticket list, reused across all three portals. Row-level access is
// already enforced by the API (ticket.service.js#scopeWhereForUser) — an
// End User can only ever receive their own tickets here regardless of what
// filters are applied.
export default function TicketsListPage({ title, newTicketPath, showAssignee, showBulkActions, hideHeading = false, additionalFilters = EMPTY_FILTERS }) {
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    sortBy: "createdAt",
    sortOrder: "desc",
    status: searchParams.get("status") || "",
    overdue: searchParams.get("overdue") || "",
    search: searchParams.get("search") || "",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [agents, setAgents] = useState([]);
  const [priorities, setPriorities] = useState([]);

  useEffect(() => {
    if (!showBulkActions) return;
    usersApi.assignableAgents().then(({ data }) => setAgents(data.data));
    prioritiesApi.list().then(({ data }) => setPriorities(data.data));
  }, [showBulkActions]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = Object.fromEntries(
      Object.entries({ ...filters, ...additionalFilters }).filter(([, v]) => v !== "" && v !== undefined),
    );
    const { data } = await ticketsApi.list(params);
    setResult(data);
    setLoading(false);
  }, [filters, additionalFilters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const search = searchParams.get("search") || "";
    setFilters((current) => (current.search === search ? current : { ...current, search, page: 1 }));
  }, [searchParams]);

  const handleSort = (field) => {
    setFilters((f) => ({
      ...f,
      sortBy: field,
      sortOrder: f.sortBy === field && f.sortOrder === "asc" ? "desc" : "asc",
    }));
  };

  const toggleSelected = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const [bulkField, setBulkField] = useState("status");
  const [bulkValue, setBulkValue] = useState("");
  const handleBulkApply = async () => {
    if (!bulkValue || selected.length === 0) return;
    await ticketsApi.bulkUpdate({ ticketIds: selected, [bulkField]: bulkValue });
    setSelected([]);
    setBulkValue("");
    load();
  };

  const isOverdue = (t) => t.dueAt && new Date(t.dueAt) < new Date() && !["RESOLVED", "CLOSED"].includes(t.status);

  return (
    <Box>
      {!hideHeading && (
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
          <Typography variant="h4">{title}</Typography>
          {newTicketPath && (
            <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to={newTicketPath}>
              Raise a Ticket
            </Button>
          )}
        </Box>
      )}

      <TicketFilters filters={filters} onChange={setFilters} showAssignee={showAssignee} />

      {showBulkActions && selected.length > 0 && (
        <Toolbar sx={{ bgcolor: "action.selected", borderRadius: 1, mb: 1, flexWrap: "wrap", gap: 1 }}>
          <Typography sx={{ flex: 1 }}>{selected.length} selected</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              select
              label="Field"
              value={bulkField}
              onChange={(e) => { setBulkField(e.target.value); setBulkValue(""); }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="status">Status</MenuItem>
              <MenuItem value="priorityId">Priority</MenuItem>
              <MenuItem value="assigneeId">Assign to</MenuItem>
            </TextField>

            <TextField size="small" select label="Value" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} sx={{ minWidth: 180 }}>
              {bulkField === "status" && [
                <MenuItem key="IN_PROGRESS" value="IN_PROGRESS">In Progress</MenuItem>,
                <MenuItem key="ON_HOLD" value="ON_HOLD">On Hold</MenuItem>,
                <MenuItem key="RESOLVED" value="RESOLVED">Resolved</MenuItem>,
                <MenuItem key="CLOSED" value="CLOSED">Closed</MenuItem>,
              ]}
              {bulkField === "priorityId" && priorities.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              {bulkField === "assigneeId" && agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>

            <Button variant="contained" onClick={handleBulkApply} disabled={!bulkValue}>Apply</Button>
          </Stack>
        </Toolbar>
      )}

      {loading && <LoadingState />}

      {!loading && result?.data.length === 0 && (
        <EmptyState title="No tickets found" subtitle="Try adjusting your filters." />
      )}

      {!loading && result?.data.length > 0 && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                {showBulkActions && <TableCell padding="checkbox" />}
                <TableCell>Ticket #</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Requester</TableCell>
                {showAssignee && <TableCell>Assignee</TableCell>}
                <TableCell>Priority</TableCell>
                <TableCell>
                  <TableSortLabel active={filters.sortBy === "status"} direction={filters.sortOrder} onClick={() => handleSort("status")}>
                    Status
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={filters.sortBy === "createdAt"} direction={filters.sortOrder} onClick={() => handleSort("createdAt")}>
                    Created
                  </TableSortLabel>
                </TableCell>
                <TableCell>Due</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.data.map((t) => (
                <TableRow key={t.id} hover selected={selected.includes(t.id)}>
                  {showBulkActions && (
                    <TableCell padding="checkbox">
                      <Checkbox checked={selected.includes(t.id)} onChange={() => toggleSelected(t.id)} />
                    </TableCell>
                  )}
                  <TableCell>
                    <MuiLink component={RouterLink} to={`/tickets/${t.id}`} underline="hover" fontWeight={600}>
                      {t.ticketNumber}
                    </MuiLink>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</TableCell>
                  <TableCell>{t.requester?.name}</TableCell>
                  {showAssignee && <TableCell>{t.assignee?.name || "—"}</TableCell>}
                  <TableCell><PriorityBadge name={t.priority.name} color={t.priority.color} /></TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell>{format(new Date(t.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell sx={{ color: isOverdue(t) ? "error.main" : undefined, fontWeight: isOverdue(t) ? 700 : 400 }}>
                    {t.dueAt ? format(new Date(t.dueAt), "MMM d, yyyy") : "—"}
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
