import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../../api/tickets";
import TicketForm from "../../components/tickets/TicketForm";
import TicketSuccessDialog from "../../components/tickets/TicketSuccessDialog";

// Agent raise-ticket page — same TicketForm/POST /tickets API as the Admin
// and End User portals (AdminNewTicketPage / portal/NewTicketPage). An
// AGENT can raise a ticket like any employee, but this is a secondary
// action for them (they're the department manager, not the primary
// requester), so it's reached via a small header button rather than being
// the dashboard's focus. The requester is always req.user server-side.
export default function AgentNewTicketPage() {
  const [submitting, setSubmitting] = useState(false);
  const [createdTicketId, setCreatedTicketId] = useState(null);
  const [createdTicket, setCreatedTicket] = useState(null);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

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
    navigate("/agent");
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
