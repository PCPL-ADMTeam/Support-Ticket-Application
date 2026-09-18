import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Tooltip,
  useMediaQuery,
} from "@mui/material";

import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";

import { useTheme } from "@mui/material/styles";
import { useAuth } from "../../context/AuthContext";
import { useThemeMode } from "../../context/ThemeModeContext";
import NotificationBell from "./NotificationBell";

import "./AppShell.css";

const DRAWER_WIDTH = 250;
const COLLAPSED_WIDTH = 72;

export default function AppShell({ navItems, title }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [mobileOpen, setMobileOpen] = useState(false);

  // Sidebar is collapsed when the application loads
  const [collapsed, setCollapsed] = useState(true);

  const [userMenuAnchor, setUserMenuAnchor] = useState(null);

  const { user, logout } = useAuth();
  const { mode, toggleMode } = useThemeMode();

  const navigate = useNavigate();

  // Mobile sidebar always shows labels.
  // Desktop sidebar depends on collapsed state.
  const showLabels = isMobile || !collapsed;

  const drawerWidth = isMobile
    ? DRAWER_WIDTH
    : collapsed
      ? COLLAPSED_WIDTH
      : DRAWER_WIDTH;

  const handleLogout = async () => {
    setUserMenuAnchor(null);
    await logout();
    navigate("/login");
  };

  const drawerContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Sidebar Header */}
      <Toolbar
        className="sidebar-header"
        sx={{
          gap: 1,
          px: showLabels ? 2 : 1,
          justifyContent: showLabels ? "flex-start" : "center",
        }}
      >
        <Tooltip
          title={showLabels ? "" : "Helpdesk"}
          placement="right"
          arrow
          disableHoverListener={showLabels}
        >
          <SupportAgentIcon color="primary" />
        </Tooltip>

        <Typography
          variant="h6"
          noWrap
          fontWeight={700}
          className={`sidebar-brand-text ${
            showLabels ? "" : "collapsed"
          }`}
        >
          Helpdesk
        </Typography>
      </Toolbar>

      {/* Expand / Collapse Button */}
      {!isMobile && (
        <Box
          sx={{
            display: "flex",
            justifyContent: showLabels
              ? "flex-end"
              : "center",
            px: 1,
            pb: 1,
          }}
        >
          <Tooltip
            title={
              collapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
            }
            placement="right"
            arrow
          >
            <IconButton
              onClick={() => setCollapsed((prev) => !prev)}
              className="sidebar-toggle-button"
              aria-label={
                collapsed
                  ? "Expand sidebar"
                  : "Collapse sidebar"
              }
            >
              <ChevronLeftIcon
                className={`sidebar-toggle-icon ${
                  collapsed ? "collapsed" : ""
                }`}
              />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <Divider />

      {/* Navigation */}
      <List sx={{ flex: 1, py: 1 }}>
        {navItems.map((item) => (
          <Tooltip
            key={item.to}
            title={showLabels ? "" : item.label}
            placement="right"
            arrow
            disableHoverListener={showLabels}
          >
            <ListItemButton
              component={NavLink}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className="sidebar-nav-item"
              sx={{
                justifyContent: showLabels
                  ? "flex-start"
                  : "center",

                px: showLabels ? 2 : 1,

                "&.active": {
                  bgcolor: "action.selected",
                  borderRight: `3px solid ${theme.palette.primary.main}`,
                },

                "&:hover": {
                  bgcolor: "action.hover",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: showLabels ? 40 : 0,
                  justifyContent: "center",
                  transition: "min-width 0.25s ease-in-out",
                }}
              >
                {item.icon}
              </ListItemIcon>

              <ListItemText
                primary={item.label}
                className={`sidebar-label ${
                  showLabels ? "" : "collapsed"
                }`}
              />
            </ListItemButton>
          </Tooltip>
        ))}
      </List>
    </Box>
  );

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
      }}
    >
      {/* ================= HEADER ================= */}
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: (t) => t.palette.mode === "dark" ? "rgba(42, 27, 31, 0.92)" : "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(12px)",
          zIndex: (t) => t.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {/* Mobile menu button */}
          {isMobile && (
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* Page title */}
          <Typography
            variant="h6"
            sx={{ flexGrow: 1, fontWeight: 800, color: "secondary.main" }}
            noWrap
          >
            {title}
          </Typography>

          {/* Theme */}
          <IconButton
            onClick={toggleMode}
            color="inherit"
          >
            {mode === "dark" ? (
              <Brightness7Icon />
            ) : (
              <Brightness4Icon />
            )}
          </IconButton>

          {/* Notifications */}
          <NotificationBell />

          {/* User */}
          <IconButton
            onClick={(e) =>
              setUserMenuAnchor(e.currentTarget)
            }
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: "primary.main",
              }}
            >
              {user?.name?.[0]?.toUpperCase() || "U"}
            </Avatar>
          </IconButton>

          {/* User Menu */}
          <Menu
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={() => setUserMenuAnchor(null)}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography
                variant="body2"
                fontWeight={600}
              >
                {user?.name}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                {user?.email}
              </Typography>
            </Box>

            <Divider />

            <MenuItem onClick={handleLogout}>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* ================= SIDEBAR ================= */}
      <Box
        component="nav"
        className="sidebar-nav"
        sx={{
          width: {
            md: drawerWidth,
          },
          flexShrink: {
            md: 0,
          },
        }}
      >
        <Drawer
          variant={isMobile ? "temporary" : "permanent"}
          open={isMobile ? mobileOpen : true}
          onClose={() => setMobileOpen(false)}
          ModalProps={{
            keepMounted: true,
          }}
          PaperProps={{
            className: "sidebar-paper",
          }}
          sx={{
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              boxSizing: "border-box",
              borderRight: 1,
              borderColor: "divider",
              background: (t) => t.palette.mode === "dark" ? "#2a1b1f" : "linear-gradient(180deg, #ffffff 0%, #fff7f7 100%)",
              transition:
                "width 0.25s ease-in-out",
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* ================= PAGE CONTENT ================= */}
      <Box
        component="main"
        className="main-content"
        sx={{
          flexGrow: 1,
          width: {
            md: `calc(100% - ${drawerWidth}px)`,
          },
          transition:
            "width 0.25s ease-in-out",
        }}
      >
        <Toolbar />

        <Box
          sx={{
            p: {
              xs: 2,
              md: 3,
            },
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
