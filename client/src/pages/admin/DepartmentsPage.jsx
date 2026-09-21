import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  FormControlLabel,
  Switch,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import { useSnackbar } from "notistack";
import { departmentsApi, issuesApi } from "../../api/departments";
import { usersApi } from "../../api/users";
import LoadingState from "../../components/common/LoadingState";
import ConfirmDialog from "../../components/common/ConfirmDialog";

const emptyDeptForm = { id: null, name: "" };
const emptyIssueForm = { id: null, departmentId: null, name: "", isOther: false };

export default function DepartmentsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [deptForm, setDeptForm] = useState(emptyDeptForm);
  const [deptDeleteTarget, setDeptDeleteTarget] = useState(null);

  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueForm, setIssueForm] = useState(emptyIssueForm);
  const [issueDeleteTarget, setIssueDeleteTarget] = useState(null);

  const [managerDialogOpen, setManagerDialogOpen] = useState(false);
  const [managerTarget, setManagerTarget] = useState(null);
  const [managerSelection, setManagerSelection] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await departmentsApi.list();
    setDepartments(data.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { usersApi.list({ limit: 200 }).then(({ data }) => setUsers(data.data)); }, []);

  const openCreateDept = () => { setDeptForm(emptyDeptForm); setDeptDialogOpen(true); };
  const openEditDept = (d) => { setDeptForm({ id: d.id, name: d.name }); setDeptDialogOpen(true); };

  const openManagerDialog = (d) => {
    setManagerTarget(d);
    setManagerSelection(d.managerId || "");
    setManagerDialogOpen(true);
  };

  const handleAssignManager = async () => {
    try {
      await departmentsApi.assignManager(managerTarget.id, managerSelection || null);
      setManagerDialogOpen(false);
      load();
      enqueueSnackbar("Department manager updated", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to update manager", { variant: "error" });
    }
  };

  const handleSaveDept = async () => {
    try {
      if (deptForm.id) {
        await departmentsApi.update(deptForm.id, { name: deptForm.name });
      } else {
        await departmentsApi.create({ name: deptForm.name });
      }
      setDeptDialogOpen(false);
      load();
      enqueueSnackbar("Department saved", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Save failed", { variant: "error" });
    }
  };

  const handleDeleteDept = async () => {
    try {
      await departmentsApi.remove(deptDeleteTarget.id);
      setDeptDeleteTarget(null);
      load();
      enqueueSnackbar("Department deleted", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to delete", { variant: "error" });
    }
  };

  const openCreateIssue = (departmentId) => { setIssueForm({ ...emptyIssueForm, departmentId }); setIssueDialogOpen(true); };
  const openEditIssue = (i, departmentId) => { setIssueForm({ id: i.id, departmentId, name: i.name, isOther: i.isOther }); setIssueDialogOpen(true); };

  const handleSaveIssue = async () => {
    try {
      if (issueForm.id) {
        await issuesApi.update(issueForm.id, { name: issueForm.name });
      } else {
        await issuesApi.create({ departmentId: issueForm.departmentId, name: issueForm.name, isOther: issueForm.isOther });
      }
      setIssueDialogOpen(false);
      load();
      enqueueSnackbar("Issue saved", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Save failed", { variant: "error" });
    }
  };

  const handleDeleteIssue = async () => {
    try {
      await issuesApi.remove(issueDeleteTarget.id);
      setIssueDeleteTarget(null);
      load();
      enqueueSnackbar("Issue deleted", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to delete", { variant: "error" });
    }
  };

  if (loading) return <LoadingState />;

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h4">Departments</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDept}>New Department</Button>
      </Box>

      <Stack spacing={2}>
        {departments.map((d) => (
          <Paper key={d.id} variant="outlined">
            <ListItem>
              <ListItemText
                primary={<Typography fontWeight={700}>{d.name}</Typography>}
                secondary={d.manager ? `Manager: ${d.manager.name} (${d.manager.email})` : "No manager assigned yet"}
              />
              <ListItemSecondaryAction>
                <IconButton size="small" onClick={() => openManagerDialog(d)} title="Assign / change manager"><SupervisorAccountIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => openCreateIssue(d.id)} title="Add issue"><AddIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => openEditDept(d)}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => setDeptDeleteTarget(d)}><DeleteIcon fontSize="small" /></IconButton>
              </ListItemSecondaryAction>
            </ListItem>

            <List dense sx={{ pl: 4, pb: 1 }}>
              {d.issues.map((issue) => (
                <ListItem key={issue.id}>
                  <ListItemText primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2">{issue.name}</Typography>
                      {issue.isOther && <Chip size="small" label="Others fallback" />}
                    </Stack>
                  } />
                  {!issue.isOther && (
                    <ListItemSecondaryAction>
                      <IconButton size="small" onClick={() => openEditIssue(issue, d.id)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => setIssueDeleteTarget(issue)}><DeleteIcon fontSize="small" /></IconButton>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              ))}
            </List>
          </Paper>
        ))}
      </Stack>

      {/* Department dialog */}
      <Dialog open={deptDialogOpen} onClose={() => setDeptDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{deptForm.id ? "Edit Department" : "New Department"}</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            value={deptForm.name}
            onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeptDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveDept}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Issue dialog */}
      <Dialog open={issueDialogOpen} onClose={() => setIssueDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{issueForm.id ? "Edit Issue" : "New Issue"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={issueForm.name}
              onChange={(e) => setIssueForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
            />
            {!issueForm.id && (
              <FormControlLabel
                control={<Switch checked={issueForm.isOther} onChange={(e) => setIssueForm((f) => ({ ...f, isOther: e.target.checked }))} />}
                label='Use as the "Others" custom-text fallback for this department'
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveIssue}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Assign / change manager dialog */}
      <Dialog open={managerDialogOpen} onClose={() => setManagerDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Assign Manager — {managerTarget?.name}</DialogTitle>
        <DialogContent>
          <TextField
            select
            label="Manager"
            value={managerSelection}
            onChange={(e) => setManagerSelection(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
            SelectProps={{ displayEmpty: true }}
            helperText="Promotes the selected user to MANAGER and moves them into this department. The outgoing manager (if any) reverts to a regular User."
          >
            <MenuItem value="">No manager</MenuItem>
            {users.map((u) => (
              <MenuItem key={u.id} value={u.id} disabled={u.role.name === "ADMIN"}>
                {u.name} ({u.email}){u.role.name === "MANAGER" ? " — currently a Manager" : ""}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManagerDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssignManager}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deptDeleteTarget)}
        title="Delete department?"
        message={`"${deptDeleteTarget?.name}" will be permanently removed. This fails if any tickets or users reference it.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeptDeleteTarget(null)}
        onConfirm={handleDeleteDept}
      />

      <ConfirmDialog
        open={Boolean(issueDeleteTarget)}
        title="Delete issue?"
        message={`"${issueDeleteTarget?.name}" will be permanently removed. This fails if any tickets use it.`}
        confirmLabel="Delete"
        danger
        onClose={() => setIssueDeleteTarget(null)}
        onConfirm={handleDeleteIssue}
      />
    </Box>
  );
}
