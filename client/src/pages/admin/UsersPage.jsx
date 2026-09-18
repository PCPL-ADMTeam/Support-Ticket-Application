import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  Autocomplete,
  FormControlLabel,
  Switch,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import BlockIcon from "@mui/icons-material/Block";
import AddIcon from "@mui/icons-material/Add";
import { useSnackbar } from "notistack";
import { usersApi } from "../../api/users";
import { teamsApi } from "../../api/teams";
import { departmentsApi } from "../../api/departments";
import LoadingState from "../../components/common/LoadingState";
import PaginationBar from "../../components/common/PaginationBar";
import ConfirmDialog from "../../components/common/ConfirmDialog";

const ROLES = ["ADMIN", "AGENT", "USER"];

const emptyForm = { id: null, name: "", email: "", password: "", roleName: "USER", teamIds: [], departmentId: "", isManager: false };

export default function UsersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [filters, setFilters] = useState({ page: 1, limit: 20, search: "", role: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""));
    const { data } = await usersApi.list(params);
    setResult(data);
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { teamsApi.list().then(({ data }) => setTeams(data.data)); }, []);
  useEffect(() => { departmentsApi.list().then(({ data }) => setDepartments(data.data)); }, []);

  const openCreate = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (u) => {
    setForm({
      id: u.id,
      name: u.name,
      email: u.email,
      password: "",
      roleName: u.role.name,
      teamIds: u.teamMemberships.map((m) => m.team.id),
      departmentId: u.departmentId || "",
      isManager: u.isManager,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const shared = { departmentId: form.departmentId || null, isManager: form.isManager };
      if (form.id) {
        await usersApi.update(form.id, { name: form.name, roleName: form.roleName, teamIds: form.teamIds, ...shared });
      } else {
        await usersApi.create({ name: form.name, email: form.email, password: form.password, roleName: form.roleName, teamIds: form.teamIds, ...shared });
      }
      setDialogOpen(false);
      load();
      enqueueSnackbar("User saved", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Save failed", { variant: "error" });
    }
  };

  const handleDeactivate = async () => {
    try {
      await usersApi.deactivate(deactivateTarget.id);
      setDeactivateTarget(null);
      load();
      enqueueSnackbar("User deactivated", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to deactivate", { variant: "error" });
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h4">Users</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New User</Button>
      </Box>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField size="small" label="Search" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))} />
        <TextField size="small" select label="Role" value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value, page: 1 }))} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
        </TextField>
      </Stack>

      {loading ? <LoadingState /> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Teams</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.data.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Chip size="small" label={u.role.name} /></TableCell>
                  <TableCell>{u.teamMemberships.map((m) => m.team.name).join(", ") || "—"}</TableCell>
                  <TableCell>
                    {u.department?.name || "—"}
                    {u.isManager && <Chip size="small" label="Manager" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={u.isActive ? "Active" : "Inactive"} color={u.isActive ? "success" : "default"} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(u)}><EditIcon fontSize="small" /></IconButton>
                    {u.isActive && (
                      <IconButton size="small" onClick={() => setDeactivateTarget(u)}><BlockIcon fontSize="small" /></IconButton>
                    )}
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{form.id ? "Edit User" : "New User"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
            <TextField label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} fullWidth disabled={Boolean(form.id)} />
            {!form.id && (
              <TextField label="Temporary Password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} fullWidth helperText="At least 8 characters" />
            )}
            <TextField select label="Role" value={form.roleName} onChange={(e) => setForm((f) => ({ ...f, roleName: e.target.value }))} fullWidth>
              {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>
            <Autocomplete
              multiple
              options={teams}
              getOptionLabel={(t) => t.name}
              value={teams.filter((t) => form.teamIds.includes(t.id))}
              onChange={(_e, value) => setForm((f) => ({ ...f, teamIds: value.map((v) => v.id) }))}
              renderInput={(params) => <TextField {...params} label="Teams" />}
            />
            <TextField
              select
              label="Department"
              value={form.departmentId}
              onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
              fullWidth
              helperText="The requester's own department, used to auto-fill the ticket form"
            >
              <MenuItem value="">None</MenuItem>
              {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
            </TextField>
            <FormControlLabel
              control={<Switch checked={form.isManager} onChange={(e) => setForm((f) => ({ ...f, isManager: e.target.checked }))} />}
              label="Is a department manager (selectable as a ticket's Manager)"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title="Deactivate user?"
        message={`${deactivateTarget?.name} will no longer be able to sign in.`}
        confirmLabel="Deactivate"
        danger
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
      />
    </Box>
  );
}
