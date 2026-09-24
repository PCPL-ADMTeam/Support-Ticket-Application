import { Box, Typography } from "@mui/material";
 
export default function AppFooter() {
  return (
<Box
      component="footer"
      sx={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        py: 1.5,
      }}
>
<Typography
variant="caption"
color="text.secondary"
sx={{
fontSize: "1rem",
}}
>
© Powered by{" "}
<strong style={{ fontSize: "1.1rem", fontWeight: 700 }}>
ADM Team
</strong>
</Typography>

</Box>
  );
}