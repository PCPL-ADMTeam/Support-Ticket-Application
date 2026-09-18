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
  Switch,
  FormControlLabel,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useSnackbar } from "notistack";
import { categoriesApi } from "../../api/catalog";
import LoadingState from "../../components/common/LoadingState";
import ConfirmDialog from "../../components/common/ConfirmDialog";

const emptyForm = { id: null, name: "", description: "", parentId: "", isActive: true };

export default function CategoriesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await categoriesApi.list();
    setCategories(data.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = (parentId = "") => { setForm({ ...emptyForm, parentId }); setDialogOpen(true); };
  const openEdit = (c) => { setForm({ id: c.id, name: c.name, description: c.description || "", parentId: c.parentId || "", isActive: c.isActive }); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (form.id) {
        await categoriesApi.update(form.id, { name: form.name, description: form.description, isActive: form.isActive });
      } else {
        await categoriesApi.create({ name: form.name, description: form.description, parentId: form.parentId || undefined });
      }
      setDialogOpen(false);
      load();
      enqueueSnackbar("Category saved", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Save failed", { variant: "error" });
    }
  };

  const handleDelete = async () => {
    try {
      await categoriesApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      load();
      enqueueSnackbar("Category deleted", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to delete", { variant: "error" });
    }
  };

  if (loading) return <LoadingState />;

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h4">Categories</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCreate()}>New Category</Button>
      </Box>

      <Paper variant="outlined">
        <List>
          {categories.map((c) => (
            <Box key={c.id}>
              <ListItem>
                <ListItemText
                  primary={<Stack direction="row" spacing={1} alignItems="center">
                    <Typography fontWeight={700}>{c.name}</Typography>
                    {!c.isActive && <Chip size="small" label="Inactive" />}
                  </Stack>}
                  secondary={c.description}
                />
                <ListItemSecondaryAction>
                  <IconButton size="small" onClick={() => openCreate(c.id)} title="Add sub-category"><AddIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => openEdit(c)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDeleteTarget(c)}><DeleteIcon fontSize="small" /></IconButton>
                </ListItemSecondaryAction>
              </ListItem>
              {c.children.map((child) => (
                <ListItem key={child.id} sx={{ pl: 6 }}>
                  <ListItemText primary={<Stack direction="row" spacing={1} alignItems="center">
                    <Typography>{child.name}</Typography>
                    {!child.isActive && <Chip size="small" label="Inactive" />}
                  </Stack>} />
                  <ListItemSecondaryAction>
                    <IconButton size="small" onClick={() => openEdit(child)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setDeleteTarget(child)}><DeleteIcon fontSize="small" /></IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </Box>
          ))}
        </List>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{form.id ? "Edit Category" : "New Category"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
            <TextField label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} fullWidth multiline minRows={2} />
            {!form.id && (
              <TextField select label="Parent Category" value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))} fullWidth helperText="Leave blank for a top-level category">
                <MenuItem value="">None (top-level)</MenuItem>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
            )}
            {form.id && (
              <FormControlLabel control={<Switch checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />} label="Active" />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete category?"
        message={`"${deleteTarget?.name}" will be permanently removed. This fails if any tickets use it — deactivate it instead in that case.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Box>
  );
}
