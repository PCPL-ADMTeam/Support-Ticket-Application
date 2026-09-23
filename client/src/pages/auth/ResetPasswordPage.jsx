import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link as RouterLink } from "react-router-dom";
import { Box, Paper, TextField, Button, Typography, Alert, Stack, IconButton, InputAdornment } from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import logo from "../../assets/logo.png";
import { authApi } from "../../api/auth";

// Reads `token` from the URL (never displayed/exposed in the UI itself —
// it only ever travels in the query string and the API request body) and
// redeems it via POST /auth/reset-password. This route is intentionally
// OUTSIDE ProtectedRoute (see App.jsx) — a user resetting their password
// is by definition not logged in, and access here is governed entirely by
// possessing a valid, unexpired, unused token, not by a Solvora session.
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  // Auto-redirect to /login after a successful reset — never auto-login;
  // the user must enter their new password like any normal sign-in.
  useEffect(() => {
    if (!succeeded) return;
    const timer = setTimeout(() => navigate("/login", { replace: true }), 2500);
    return () => clearTimeout(timer);
  }, [succeeded, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setSucceeded(true);
    } catch (err) {
      setError(err.response?.data?.message || "This password reset link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  };

  const header = (
    <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
      <Box
        component="img"
        src={logo}
        alt="SOLVORA"
        sx={{ width: 64, height: 64, borderRadius: "50%", boxShadow: "0 10px 24px rgba(200, 30, 42, 0.25)", mb: 1 }}
      />
      <Typography variant="h5" fontWeight={700}>Reset Password</Typography>
    </Stack>
  );

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2, backgroundImage: "radial-gradient(circle at 15% 20%, #ffe1e3 0, transparent 28%), radial-gradient(circle at 85% 80%, #f8dadd 0, transparent 24%)" }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: 420, maxWidth: "100%", borderRadius: 4, boxShadow: "0 20px 50px rgba(102, 23, 31, 0.12)" }}>
        {!token ? (
          // No token in the URL at all — never even attempt the request,
          // same clean error state as a rejected/expired one.
          <>
            {header}
            <Stack spacing={3}>
              <Alert severity="error">Password reset link is invalid or has expired.</Alert>
              <Button component={RouterLink} to="/login" variant="outlined" fullWidth>
                Return to Login
              </Button>
            </Stack>
          </>
        ) : succeeded ? (
          <>
            {header}
            <Stack spacing={3}>
              <Alert severity="success">Your password has been reset successfully.</Alert>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Redirecting you to login…
              </Typography>
              <Button component={RouterLink} to="/login" variant="contained" fullWidth>
                Go to Login Now
              </Button>
            </Stack>
          </>
        ) : (
          <>
            {header}
            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={2}>
                {error && (
                  // A rejected token (invalid/expired/already used) surfaces
                  // here via the same generic message, with a way back to
                  // Login — no raw API/database error is ever shown.
                  <Alert severity="error">{error}</Alert>
                )}
                <TextField
                  label="New Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  required
                  fullWidth
                  autoFocus
                  helperText="At least 8 characters"
                  sx={{ "& input::-ms-reveal, & input::-ms-clear": { display: "none" } }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword((v) => !v)} edge="end" aria-label={showPassword ? "Hide password" : "Show password"}>
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label="Confirm Password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                  required
                  fullWidth
                />
                <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
                  {submitting ? "Resetting..." : "Reset Password"}
                </Button>
              </Stack>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
}
