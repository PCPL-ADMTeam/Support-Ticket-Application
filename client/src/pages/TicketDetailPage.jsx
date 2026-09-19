import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
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
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../api/tickets";
import { prioritiesApi } from "../api/catalog";
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
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [agents, setAgents] = useState([]);
  const [priorities, setPriorities] = useState([]);

  const [editOpen, setEditOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftPriorityId, setDraftPriorityId] = useState("");
  const [draftAssigneeId, setDraftAssigneeId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const isStaff = user.role.name === "ADMIN" || user.role.name === "AGENT";
  const isOwner = ticket?.requester.id === user.id;
  const isAssignedToMe = Boolean(ticket?.assignee?.id) && ticket.assignee.id === user.id;

  const load = useCallback(async () => {
    const { data } = await ticketsApi.getById(id);
    setTicket(data.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    if (isStaff) {
      usersApi.assignableAgents().then(({ data }) => setAgents(data.data));
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
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const payload = {};
    if (draftStatus !== ticket.status) payload.status = draftStatus;
    if (draftPriorityId !== ticket.priority.id) payload.priorityId = draftPriorityId;
    if (draftAssigneeId !== (ticket.assignee?.id || "")) payload.assigneeId = draftAssigneeId || null;

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

  if (loading || !ticket) return <LoadingState minHeight={400} />;

  const canReopen = isOwner && !isStaff && ["RESOLVED", "CLOSED"].includes(ticket.status);

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="h4">{ticket.ticketNumber}</Typography>
          {isAssignedToMe && (
            <IconButton size="small" onClick={openEditDialog} aria-label="Edit ticket">
              <EditIcon fontSize="small" />
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
              isStaff={isStaff}
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

            <TextField
              select
              size="small"
              label="Priority"
              value={draftPriorityId}
              onChange={(e) => setDraftPriorityId(e.target.value)}
            >
              {priorities.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>

            <TextField
              select
              size="small"
              label="Assignee"
              value={draftAssigneeId}
              onChange={(e) => setDraftAssigneeId(e.target.value)}
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={savingEdit}>Save</Button>
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
