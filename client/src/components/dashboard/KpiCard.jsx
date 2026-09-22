import { Paper, Typography, Box } from "@mui/material";
import { alpha } from "@mui/material/styles";

export default function KpiCard({ label, value, color = "#c81e2a", icon, onClick }) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 2,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        cursor: onClick ? "pointer" : "default",
        borderRadius: 3,
        transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
        "&:hover": onClick ? { transform: "translateY(-3px)", boxShadow: "0 10px 24px rgba(102, 23, 31, 0.12)", borderColor: alpha(color, 0.35) } : undefined,
      }}
    >
      {/* Icon slot always reserves the same 44x44 width — even for cards
          with no icon (e.g. "Closed") — so the value/label text lines up
          identically across every card in the row instead of shifting left
          on cards that happen not to have one. */}
      <Box
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: icon ? alpha(color, 0.14) : "transparent",
          color,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Box>
    </Paper>
  );
}
