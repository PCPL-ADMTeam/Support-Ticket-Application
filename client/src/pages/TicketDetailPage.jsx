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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
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

// Mirrors ticket.service.js's VALID_TRANSITIONS exactly, for display
// filtering only (so the dropdown doesn't offer a transition the backend
// would reject) — the backend re-validates every transition itself
// regardless of what this shows, so this list drifting stale would only
// ever produce an extra 400 from the API, never a permission bypass.
const VALID_TRANSITIONS = {
  OPEN: ["IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["ON_HOLD", "RESOLVED", "CLOSED"],
  ON_HOLD: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"],
};

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [assignableEmployees, setAssignableEmployees] = useState([]);
  const [priorities, setPriorities] = useState([]);

  const [editOpen, setEditOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftPriorityId, setDraftPriorityId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [draftAssigneeId, setDraftAssigneeId] = useState("");
  const [savingAssign, setSavingAssign] = useState(false);

  // Permission flags below are UI-only conveniences that mirror
  // ticket.service.js#updateTicket's actual rules (isManagerOrAdmin,
  // canDriveWorkflow) so the right controls simply aren't rendered — they
  // are NOT the source of truth. The backend re-checks role, department
  // membership, and assignee eligibility on every PATCH regardless of what
  // this page shows or hides.
  const isAdmin = user.role.name === "ADMIN";
  const isAgent = user.role.name === "AGENT";
  const isStaff = isAdmin || isAgent;
  const isOwner = ticket?.requester.id === user.id;
  const isAssignedToMe = Boolean(ticket?.assignee?.id) && ticket.assignee.id === user.id;

  // ADMIN manages every ticket; AGENT (department manager) only manages
  // tickets already routed to their own department — matches
  // ticket.service.js's isManagerOrAdmin exactly. In practice an AGENT can
  // only ever be looking at a ticket in their own department to begin with
  // (assertCanView already blocked anything else before this page could
  // load it), but the check is kept explicit rather than assumed.
  const canManage = isAdmin || (isAgent && Boolean(user.departmentId) && ticket?.toDepartmentId === user.departmentId);
  const canDriveStatus = canManage || isAssignedToMe;
  const nextStatusOptions = ticket ? VALID_TRANSITIONS[ticket.status] || [] : [];

  const load = useCallback(async () => {
    const { data } = await ticketsApi.getById(id);
    setTicket(data.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    prioritiesApi.list().then(({ data }) => setPriorities(data.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Assignee options must be scoped to THIS ticket's destination department
  // (never every employee, filtered only in React) — fetched once the
  // ticket (and therefore its department) is known. The backend applies the
  // same department/role/active checks again when the assignment is saved
  // (assertValidAssignee), so this list is a convenience, not the guard.
  useEffect(() => {
    if (canManage && ticket?.toDepartment?.id) {
      usersApi.assignableAgents({ departmentId: ticket.toDepartment.id }).then(({ data }) => setAssignableEmployees(data.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, ticket?.toDepartment?.id]);

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
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const payload = {};
    if (draftStatus !== ticket.status) payload.status = draftStatus;
    // Priority is a manager/admin-only field server-side — never sent for a
    // USER assignee, who only ever sees the Status field in this same
    // dialog (see the dialog's JSX below).
    if (canManage && draftPriorityId !== ticket.priority.id) payload.priorityId = draftPriorityId;

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

  const openAssignDialog = () => {
    setDraftAssigneeId(ticket.assignee?.id || "");
    setAssignOpen(true);
  };

  const handleSaveAssign = async () => {
    const newAssigneeId = draftAssigneeId || null;
    if (newAssigneeId === (ticket.assignee?.id || null)) {
      setAssignOpen(false);
      return;
    }

    setSavingAssign(true);
    try {
      await applyUpdate({ assigneeId: newAssigneeId });
      setAssignOpen(false);
    } finally {
      setSavingAssign(false);
    }
  };

  if (loading || !ticket) return <LoadingState minHeight={400} />;

  const canReopen = isOwner && !isStaff && ["RESOLVED", "CLOSED"].includes(ticket.status);

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h4">{ticket.ticketNumber}</Typography>

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
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>Title</Typography>
              <Typography variant="body1">{ticket.title}</Typography>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>Description</Typography>
              {ticket.description?.trim() ? (
                <SafeHtml html={ticket.description} />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  No description provided.
                </Typography>
              )}
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

            {/* Action area — AGENT/ADMIN get Edit + Assign/Reassign; a USER
                assignee gets a lighter "Update Status" affordance instead;
                a USER who only raised the ticket (not assigned) gets none
                of this, matching the read-only/comment-only business rule. */}
            {(canManage || isAssignedToMe) && (
              <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {canManage && (
                  <Button size="small" variant="outlined" onClick={openEditDialog}>
                    Edit Ticket
                  </Button>
                )}
                {!canManage && isAssignedToMe && (
                  <Button size="small" variant="outlined" onClick={openEditDialog}>
                    Update Status
                  </Button>
                )}
                {canManage && (
                  <Button size="small" variant="contained" onClick={openAssignDialog}>
                    {ticket.assignee ? "Reassign" : "Assign Ticket"}
                  </Button>
                )}
              </Stack>
            )}

            <Stack spacing={2}>
              <InfoRow label="Requester" value={`${ticket.requester.name} (${ticket.requester.email})`} />
              <InfoRow
                label="Assignee"
                value={
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <span>{ticket.assignee?.name || "Unassigned"}</span>
                    {isAssignedToMe && <Chip size="small" color="primary" label="Assigned to you" />}
                  </Stack>
                }
              />
              <InfoRow
                label="Issue"
                value={ticket.issue ? (ticket.issue.isOther ? (ticket.customIssueText || ticket.issue.name) : ticket.issue.name) : "—"}
              />
              <InfoRow label="Department" value={ticket.toDepartment?.name || "—"} />
              <InfoRow label="Raised Date" value={format(new Date(ticket.createdAt), "MMM d, yyyy h:mm a")} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Edit Ticket — Status is available to whoever may drive the
          ticket's workflow (manager/admin OR the assignee); Priority is
          manager/admin only. Never shown to a USER who is merely the
          requester. */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{canManage ? `Edit ${ticket.ticketNumber}` : `Update Status — ${ticket.ticketNumber}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              size="small"
              label="Status"
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value)}
              disabled={!canDriveStatus}
            >
              <MenuItem value={ticket.status}>{ticket.status.replace("_", " ")} (current)</MenuItem>
              {nextStatusOptions.map((s) => (
                <MenuItem key={s} value={s}>{s.replace("_", " ")}</MenuItem>
              ))}
            </TextField>

            {canManage && (
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={savingEdit}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Assign / Reassign — AGENT/ADMIN only (canManage); a plain USER
          never sees this dialog or its trigger button. The dropdown is
          populated from the existing assignable-employees API, already
          scoped server-side to active USER employees in this ticket's own
          department — never every employee, never re-filtered client-side
          as the source of truth. */}
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{ticket.assignee ? "Reassign Ticket" : "Assign Ticket"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {ticket.assignee && (
              <Typography variant="body2" color="text.secondary">
                Current assignee: <strong>{ticket.assignee.name}</strong>
              </Typography>
            )}
            <TextField
              select
              size="small"
              label={ticket.assignee ? "New assignee" : "Assignee"}
              value={draftAssigneeId}
              onChange={(e) => setDraftAssigneeId(e.target.value)}
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {assignableEmployees.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveAssign} disabled={savingAssign}>
            {ticket.assignee ? "Reassign" : "Assign"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function InfoRow({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" component="div">{value}</Typography>
    </Box>
  );
}
