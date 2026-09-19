import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../../api/tickets";
import TicketForm from "../../components/tickets/TicketForm";
import TicketSuccessDialog from "../../components/tickets/TicketSuccessDialog";

export default function NewTicketPage() {
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
    navigate("/portal");
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
