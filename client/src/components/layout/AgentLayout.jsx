import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import AppShell from "./AppShell";

// AGENT = department manager. Deliberately just 3 sidebar items — the
// personal-vs-department distinction lives INSIDE the Dashboard page
// (/agent?view=my|department, see AgentDashboardPage.jsx) and INSIDE the
// Tickets page (/agent/queue?view=my|department, see AgentQueuePage.jsx)
// as an in-page Tabs switch, never as separate sidebar entries/routes.
// Agents can also raise a ticket themselves (reusing the same
// NewTicketPage/POST /tickets flow the USER portal uses — see App.jsx's
// /agent/new-ticket route). Agents never see Admin-only management pages
// (Users, Departments, Email Templates, etc.).
const navItems = [
  { to: "/agent", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/agent/new-ticket", label: "Raise a Ticket", icon: <AddCircleIcon /> },
  { to: "/agent/queue", label: "Tickets", icon: <AssignmentIcon /> },
];

export default function AgentLayout() {
  return <AppShell navItems={navItems} ticketSearchPath="/agent/queue" raiseTicketPath="/agent/new-ticket" />;
}
