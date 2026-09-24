import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import AppFooter from "./AppFooter";
 
export default function AuthLayout() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Outlet />
      </Box>
 
      <AppFooter />
    </Box>
  );
}