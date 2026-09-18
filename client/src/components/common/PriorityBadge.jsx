import { Chip } from "@mui/material";

export default function PriorityBadge({ name, color = "#757575", size = "small" }) {
  return (
    <Chip
      label={name}
      size={size}
      variant="outlined"
      sx={{ color, borderColor: color, fontWeight: 600 }}
    />
  );
}
