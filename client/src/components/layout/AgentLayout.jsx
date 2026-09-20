import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import AppShell from "./AppShell";

// AGENT = department manager — the sidebar reflects that (department-wide
// ticket queue + the ability to raise a ticket themselves), never
// Admin-only management pages (Users, Departments, Email Templates, etc.).
const navItems = [
  { to: "/agent", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/agent/queue", label: "Department Tickets", icon: <AssignmentIcon /> },
  { to: "/agent/new-ticket", label: "Raise Ticket", icon: <AddCircleIcon /> },
];

export default function AgentLayout() {
  return <AppShell navItems={navItems} ticketSearchPath="/agent/queue" raiseTicketPath="/agent/new-ticket" />;
}
