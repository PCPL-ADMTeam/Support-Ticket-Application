import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Alert } from "@mui/material";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../api/tickets";
import { useAuth } from "../context/AuthContext";
import LoadingState from "../components/common/LoadingState";
import TicketForm from "../components/tickets/TicketForm";

// Shared, role-agnostic page (like TicketDetailPage) — reachable by
// whoever raised the ticket. Ownership, not role, is what actually gates
// this: ticket.service.js#updateTicket's canRequesterEditDetails is
// `isOwner && status not RESOLVED/CLOSED`, independent of role.
// This page mirrors that same rule for a fast, friendly redirect — the
// backend re-checks it on every PATCH regardless of what this page shows.
export default function EditTicketPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await ticketsApi.getById(id);
    setTicket(data.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !ticket) return <LoadingState minHeight={400} />;

  const isOwner = ticket.requester.id === user.id;
  const isEditable = isOwner && !["RESOLVED", "CLOSED"].includes(ticket.status);

  if (!isEditable) {
    return (
      <Box>
        <Alert severity="warning">
          {isOwner
            ? "This ticket can no longer be edited because it has been resolved or closed."
            : "You can only edit tickets you raised yourself."}
        </Alert>
      </Box>
    );
  }

  const handleSubmit = async (payload, newAttachments = []) => {
    setSubmitting(true);
    try {
      await ticketsApi.update(id, payload);
      // Ticket-level attachments (not tied to a comment) reuse the same
      // upload endpoint CommentThread already uses — never a new API.
      for (const file of newAttachments) {
        await ticketsApi.uploadAttachment(id, file, null);
      }
      enqueueSnackbar("Ticket updated", { variant: "success" });
      navigate(`/tickets/${id}`);
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to update ticket", { variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <TicketForm
        mode="edit"
        initialTicket={ticket}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/tickets/${id}`)}
        submitting={submitting}
      />
    </Box>
  );
}
