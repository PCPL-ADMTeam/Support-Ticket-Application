import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Paper, TextField, Button, Typography, Alert, Stack, Link } from "@mui/material";
import logo from "../../assets/logo.png";
import { authApi } from "../../api/auth";

// Same domain rule the backend independently re-enforces
// (auth.validator.js / auth.service.js's COMPANY_EMAIL_PATTERN) — this is
// UX only, never the source of truth, so it stays a plain, exact-match
// regex rather than anything fancier.
const COMPANY_EMAIL_PATTERN = /^[^\s@]+@powercen\.com$/i;

// Mirrors LoginPage.jsx's outer layout (gradient background, centered
// Paper card, logo/title) so this reads as the same product, not a
// separate flow — per "fit the existing Solvora login design."
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!COMPANY_EMAIL_PATTERN.test(email.trim())) {
      setError("Please use your @powercen.com company email address.");
      return;
    }

    setSubmitting(true);
    try {
      // The backend's response is identical whether or not the account
      // exists — see auth.service.js#forgotPassword — so success here
      // never implies (or denies) that this email is registered.
      await authApi.forgotPassword(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Please try again.");
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
          <Typography variant="h5" fontWeight={700}>Forgot Password?</Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Enter your registered company email address and we&apos;ll send you a password reset link.
          </Typography>
        </Stack>

        {submitted ? (
          <Stack spacing={3}>
            <Alert severity="success">
              If an account exists for this email address, a password reset link has been sent.
            </Alert>
            <Button component={RouterLink} to="/login" variant="outlined" fullWidth>
              Return to Login
            </Button>
          </Stack>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="Email"
                type="email"
                placeholder="you@powercen.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                required
                fullWidth
                autoFocus
              />
              <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
                {submitting ? "Sending..." : "Send Reset Link"}
              </Button>
              <Box sx={{ textAlign: "center" }}>
                <Link component={RouterLink} to="/login" variant="body2" underline="hover" color="text.secondary">
                  Return to Login
                </Link>
              </Box>
            </Stack>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
