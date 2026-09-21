import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  Alert,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useSnackbar } from "notistack";
import { departmentsApi, issuesApi } from "../../api/departments";
import { usersApi } from "../../api/users";
import LoadingState from "../../components/common/LoadingState";
import EmptyState from "../../components/common/EmptyState";
import ConfirmDialog from "../../components/common/ConfirmDialog";

// Department = the organizational unit (one AGENT manager + its USER
// employees via User.departmentId). "Team Members" below is UI terminology
// only — there is no Team/TeamMember model behind it, just department
// membership managed through the existing user APIs.
export default function DepartmentDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [department, setDepartment] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await departmentsApi.list();
    setDepartment(data.data.find((d) => d.id === id) || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;
  if (!department) return <EmptyState title="Department not found" subtitle="It may have been deleted." />;

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/admin/departments")} sx={{ mb: 1.5 }}>
        Back to Departments
      </Button>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h4">{department.name}</Typography>
        <Chip label={`Prefix: ${department.ticketPrefix}`} sx={{ fontFamily: "monospace" }} />
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Next ticket for this department will be numbered {department.ticketPrefix}-{String(department.ticketSequence + 1).padStart(4, "0")}.
        To change the prefix, edit this department from the Departments list.
      </Typography>

      <Stack spacing={3} sx={{ mt: 2 }}>
        <ManagerSection department={department} onChanged={load} />
        <TeamMembersSection department={department} onChanged={load} />
        <IssueTitlesSection department={department} onChanged={load} />
      </Stack>
    </Box>
  );
}

/* =========================================================
   MANAGER
========================================================= */

function ManagerSection({ department, onChanged }) {
  const { enqueueSnackbar } = useSnackbar();
  // The backend now enforces at most one active AGENT-manager per
  // department (see user.service.js#displaceOtherActiveManagers), so this
  // should never be >1 — surfaced explicitly rather than silently picking
  // managers[0], which is what made a past data-integrity bug look like a
  // stale-display bug.
  const managers = department.managers || [];
  const manager = managers[0] || null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [moveConfirmOpen, setMoveConfirmOpen] = useState(false);

  const openDialog = async () => {
    const { data } = await usersApi.list({ role: "AGENT", isActive: "true", limit: 100 });
    setAgents(data.data);
    setSelected(null);
    setDialogOpen(true);
  };

  const applyManager = async (agent) => {
    try {
      // isManager stays derived server-side from role=AGENT — we only ever
      // move the department assignment here, never set isManager directly.
      await usersApi.update(agent.id, { departmentId: department.id });
      enqueueSnackbar(`${agent.name} is now the manager of ${department.name}`, { variant: "success" });
      setDialogOpen(false);
      setMoveConfirmOpen(false);
      onChanged();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to assign manager", { variant: "error" });
    }
  };

  const handleSave = () => {
    if (!selected) return;
    if (selected.departmentId && selected.departmentId !== department.id) {
      setMoveConfirmOpen(true);
    } else {
      applyManager(selected);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Manager</Typography>

      {managers.length > 1 && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Data inconsistency: {managers.length} active managers found ({managers.map((m) => m.name).join(", ")}). There should only ever be one — use Change Manager to fix this.
        </Alert>
      )}

      {manager ? (
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Box>
            <Typography variant="body1">{manager.name}</Typography>
            <Typography variant="body2" color="text.secondary">{manager.email}</Typography>
          </Box>
          <Button variant="outlined" size="small" onClick={openDialog}>Change Manager</Button>
        </Stack>
      ) : (
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="body2" color="text.secondary">No manager assigned</Typography>
          <Button variant="contained" size="small" onClick={openDialog}>Assign Manager</Button>
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{manager ? "Change" : "Assign"} Manager — {department.name}</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 1 }}
            options={agents}
            getOptionLabel={(a) => (a.departmentId && a.departmentId !== department.id ? `${a.name} (currently in ${a.department?.name || "another department"})` : a.name)}
            value={selected}
            onChange={(_e, value) => setSelected(value)}
            renderInput={(params) => <TextField {...params} label="Select an AGENT" placeholder="Search agents" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!selected} onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={moveConfirmOpen}
        title="Move manager?"
        message={selected ? `${selected.name} currently belongs to ${selected.department?.name || "another department"}. Assign them as ${department.name}'s manager and move them here?` : ""}
        confirmLabel="Move & Assign"
        onClose={() => setMoveConfirmOpen(false)}
        onConfirm={() => applyManager(selected)}
      />
    </Paper>
  );
}

/* =========================================================
   TEAM MEMBERS (= department employees; no Team model involved)
========================================================= */

function TeamMembersSection({ department, onChanged }) {
  const { enqueueSnackbar } = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [moveConfirmOpen, setMoveConfirmOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  const openAdd = async () => {
    const { data } = await usersApi.list({ role: "USER", isActive: "true", limit: 100 });
    setCandidates(data.data.filter((u) => u.departmentId !== department.id));
    setSelected(null);
    setAddOpen(true);
  };

  const applyAdd = async (user) => {
    try {
      await usersApi.update(user.id, { departmentId: department.id });
      enqueueSnackbar(`${user.name} added to ${department.name}`, { variant: "success" });
      setAddOpen(false);
      setMoveConfirmOpen(false);
      onChanged();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to add employee", { variant: "error" });
    }
  };

  const handleAddSave = () => {
    if (!selected) return;
    if (selected.departmentId) {
      setMoveConfirmOpen(true);
    } else {
      applyAdd(selected);
    }
  };

  const handleRemove = async () => {
    try {
      await usersApi.update(removeTarget.id, { departmentId: null });
      enqueueSnackbar(`${removeTarget.name} removed from ${department.name}`, { variant: "success" });
      setRemoveTarget(null);
      onChanged();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to remove employee", { variant: "error" });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>Team Members</Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Employee</Button>
      </Stack>

      {department.employees.length === 0 ? (
        <EmptyState title="No employees yet" subtitle="Add USER accounts to this department." />
      ) : (
        <List dense disablePadding>
          {department.employees.map((u) => (
            <ListItem key={u.id} divider sx={{ px: 0 }}>
              <ListItemText primary={u.name} secondary={u.email} />
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label="USER" />
                {!u.isActive && <Chip size="small" label="Inactive" />}
                <Button size="small" color="error" onClick={() => setRemoveTarget(u)}>Remove</Button>
              </Stack>
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add Employee to {department.name}</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 1 }}
            options={candidates}
            getOptionLabel={(u) => (u.department ? `${u.name} (currently in ${u.department.name})` : u.name)}
            value={selected}
            onChange={(_e, value) => setSelected(value)}
            renderInput={(params) => <TextField {...params} label="Select a USER" placeholder="Search employees" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!selected} onClick={handleAddSave}>Add</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={moveConfirmOpen}
        title="Move employee?"
        message={selected ? `${selected.name} currently belongs to ${selected.department?.name || "another department"}. Move them to ${department.name}?` : ""}
        confirmLabel="Move"
        onClose={() => setMoveConfirmOpen(false)}
        onConfirm={() => applyAdd(selected)}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={`Remove ${removeTarget?.name} from ${department.name}?`}
        message="This only clears their department assignment — the user account itself is not deleted."
        confirmLabel="Remove"
        danger
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
      />
    </Paper>
  );
}

/* =========================================================
   ISSUE TITLES (existing Issue model/API — "Others" untouched)
========================================================= */

function IssueTitlesSection({ department, onChanged }) {
  const { enqueueSnackbar } = useSnackbar();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ id: null, name: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const openCreate = () => { setForm({ id: null, name: "" }); setDialogOpen(true); };
  const openEdit = (issue) => { setForm({ id: issue.id, name: issue.name }); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (form.id) {
        await issuesApi.update(form.id, { name: form.name });
      } else {
        await issuesApi.create({ departmentId: department.id, name: form.name });
      }
      setDialogOpen(false);
      onChanged();
      enqueueSnackbar("Issue saved", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Save failed", { variant: "error" });
    }
  };

  const handleDelete = async () => {
    try {
      await issuesApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      onChanged();
      enqueueSnackbar("Issue deleted", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to delete", { variant: "error" });
    }
  };

  const normalIssues = department.issues.filter((i) => !i.isOther);
  const othersIssue = department.issues.find((i) => i.isOther);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>Issue Titles</Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add Issue</Button>
      </Stack>

      {normalIssues.length === 0 ? (
        <EmptyState title="No predefined issues yet" subtitle="Add common issue titles for this department." />
      ) : (
        <List dense disablePadding>
          {normalIssues.map((issue) => (
            <ListItem key={issue.id} divider sx={{ px: 0 }}>
              <ListItemText primary={issue.name} />
              <Stack direction="row" spacing={0.5}>
                <IconButton size="small" onClick={() => openEdit(issue)}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => setDeleteTarget(issue)}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            </ListItem>
          ))}
        </List>
      )}

      {othersIssue && (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">{othersIssue.name}</Typography>
            <Chip size="small" label="Always available — cannot be edited or removed" />
          </Stack>
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{form.id ? "Edit Issue" : `New Issue — ${department.name}`}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Issue name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete issue?"
        message={`"${deleteTarget?.name}" will be permanently removed. This fails if any tickets use it.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Paper>
  );
}
