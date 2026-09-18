import { Box, CircularProgress } from "@mui/material";

export default function LoadingState({ minHeight = 240 }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight }}>
      <CircularProgress />
    </Box>
  );
}
