import { useEffect, useState } from "react";
import { Paper, Stack, TextField, MenuItem, InputAdornment, Button } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { prioritiesApi } from "../../api/catalog";
import { usersApi } from "../../api/users";
import { departmentsApi } from "../../api/departments";
import { useAuth } from "../../context/AuthContext";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"];
const ASSIGNED_OPTIONS = [
  { value: "", label: "All" },
  { value: "true", label: "Assigned" },
  { value: "false", label: "Unassigned" },
];

// Search/status/priority/date-range filters for every ticket list, plus a
// set of role-gated extras (Department/Issue/Assignee/Assigned) that a
// caller opts into individually — never all shown at once, so ADMIN can get
// the richest filter set while AGENT/USER only see what's relevant to their
// authorized scope (see TicketsListPage.jsx's callers for exactly which
// flags each role passes). Every filter here only NARROWS the request sent
// to GET /tickets; the backend (ticket.service.js#listTickets) is what
// actually enforces the role-based authorization scope — this component
// has no say over what a request is allowed to return.
export default function TicketFilters({ filters, onChange, showAssigneeFilter, showDepartmentFilter, showIssueFilter, showAssignedFilter }) {
  const { user } = useAuth();
  const [priorities, setPriorities] = useState([]);
  const [agents, setAgents] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    prioritiesApi.list().then(({ data }) => setPriorities(data.data));
    // Already department-scoped for an AGENT caller server-side
    // (user.service.js#listAssignableEmployees) — never every employee.
    if (showAssigneeFilter) usersApi.assignableAgents().then(({ data }) => setAgents(data.data));
  }, [showAssigneeFilter]);

  useEffect(() => {
    // GET /departments is readable by any authenticated user (the ticket
    // form already relies on this), so this is not a new access grant.
    if (showDepartmentFilter || showIssueFilter) departmentsApi.list().then(({ data }) => setDepartments(data.data));
  }, [showDepartmentFilter, showIssueFilter]);

  const set = (field) => (e) => onChange({ ...filters, [field]: e.target.value, page: 1 });

  // Issue options come from whichever department is relevant: an ADMIN
  // picks a department first (same cascading UX as TicketForm's own
  // Department -> Issue picker); an AGENT's department is already fixed by
  // their own account, so their issues are available immediately with
  // nothing to pick.
  const issueSourceDepartment = showDepartmentFilter
    ? departments.find((d) => d.id === filters.departmentId)
    : departments.find((d) => d.id === user.departmentId);
  const issueOptions = issueSourceDepartment?.issues || [];

  const handleDepartmentChange = (e) => {
    onChange({ ...filters, departmentId: e.target.value, issueId: "", page: 1 });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
        {/* <TextField
          size="small"
          placeholder="Search title, requester, assignee..."
          value={filters.search || ""}
          onChange={set("search")}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 240 }}
        /> */}
        <TextField size="small" select label="Status" value={filters.status || ""} onChange={set("status")} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s.replace("_", " ")}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Priority" value={filters.priorityId || ""} onChange={set("priorityId")} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          {priorities.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        {showDepartmentFilter && (
          <TextField size="small" select label="Department" value={filters.departmentId || ""} onChange={handleDepartmentChange} sx={{ minWidth: 160 }}>
            <MenuItem value="">All</MenuItem>
            {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
        )}
        {showIssueFilter && (
          <TextField
            size="small"
            select
            label="Issue"
            value={filters.issueId || ""}
            onChange={set("issueId")}
            disabled={showDepartmentFilter && !filters.departmentId}
            helperText={showDepartmentFilter && !filters.departmentId ? "Select a department first" : ""}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All</MenuItem>
            {issueOptions.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
          </TextField>
        )}
        {showAssigneeFilter && (
          <TextField size="small" select label="Assignee" value={filters.assigneeId || ""} onChange={set("assigneeId")} sx={{ minWidth: 160 }}>
            <MenuItem value="">All</MenuItem>
            {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
          </TextField>
        )}
        {showAssignedFilter && (
          <TextField size="small" select label="Assigned" value={filters.assigned || ""} onChange={set("assigned")} sx={{ minWidth: 140 }}>
            {ASSIGNED_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        )}
        <TextField size="small" type="date" label="From" value={filters.dateFrom || ""} onChange={set("dateFrom")} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={filters.dateTo || ""} onChange={set("dateTo")} InputLabelProps={{ shrink: true }} />
        <Button size="small" onClick={() => onChange({ page: 1, limit: filters.limit })}>Clear</Button>
      </Stack>
    </Paper>
  );
}
