import { useEffect, useState } from "react";
import { Paper, Stack, TextField, MenuItem, InputAdornment, Button } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { prioritiesApi, categoriesApi } from "../../api/catalog";
import { usersApi } from "../../api/users";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"];

// Search/status/priority/category/assignee/date-range filters for a ticket
// list. `showAssignee`/`showCategory` are only relevant to Admin/Manager/Agent
// views.
export default function TicketFilters({ filters, onChange, showAssignee, showCategory }) {
  const [priorities, setPriorities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    prioritiesApi.list().then(({ data }) => setPriorities(data.data));
    if (showAssignee) usersApi.assignableUsers().then(({ data }) => setAgents(data.data));
    if (showCategory) categoriesApi.list().then(({ data }) => setCategories(data.data));
  }, [showAssignee, showCategory]);

  const flatCategories = categories.flatMap((c) => [c, ...(c.children || [])]);

  const set = (field) => (e) => onChange({ ...filters, [field]: e.target.value, page: 1 });

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField
          size="small"
          placeholder="Search title or ticket #"
          value={filters.search || ""}
          onChange={set("search")}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 220 }}
        />
        <TextField size="small" select label="Status" value={filters.status || ""} onChange={set("status")} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s.replace("_", " ")}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Priority" value={filters.priorityId || ""} onChange={set("priorityId")} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          {priorities.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        {showCategory && (
          <TextField size="small" select label="Category" value={filters.categoryId || ""} onChange={set("categoryId")} sx={{ minWidth: 160 }}>
            <MenuItem value="">All</MenuItem>
            {flatCategories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
        )}
        {showAssignee && (
          <TextField size="small" select label="Assignee" value={filters.assigneeId || ""} onChange={set("assigneeId")} sx={{ minWidth: 160 }}>
            <MenuItem value="">All</MenuItem>
            {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
          </TextField>
        )}
        <TextField size="small" type="date" label="From" value={filters.dateFrom || ""} onChange={set("dateFrom")} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={filters.dateTo || ""} onChange={set("dateTo")} InputLabelProps={{ shrink: true }} />
        <Button size="small" onClick={() => onChange({ page: 1, limit: filters.limit })}>Clear</Button>
      </Stack>
    </Paper>
  );
}
