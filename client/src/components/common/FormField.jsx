import { useState } from "react";
import { TextField, InputAdornment, IconButton } from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

// Shared outlined text field used across the app's forms: rounded corners
// and the notched floating label come from MUI's outlined variant plus the
// global theme (see theme.js MuiOutlinedInput override) for free, as does
// the required asterisk and the red border/label on `error`. The one thing
// this adds over a bare TextField is the built-in show/hide toggle for
// type="password", so callers don't hand-wire an IconButton every time.
export default function FormField({
  label,
  type = "text",
  value,
  onChange,
  error = false,
  errorMessage = "",
  required = false,
  icon,
  sx,
  ...rest
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <TextField
      label={label}
      type={isPassword ? (showPassword ? "text" : "password") : type}
      value={value}
      onChange={onChange}
      error={error}
      helperText={error ? errorMessage : undefined}
      required={required}
      fullWidth
      variant="outlined"
      InputProps={{
        startAdornment: icon ? <InputAdornment position="start">{icon}</InputAdornment> : undefined,
        endAdornment: isPassword ? (
          <InputAdornment position="end">
            <IconButton
              onClick={() => setShowPassword((prev) => !prev)}
              edge="end"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ) : undefined,
      }}
      sx={{
        // Edge/Chromium inject their own native password-reveal icon
        // (`::-ms-reveal`) on type="password" inputs, which would render
        // alongside our own toggle above — hide only that native icon.
        "& input::-ms-reveal, & input::-ms-clear": { display: "none" },
        "& .MuiOutlinedInput-root": { "& input": { padding: "16px 18px" } },
        ...sx,
      }}
      {...rest}
    />
  );
}
