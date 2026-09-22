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
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ListSubheader,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../api/tickets";
import { prioritiesApi } from "../api/catalog";
import { usersApi } from "../api/users";
import { departmentsApi } from "../api/departments";
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

// Description box height — matches the ~340px used by the dashboard's own
// chart cards (StatusPieChart/PriorityBarChart) elsewhere in this app, so a
// long rich-text description scrolls internally rather than growing the
// whole page.
const DESCRIPTION_MAX_HEIGHT = 340;

// RESOLVED/ON_HOLD/CLOSED each need a persisted explanation — the backend
// (ticket.service.js#updateTicket) rejects the transition without one
// regardless of what this dialog does, so this is purely the UX for
// collecting it; validation here just gives an immediate, friendly error
// instead of a round-trip 400.
const REASON_CONFIG = {
  RESOLVED: {
    field: "resolutionNotes",
    label: "Resolution Notes",
    placeholder: "Explain how the issue was resolved...",
    requiredMessage: "Resolution notes are required when resolving a ticket.",
    confirmLabel: "Mark as Resolved",
  },
  ON_HOLD: {
    field: "onHoldReason",
    label: "On-Hold Reason",
    placeholder: "Explain why this ticket is being put on hold",
    requiredMessage: "On-hold reason is required.",
    confirmLabel: "Put on Hold",
  },
  CLOSED: {
    field: "closedReason",
    label: "Closed Reason",
    placeholder: "Explain why this ticket is being closed...",
    requiredMessage: "Closed reason is required.",
    confirmLabel: "Close Ticket",
  },
};

// A distinct sentinel (never a real user id) so the Assign dialog's select
// can represent "Assign to Me" as its own option, separate from picking a
// specific Team Member id — translated to the dedicated `assignToMe: true`
// payload flag on save (see ticket.service.js#updateTicket), never sent as
// a raw assigneeId.
const ASSIGN_TO_ME_VALUE = "__assign_to_me__";

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [assignableEmployees, setAssignableEmployees] = useState([]);
  const [priorities, setPriorities] = useState([]);

  const [editOpen, setEditOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftPriorityId, setDraftPriorityId] = useState("");
  const [draftReason, setDraftReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [draftAssigneeId, setDraftAssigneeId] = useState("");
  const [savingAssign, setSavingAssign] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [draftToDepartmentId, setDraftToDepartmentId] = useState("");
  const [draftTransferReason, setDraftTransferReason] = useState("");
  const [transferReasonError, setTransferReasonError] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);

  // Permission flags below are UI-only conveniences that mirror
  // ticket.service.js#updateTicket's actual rules (isManagerOrAdmin,
  // canDriveWorkflow, canRequesterEditDetails) so the right controls simply
  // aren't rendered — they are NOT the source of truth. The backend
  // re-checks role, ownership, department membership, and ticket status on
  // every PATCH regardless of what this page shows or hides.
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
  // Only the requester of the ticket, and only while it's still open —
  // never merely because the current user is the assignee. Mirrors
  // ticket.service.js#updateTicket's canRequesterEditDetails exactly.
  const canEditAsRequester = isOwner && Boolean(ticket) && !["RESOLVED", "CLOSED"].includes(ticket.status);
  // Department transfer has its own permission matrix, distinct from
  // canManage — mirrors ticket.service.js#assertCanTransferDepartment
  // exactly: ADMIN is explicitly excluded even though canManage includes
  // them, and only the ticket's current ASSIGNEE (never merely the
  // requester) may transfer as a USER.
  const canTransferDepartment = (isAgent && Boolean(user.departmentId) && ticket?.toDepartmentId === user.departmentId) || isAssignedToMe;

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
    setDraftReason("");
    setReasonError("");
    setEditOpen(true);
  };

  const handleStatusChange = (value) => {
    setDraftStatus(value);
    setDraftReason("");
    setReasonError("");
  };

  const handleSaveEdit = async () => {
    const payload = {};
    const statusChanged = draftStatus !== ticket.status;
    if (statusChanged) payload.status = draftStatus;
    // Priority is a manager/admin-only field server-side — never sent for a
    // USER assignee, who only ever sees the Status field in this same
    // dialog (see the dialog's JSX below).
    if (canManage && draftPriorityId !== ticket.priority.id) payload.priorityId = draftPriorityId;

    const reasonConfig = statusChanged ? REASON_CONFIG[draftStatus] : null;
    if (reasonConfig) {
      if (!draftReason.trim()) {
        setReasonError(reasonConfig.requiredMessage);
        return;
      }
      payload[reasonConfig.field] = draftReason.trim();
    }

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
    setDraftAssigneeId(
      ticket.assignee?.id === user.id ? ASSIGN_TO_ME_VALUE : (ticket.assignee?.id || "")
    );
    setAssignOpen(true);
  };

  const handleSaveAssign = async () => {
    const isAssignToMe = draftAssigneeId === ASSIGN_TO_ME_VALUE;
    const newAssigneeId = isAssignToMe ? user.id : (draftAssigneeId || null);
    if (newAssigneeId === (ticket.assignee?.id || null)) {
      setAssignOpen(false);
      return;
    }

    setSavingAssign(true);
    try {
      // "Assign to Me" is its own explicit flag — the backend derives the
      // assignee from the authenticated caller for that path and never
      // trusts a raw assigneeId for self-assignment (see
      // ticket.service.js#updateTicket).
      await applyUpdate(isAssignToMe ? { assignToMe: true } : { assigneeId: newAssigneeId });
      setAssignOpen(false);
    } finally {
      setSavingAssign(false);
    }
  };

  const openTransferDialog = () => {
    setDraftToDepartmentId("");
    setDraftTransferReason("");
    setTransferReasonError("");
    setTransferOpen(true);
    // Fetched on open (rather than eagerly on page load) since this is a
    // rarely-used action — GET /departments is readable by everyone and
    // already includes each department's active `managers`, letting this
    // list filter out departments that couldn't legally receive a transfer
    // anyway; the backend independently re-validates regardless.
    departmentsApi.list().then(({ data }) => setDepartments(data.data));
  };

  const handleSaveTransfer = async () => {
    const reason = draftTransferReason.trim();
    if (!reason) {
      setTransferReasonError("Transfer reason is required.");
      return;
    }
    if (!draftToDepartmentId) return;

    setSavingTransfer(true);
    try {
      const { data } = await ticketsApi.transferDepartment(id, {
        toDepartmentId: draftToDepartmentId,
        transferReason: reason,
      });
      setTicket(data.data);
      setTransferOpen(false);
      enqueueSnackbar(`Ticket transferred to ${data.data.toDepartment?.name || "the new department"}`, { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Transfer failed", { variant: "error" });
    } finally {
      setSavingTransfer(false);
    }
  };

  if (loading || !ticket) return <LoadingState minHeight={400} />;

  // Every active department is shown as a possible destination except the
  // ticket's current one — a department with no active manager is NOT
  // hidden here; it's still listed (with a "(No active manager)" hint) so
  // the requirement is visible rather than silently unexplained. The
  // backend (ticket.service.js#transferDepartment) is the sole enforcement
  // point for "destination must have an active manager" and independently
  // rejects the transfer if selected anyway.
  const transferableDepartments = departments.filter((d) => d.id !== ticket.toDepartment?.id);

  const canReopen = isOwner && !isStaff && ["RESOLVED", "CLOSED"].includes(ticket.status);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      {/* Combined heading — ticket number and title together, so the
          ticket's identity and subject are read as one line instead of two
          separated blocks. The requester-edit icon sits directly beside
          the title (not pushed to the far right of the row, which would
          land it above the Ticket Information panel on desktop) — grouped
          in its own inner Stack so it stays visually attached to the
          heading regardless of Reopen Ticket's presence on the right. */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ wordBreak: "break-word" }}>
            {ticket.ticketNumber} - {ticket.title}
          </Typography>
          {canEditAsRequester && (
            <IconButton onClick={() => navigate(`/tickets/${id}/edit`)} aria-label="Edit ticket" title="Edit ticket">
              <EditIcon />
            </IconButton>
          )}
        </Stack>
        {canReopen && (
          <Button variant="outlined" onClick={() => applyUpdate({ status: "REOPENED" })} sx={{ flexShrink: 0 }}>
            Reopen Ticket
          </Button>
        )}
      </Stack>

      <Grid container spacing={3}>
        {/* LEFT — main ticket content. `order` puts this second on mobile
            (xs) so the compact info panel appears right after the header,
            per the required mobile stacking order, while staying visually
            on the left on desktop (md+). */}
        <Grid item xs={12} md={8} sx={{ order: { xs: 2, md: 1 } }}>
          <Stack spacing={3}>
            {/* Description — its own card, visually separated from the
                metadata. Long descriptions scroll internally rather than
                growing the page indefinitely; nothing is truncated. */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Description</Typography>
              {ticket.description?.trim() ? (
                <Box sx={{ maxHeight: DESCRIPTION_MAX_HEIGHT, overflowY: "auto", pr: 1 }}>
                  <SafeHtml html={ticket.description} />
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  No description provided.
                </Typography>
              )}
            </Paper>

            <AttachmentList ticketId={ticket.id} attachments={ticket.attachments} />

            <CommentThread
              comments={ticket.comments}
              isStaff={isStaff}
              onAddComment={handleAddComment}
              submitting={commentSubmitting}
            />

            <ActivityTimeline history={ticket.history} />
          </Stack>
        </Grid>

        {/* RIGHT — compact ticket information panel. Deliberately smaller/
            denser than the left column; nothing here duplicates content
            beyond the badges the rest of the app already uses for
            Status/Priority. */}
        <Grid item xs={12} md={4} sx={{ order: { xs: 1, md: 2 } }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>Ticket Information</Typography>

            {(canManage || isAssignedToMe) && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
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
                {/* Separate action from Edit Ticket — its own permission
                    matrix (excludes ADMIN even though canManage includes
                    them; includes an assigned USER even though they can't
                    otherwise manage the ticket). Backend independently
                    enforces the same rule regardless of this button. */}
                {canTransferDepartment && (
                  <Button size="small" variant="outlined" color="secondary" startIcon={<SwapHorizIcon />} onClick={openTransferDialog}>
                    Transfer Department
                  </Button>
                )}
              </Stack>
            )}

            <Stack spacing={2}>
              <InfoRow label="Status" value={<StatusBadge status={ticket.status} />} />
              <InfoRow label="Priority" value={<PriorityBadge name={ticket.priority.name} color={ticket.priority.color} />} />
              <InfoRow label="Department" value={ticket.toDepartment?.name || "—"} />
              <InfoRow label="Manager" value={ticket.manager?.name || "—"} />
              <InfoRow
                label="Issue"
                value={ticket.issue ? (ticket.issue.isOther ? (ticket.customIssueText || ticket.issue.name) : ticket.issue.name) : "—"}
              />
              <InfoRow label="Raised By" value={ticket.requester.name} />
              <InfoRow
                label="Assigned To"
                value={
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <span>{ticket.assignee?.name || "Unassigned"}</span>
                    {isAssignedToMe && <Chip size="small" color="primary" label="Assigned to you" />}
                  </Stack>
                }
              />
              <InfoRow label="Created" value={format(new Date(ticket.createdAt), "MMM d, yyyy h:mm a")} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Edit Ticket — Status is available to whoever may drive the
          ticket's workflow (manager/admin OR the assignee); Priority is
          manager/admin only. Never shown to a USER who is merely the
          requester (they get the separate edit-icon flow instead, which
          covers issue/priority/description via EditTicketPage/TicketForm). */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{canManage ? `Edit ${ticket.ticketNumber}` : `Update Status — ${ticket.ticketNumber}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              size="small"
              label="Status"
              value={draftStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
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

            {/* RESOLVED/ON_HOLD/CLOSED only — normal transitions (OPEN,
                IN_PROGRESS, REOPENED) keep the existing one-click behavior. */}
            {draftStatus !== ticket.status && REASON_CONFIG[draftStatus] && (
              <TextField
                required
                multiline
                minRows={3}
                size="small"
                label={REASON_CONFIG[draftStatus].label}
                placeholder={REASON_CONFIG[draftStatus].placeholder}
                value={draftReason}
                onChange={(e) => { setDraftReason(e.target.value); setReasonError(""); }}
                error={Boolean(reasonError)}
                helperText={reasonError}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={savingEdit}>
            {draftStatus !== ticket.status && REASON_CONFIG[draftStatus] ? REASON_CONFIG[draftStatus].confirmLabel : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign / Reassign — AGENT/ADMIN only (canManage); a plain USER
          never sees this dialog or its trigger button. "Assign to Me" is
          only offered to an AGENT (isAgent), matching the backend's
          AGENT-only assignToMe restriction — an ADMIN isn't a department
          worker and has no self-assign action. The Team Members group is
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
              {isAgent && <MenuItem value={ASSIGN_TO_ME_VALUE}>Assign to Me</MenuItem>}
              <ListSubheader>Team Members</ListSubheader>
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

      {/* Transfer Department — deliberately its own dialog, never folded
          into Edit Ticket. Destination list comes from GET /departments
          (never hardcoded), excludes the ticket's current department and
          any department with no active manager, and the reason is
          mandatory. The backend independently re-validates every one of
          these rules regardless of what this dialog allows to be selected. */}
      <Dialog open={transferOpen} onClose={() => setTransferOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Transfer Ticket</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Current Department</Typography>
              <Typography variant="body2" fontWeight={600}>{ticket.toDepartment?.name || "—"}</Typography>
            </Box>

            <TextField
              select
              required
              size="small"
              label="Transfer To"
              value={draftToDepartmentId}
              onChange={(e) => setDraftToDepartmentId(e.target.value)}
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="" disabled>Select destination department</MenuItem>
              {transferableDepartments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}{!d.managers?.length ? " (No active manager)" : ""}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              required
              multiline
              minRows={3}
              size="small"
              label="Transfer Reason"
              placeholder="Explain why this ticket should move to the new department..."
              value={draftTransferReason}
              onChange={(e) => { setDraftTransferReason(e.target.value); setTransferReasonError(""); }}
              error={Boolean(transferReasonError)}
              helperText={transferReasonError}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTransfer} disabled={savingTransfer || !draftToDepartmentId}>
            Transfer Ticket
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
