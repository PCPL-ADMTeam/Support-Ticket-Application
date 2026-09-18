import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "../context/AuthContext";

// Blocks unauthenticated access to everything nested under it, and
// redirects a logged-in user to their role's home if they land on a
// portal they're not allowed in.
export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role.name)) {
    return <Navigate to={homeForRole(user.role.name)} replace />;
  }

  return <Outlet />;
}

export function homeForRole(roleName) {
  if (roleName === "ADMIN") return "/admin";
  if (roleName === "AGENT") return "/agent";
  return "/portal";
}
