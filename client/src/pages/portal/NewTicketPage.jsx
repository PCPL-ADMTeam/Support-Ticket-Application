import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Paper } from "@mui/material";
import { useSnackbar } from "notistack";
import { ticketsApi } from "../../api/tickets";
import TicketForm from "../../components/tickets/TicketForm";

export default function NewTicketPage() {
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      const { data } = await ticketsApi.create(payload);
      enqueueSnackbar(`Ticket ${data.data.ticketNumber} created`, { variant: "success" });
      navigate(`/tickets/${data.data.id}`);
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to create ticket", { variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box maxWidth={720}>
      <Typography variant="h4" gutterBottom>Raise a Ticket</Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <TicketForm onSubmit={handleSubmit} submitting={submitting} />
      </Paper>
    </Box>
  );
}
