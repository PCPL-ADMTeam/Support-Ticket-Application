import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Box, Paper, TextField, Button, Typography, Alert, Stack } from "@mui/material";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import { useAuth } from "../../context/AuthContext";
import { homeForRole } from "../../routes/ProtectedRoute";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const redirectTo = location.state?.from?.pathname || homeForRole(user.role.name);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2 }}>
      <Paper variant="outlined" sx={{ p: 4, width: 400, maxWidth: "100%" }}>
        <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
          <SupportAgentIcon color="primary" sx={{ fontSize: 40 }} />
          <Typography variant="h5" fontWeight={700}>Helpdesk Sign In</Typography>
          <Typography variant="body2" color="text.secondary">IT Ticketing & Support System</Typography>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth autoFocus />
            <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
            <Button type="submit" variant="contained" size="large" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
