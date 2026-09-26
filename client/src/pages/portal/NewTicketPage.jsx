import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../../api/tickets";
import TicketForm from "../../components/tickets/TicketForm";
import TicketSuccessDialog from "../../components/tickets/TicketSuccessDialog";
import { useAuth } from "../../context/AuthContext";
import { homeForRole } from "../../routes/ProtectedRoute";

// Shared across the Employee portal (/portal/new-ticket) and the Manager/
// Team Lead workspace (/agent/new-ticket) — same component, same POST
// /tickets flow,
// per the "reuse, don't duplicate" ticket-creation rule. The only thing
// that needs to vary per caller is where "done" goes back to, so that's
// derived from the logged-in user's own role rather than hardcoded.
export default function NewTicketPage() {
  const [submitting, setSubmitting] = useState(false);
  const [createdTicketId, setCreatedTicketId] = useState(null);
  const [createdTicket, setCreatedTicket] = useState(null);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      const { data } = await ticketsApi.create(payload);
      setCreatedTicketId(data.data.id);
      setCreatedTicket(data.data);
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to create ticket", { variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const closeSuccessDialog = () => {
    setCreatedTicketId(null);
    navigate(homeForRole(user.role.name));
  };

  return (
    <Box>
      <TicketForm onSubmit={handleSubmit} submitting={submitting} />

      <TicketSuccessDialog
        open={Boolean(createdTicketId)}
        onClose={closeSuccessDialog}
        onViewTicket={() => navigate(`/tickets/${createdTicketId}`)}
        ticketId={createdTicket?.ticketNumber}
        department={createdTicket?.toDepartment?.name}
      />
    </Box>
  );
}
