import DashboardIcon from "@mui/icons-material/Dashboard";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import PeopleIcon from "@mui/icons-material/People";
import GroupsIcon from "@mui/icons-material/Groups";
import CategoryIcon from "@mui/icons-material/Category";
import ApartmentIcon from "@mui/icons-material/Apartment";
import RuleIcon from "@mui/icons-material/Rule";
import SettingsIcon from "@mui/icons-material/Settings";
import HistoryIcon from "@mui/icons-material/History";
import AppShell from "./AppShell";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/admin/tickets", label: "All Tickets", icon: <ConfirmationNumberIcon /> },
  { to: "/admin/users", label: "Users", icon: <PeopleIcon /> },
  { to: "/admin/teams", label: "Teams / Groups", icon: <GroupsIcon /> },
  { to: "/admin/categories", label: "Categories", icon: <CategoryIcon /> },
  { to: "/admin/departments", label: "Departments", icon: <ApartmentIcon /> },
  { to: "/admin/sla", label: "Priorities & SLA", icon: <RuleIcon /> },
  { to: "/admin/settings", label: "Settings", icon: <SettingsIcon /> },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: <HistoryIcon /> },
];

export default function AdminLayout() {
  return <AppShell navItems={navItems} title="Admin Portal" />;
}
