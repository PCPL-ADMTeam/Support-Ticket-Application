import { Box, Typography } from "@mui/material";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

export default function EmptyState({ title = "Nothing here yet", subtitle }) {
  return (
    <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
      <InboxOutlinedIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
      <Typography variant="h6">{title}</Typography>
      {subtitle && <Typography variant="body2">{subtitle}</Typography>}
    </Box>
  );
}
