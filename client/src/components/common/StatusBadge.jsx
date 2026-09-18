import { Chip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { statusColors } from "../../theme/theme";

const LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

export default function StatusBadge({ status, size = "small" }) {
  const color = statusColors[status]?.color || "#757575";
  return (
    <Chip
      label={LABELS[status] || status}
      size={size}
      sx={{ color, bgcolor: alpha(color, 0.14), fontWeight: 600 }}
    />
  );
}
