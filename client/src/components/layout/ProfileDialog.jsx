import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Avatar,
  Stack,
  TextField,
  Button,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../api/auth";
import { usersApi } from "../../api/users";

// Rendered from the top-right user menu ("Profile" / "Edit Profile") in
// place of a dedicated /profile route/page.
export default function ProfileDialog({ open, mode = "view", onClose }) {
  const { user, refreshMe } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const editable = mode === "edit";

  const [name, setName] = useState(user.name);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (open) setName(user.name);
  }, [open, user.name]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await usersApi.updateOwnProfile({ name });
      await refreshMe();
      enqueueSnackbar("Profile updated", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Update failed", { variant: "error" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      enqueueSnackbar("New passwords do not match", { variant: "error" });
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      enqueueSnackbar("Password updated", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || "Failed to update password", { variant: "error" });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {editable ? "Edit Profile" : "Profile"}
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: editable ? 3 : 0 }}>
          <Avatar sx={{ width: 56, height: 56, bgcolor: "primary.main" }}>{user.name[0]}</Avatar>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>{user.name}</Typography>
            <Typography variant="body2" color="text.secondary">{user.email} · {user.role.label}</Typography>
          </Box>
        </Stack>

        {editable && (
          <>
            <Box component="form" onSubmit={handleProfileSave} sx={{ mb: 3 }}>
              <Stack spacing={2}>
                <TextField label="Full Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
                <Button type="submit" variant="contained" disabled={savingProfile} sx={{ alignSelf: "flex-start" }}>
                  Save Changes
                </Button>
              </Stack>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Change Password</Typography>
            <Box component="form" onSubmit={handlePasswordChange}>
              <Stack spacing={2}>
                <TextField label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required fullWidth />
                <TextField label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required fullWidth helperText="At least 8 characters" />
                <TextField label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required fullWidth />
                <Button type="submit" variant="contained" disabled={savingPassword} sx={{ alignSelf: "flex-start" }}>
                  Update Password
                </Button>
              </Stack>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
