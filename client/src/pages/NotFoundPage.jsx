import { Box, Typography, Button } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
      <Typography variant="h2" fontWeight={700}>404</Typography>
      <Typography variant="body1" color="text.secondary">Page not found</Typography>
      <Button component={RouterLink} to="/" variant="contained">Go Home</Button>
    </Box>
  );
}
