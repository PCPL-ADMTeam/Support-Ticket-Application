import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Grid,
  Paper,
  Typography,
  Box,
  Stack,
  TextField,
  MenuItem,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../api/tickets";
import { prioritiesApi, categoriesApi } from "../api/catalog";
import { usersApi } from "../api/users";
import { useAuth } from "../context/AuthContext";
import LoadingState from "../components/common/LoadingState";
import StatusBadge from "../components/common/StatusBadge";
import PriorityBadge from "../components/common/PriorityBadge";
import SafeHtml from "../components/common/SafeHtml";
import CommentThread from "../components/tickets/CommentThread";
import AttachmentList from "../components/tickets/AttachmentList";
import ActivityTimeline from "../components/tickets/ActivityTimeline";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"];

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [agents, setAgents] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [categories, setCategories] = useState([]);

  const [editOpen, setEditOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftPriorityId, setDraftPriorityId] = useState("");
  const [draftAssigneeId, setDraftAssigneeId] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user.role.name === "ADMIN";
  const isOwner = ticket?.requester.id === user.id;
  const isAssignedToMe = Boolean(ticket?.assignee?.id) && ticket.assignee.id === user.id;
  // A Manager only has power over tickets routed to the one department they
  // manage — mirrors ticket.service.js#isDeptManager.
  const isDeptManager = user.role.name === "MANAGER" && Boolean(user.departmentId) && ticket?.toDepartment?.id === user.departmentId;
  const isPrivileged = isAdmin || isDeptManager || isAssignedToMe; // internal notes

  // Field-level permissions, mirroring the server-side gates in
  // ticket.service.js#updateTicket exactly:
  const canChangeStatus = isAdmin || isDeptManager || isAssignedToMe;
  const canChangeAssignee = isAdmin || isDeptManager;
  const canChangePriority = isAdmin;
  const canChangeCategory = isAdmin;
  const canEditTicket = canChangeStatus || canChangeAssignee || canChangePriority || canChangeCategory;

  const flatCategories = categories.flatMap((c) => [c, ...(c.children || [])]);

  const load = useCallback(async () => {
    const { data } = await ticketsApi.getById(id);
    setTicket(data.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    if (isAdmin || user.role.name === "MANAGER") {
      usersApi.assignableUsers().then(({ data }) => setAgents(data.data));
    }
    if (isAdmin) {
      categoriesApi.list().then(({ data }) => setCategories(data.data));
    }
    prioritiesApi.list().then(({ data }) => setPriorities(data.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const applyUpdate = async (payload) => {
    try {
      const { data } = await ticketsApi.update(id, payload);
      setTicket(data.data);
      enqueueSnackbar("Ticket updated", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Update failed", { variant: "error" });
    }
  };

  const handleAddComment = async (payload, file) => {
    setCommentSubmitting(true);
    try {
      const { data } = await ticketsApi.addComment(id, payload);
      if (file) await ticketsApi.uploadAttachment(id, file, data.data.id);
      await load();
      enqueueSnackbar("Reply posted", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to post reply", { variant: "error" });
    } finally {
      setCommentSubmitting(false);
    }
  };

  const openEditDialog = () => {
    setDraftStatus(ticket.status);
    setDraftPriorityId(ticket.priority.id);
    setDraftAssigneeId(ticket.assignee?.id || "");
    setDraftCategoryId(ticket.category?.id || "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const payload = {};
    if (canChangeStatus && draftStatus !== ticket.status) payload.status = draftStatus;
    if (canChangePriority && draftPriorityId !== ticket.priority.id) payload.priorityId = draftPriorityId;
    if (canChangeAssignee && draftAssigneeId !== (ticket.assignee?.id || "")) payload.assigneeId = draftAssigneeId || null;
    if (canChangeCategory && draftCategoryId !== (ticket.category?.id || "")) payload.categoryId = draftCategoryId || null;

    if (Object.keys(payload).length === 0) {
      setEditOpen(false);
      return;
    }

    setSavingEdit(true);
    try {
      await applyUpdate(payload);
      setEditOpen(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTicket = async () => {
    setDeleting(true);
    try {
      await ticketsApi.remove(id);
      enqueueSnackbar("Ticket deleted", { variant: "success" });
      navigate("/admin/tickets");
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to delete ticket", { variant: "error" });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading || !ticket) return <LoadingState minHeight={400} />;

  const canReopen = isOwner && !isPrivileged && ["RESOLVED", "CLOSED"].includes(ticket.status);

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="h4">{ticket.ticketNumber}</Typography>
          {canEditTicket && (
            <IconButton size="small" onClick={openEditDialog} aria-label="Edit ticket">
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          {isAdmin && (
            <IconButton size="small" onClick={() => setDeleteOpen(true)} aria-label="Delete ticket" color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>

        {canReopen && (
          <Button variant="outlined" onClick={() => applyUpdate({ status: "REOPENED" })}>
            Reopen Ticket
          </Button>
        )}
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="overline" color="text.secondary">Description</Typography>
              <Typography variant="h6" gutterBottom>{ticket.title}</Typography>
            
            </Box>

            <AttachmentList attachments={ticket.attachments} />

            <CommentThread
              comments={ticket.comments}
              isStaff={isPrivileged}
              onAddComment={handleAddComment}
              submitting={commentSubmitting}
            />

            <ActivityTimeline history={ticket.history} />
          </Stack>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={700}>Details</Typography>
              <Stack direction="row" spacing={1}>
                <StatusBadge status={ticket.status} size="medium" />
                <PriorityBadge name={ticket.priority.name} color={ticket.priority.color} size="medium" />
              </Stack>
            </Stack>

            <Stack spacing={2}>
              <InfoRow label="Requester" value={`${ticket.requester.name} (${ticket.requester.email})`} />
              <InfoRow label="Assignee" value={ticket.assignee?.name || "Unassigned"} />
              <InfoRow label="Category" value={ticket.category?.name || "—"} />
              <InfoRow label="Department" value={ticket.toDepartment?.name || "—"} />
              <InfoRow label="Raised Date" value={format(new Date(ticket.createdAt), "MMM d, yyyy h:mm a")} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit {ticket.ticketNumber}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {canChangeStatus && (
              <TextField
                select
                size="small"
                label="Status"
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>{s.replace("_", " ")}</MenuItem>
                ))}
              </TextField>
            )}

            {canChangePriority && (
              <TextField
                select
                size="small"
                label="Priority"
                value={draftPriorityId}
                onChange={(e) => setDraftPriorityId(e.target.value)}
              >
                {priorities.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </TextField>
            )}

            {canChangeAssignee && (
              <TextField
                select
                size="small"
                label="Assignee"
                value={draftAssigneeId}
                onChange={(e) => setDraftAssigneeId(e.target.value)}
                SelectProps={{ displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
                helperText={!isAdmin ? "Only Users in your department are listed" : undefined}
              >
                <MenuItem value="">Unassigned</MenuItem>
                {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
              </TextField>
            )}

            {canChangeCategory && (
              <TextField
                select
                size="small"
                label="Category"
                value={draftCategoryId}
                onChange={(e) => setDraftCategoryId(e.target.value)}
                SelectProps={{ displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
              >
                <MenuItem value="">No category</MenuItem>
                {flatCategories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={savingEdit}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {ticket.ticketNumber}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This permanently deletes the ticket along with its comments, attachments and history. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteTicket} disabled={deleting}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function InfoRow({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}
