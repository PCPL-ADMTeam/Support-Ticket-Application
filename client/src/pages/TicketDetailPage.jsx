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
  Chip,
  Divider,
} from "@mui/material";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../api/tickets";
import { categoriesApi, prioritiesApi } from "../api/catalog";
import { usersApi } from "../api/users";
import { teamsApi } from "../api/teams";
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
  const [uploading, setUploading] = useState(false);

  const [agents, setAgents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);

  const isStaff = user.role.name === "ADMIN" || user.role.name === "AGENT";
  const isOwner = ticket?.requester.id === user.id;

  const load = useCallback(async () => {
    const { data } = await ticketsApi.getById(id);
    setTicket(data.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    if (isStaff) {
      usersApi.assignableAgents().then(({ data }) => setAgents(data.data));
      teamsApi.list().then(({ data }) => setTeams(data.data));
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

  const handleAddComment = async (payload) => {
    setCommentSubmitting(true);
    try {
      await ticketsApi.addComment(id, payload);
      await load();
      enqueueSnackbar("Reply posted", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to post reply", { variant: "error" });
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      await ticketsApi.uploadAttachment(id, file);
      await load();
      enqueueSnackbar("File uploaded", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Upload failed", { variant: "error" });
    } finally {
      setUploading(false);
    }
  };

  if (loading || !ticket) return <LoadingState minHeight={400} />;

  const canReopen = isOwner && !isStaff && ["RESOLVED", "CLOSED"].includes(ticket.status);
  const flatCategories = categories.flatMap((c) => [c, ...c.children]);

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4">{ticket.ticketNumber}</Typography>
          <Typography variant="body2" color="text.secondary">
            Opened by {ticket.requester.name} on {format(new Date(ticket.createdAt), "MMM d, yyyy h:mm a")}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <StatusBadge status={ticket.status} size="medium" />
          <PriorityBadge name={ticket.priority.name} color={ticket.priority.color} size="medium" />
        </Stack>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>{ticket.title}</Typography>
              <SafeHtml html={ticket.description} />
            </Paper>

            <AttachmentList attachments={ticket.attachments} onUpload={handleUpload} uploading={uploading} />

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
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Details</Typography>
            <Stack spacing={2}>
              {(isStaff || canReopen) && (
                <TextField
                  select
                  size="small"
                  label="Status"
                  value={ticket.status}
                  onChange={(e) => applyUpdate({ status: e.target.value })}
                >
                  {(canReopen ? ["REOPENED"] : STATUS_OPTIONS).map((s) => (
                    <MenuItem key={s} value={s}>{s.replace("_", " ")}</MenuItem>
                  ))}
                </TextField>
              )}

              {isStaff && (
                <>
                  <TextField
                    select
                    size="small"
                    label="Assignee"
                    value={ticket.assignee?.id || ""}
                    onChange={(e) => applyUpdate({ assigneeId: e.target.value || null })}
                  >
                    <MenuItem value="">Unassigned</MenuItem>
                    {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Team"
                    value={ticket.team?.id || ""}
                    onChange={(e) => applyUpdate({ teamId: e.target.value || null })}
                  >
                    <MenuItem value="">No team</MenuItem>
                    {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Priority"
                    value={ticket.priority.id}
                    onChange={(e) => applyUpdate({ priorityId: e.target.value })}
                  >
                    {priorities.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Category"
                    value={ticket.category?.id || ""}
                    onChange={(e) => applyUpdate({ categoryId: e.target.value })}
                  >
                    <MenuItem value="">No category</MenuItem>
                    {flatCategories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </TextField>
                </>
              )}

              {!isStaff && (
                <>
                  <InfoRow label="Assignee" value={ticket.assignee?.name || "Unassigned"} />
                  {ticket.category && <InfoRow label="Category" value={ticket.category.name} />}
                </>
              )}

              {(ticket.fromDepartment || ticket.toDepartment) && (
                <>
                  <Divider />
                  {ticket.fromDepartment && <InfoRow label="From Department" value={ticket.fromDepartment.name} />}
                  {ticket.toDepartment && <InfoRow label="To Department" value={ticket.toDepartment.name} />}
                  {ticket.manager && <InfoRow label="Manager" value={ticket.manager.name} />}
                  {ticket.issue && (
                    <InfoRow
                      label="Issue"
                      value={ticket.issue.isOther ? (ticket.customIssueText || ticket.issue.name) : ticket.issue.name}
                    />
                  )}
                </>
              )}

              <Divider />
              <InfoRow label="Requester" value={`${ticket.requester.name} (${ticket.requester.email})`} />
              <InfoRow label="Due" value={ticket.dueAt ? format(new Date(ticket.dueAt), "MMM d, yyyy h:mm a") : "—"} />
              <InfoRow label="Resolved" value={ticket.resolvedAt ? format(new Date(ticket.resolvedAt), "MMM d, yyyy h:mm a") : "—"} />
              {ticket.dueAt && new Date(ticket.dueAt) < new Date() && !["RESOLVED", "CLOSED"].includes(ticket.status) && (
                <Chip label="SLA breached" color="error" size="small" sx={{ alignSelf: "flex-start" }} />
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
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
