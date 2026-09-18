import { useEffect, useState, useCallback } from "react";
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  Button,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../../api/notifications";
import { formatDistanceToNow } from "date-fns";

export default function NotificationBell() {
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await notificationsApi.list();
      setNotifications(data.data);
    } catch {
      /* silently ignore — bell is non-critical */
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // poll every minute
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleClickNotification = async (n) => {
    if (!n.isRead) await notificationsApi.markRead(n.id);
    handleClose();
    load();
    if (n.ticket) navigate(`/tickets/${n.ticket.id}`);
  };

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    load();
  };

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen}>
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose} PaperProps={{ sx: { width: 360 } }}>
        <Box sx={{ px: 2, py: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="subtitle1" fontWeight={700}>Notifications</Typography>
          <Button size="small" onClick={handleMarkAllRead}>Mark all read</Button>
        </Box>
        <Divider />
        {notifications.length === 0 && (
          <MenuItem disabled>No notifications</MenuItem>
        )}
        {notifications.map((n) => (
          <MenuItem
            key={n.id}
            onClick={() => handleClickNotification(n)}
            sx={{ whiteSpace: "normal", bgcolor: n.isRead ? "transparent" : "action.hover" }}
          >
            <Box>
              <Typography variant="body2" fontWeight={600}>{n.title}</Typography>
              <Typography variant="caption" color="text.secondary">{n.message}</Typography>
              <Typography variant="caption" display="block" color="text.disabled">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
