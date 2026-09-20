import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../../api/tickets";
import TicketForm from "../../components/tickets/TicketForm";
import TicketSuccessDialog from "../../components/tickets/TicketSuccessDialog";

// Admin raise-ticket page — reuses the exact same TicketForm and
// POST /tickets API as the End User portal's NewTicketPage. Only the
// post-create redirect differs (Admin has no /portal route to land on).
// The requester is always req.user server-side (see ticket.service.js),
// so this can never be used to raise a ticket on behalf of someone else.
export default function AdminNewTicketPage() {
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
    navigate("/admin/tickets");
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
