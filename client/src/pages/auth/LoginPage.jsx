import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Box, Paper, TextField, Button, Typography, Alert, Stack, IconButton, InputAdornment } from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useAuth } from "../../context/AuthContext";
import { homeForRole } from "../../routes/ProtectedRoute";
import logo from "../../assets/logo.png";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2, backgroundImage: "radial-gradient(circle at 15% 20%, #ffe1e3 0, transparent 28%), radial-gradient(circle at 85% 80%, #f8dadd 0, transparent 24%)" }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: 420, maxWidth: "100%", borderRadius: 4, boxShadow: "0 20px 50px rgba(102, 23, 31, 0.12)" }}>
        <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
          <Box
            component="img"
            src={logo}
            alt="SOLVORA"
            sx={{ width: 64, height: 64, borderRadius: "50%", boxShadow: "0 10px 24px rgba(200, 30, 42, 0.25)", mb: 1 }}
          />
          <Typography variant="h5" fontWeight={700}>SOLVORA </Typography>
          <Typography variant="body2" color="text.secondary">IT Ticketing & Support System</Typography>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth autoFocus />
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((prev) => !prev)}
                      edge="end"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}

