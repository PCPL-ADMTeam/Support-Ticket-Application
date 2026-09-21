import DashboardIcon from "@mui/icons-material/Dashboard";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import PeopleIcon from "@mui/icons-material/People";
import ApartmentIcon from "@mui/icons-material/Apartment";
import RuleIcon from "@mui/icons-material/Rule";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import SettingsIcon from "@mui/icons-material/Settings";
import HistoryIcon from "@mui/icons-material/History";
import AppShell from "./AppShell";

// Teams/Groups is intentionally not linked here — the department itself is
// now the organizational group (one AGENT manager + its USER employees via
// User.departmentId). The Team/TeamMember models, API, and admin page still
// exist for backward compatibility with any historical data, just unused by
// this navigation and by ticket assignment.
const navItems = [
  { to: "/admin", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/admin/new-ticket", label: "Raise a Ticket", icon: <AddCircleIcon /> },
  { to: "/admin/tickets", label: "All Tickets", icon: <ConfirmationNumberIcon /> },
  { to: "/admin/users", label: "Users", icon: <PeopleIcon /> },
  { to: "/admin/departments", label: "Departments", icon: <ApartmentIcon /> },
  { to: "/admin/sla", label: "Priorities & SLA", icon: <RuleIcon /> },
  { to: "/admin/email-templates", label: "Email Templates", icon: <MarkEmailReadIcon /> },
  { to: "/admin/settings", label: "Settings", icon: <SettingsIcon /> },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: <HistoryIcon /> },
];

export default function AdminLayout() {
  return <AppShell navItems={navItems} ticketSearchPath="/admin/tickets" raiseTicketPath="/admin/new-ticket" />;
}
