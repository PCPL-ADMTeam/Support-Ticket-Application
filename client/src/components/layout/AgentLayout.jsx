import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import AppShell from "./AppShell";

// AGENT = department manager — reviews/manages department tickets, and can
// also raise a ticket themselves (reusing the same NewTicketPage/POST
// /tickets flow the USER portal uses — see App.jsx's /agent/new-ticket
// route). Agents never see Admin-only management pages (Users,
// Departments, Email Templates, etc.).
const navItems = [
  { to: "/agent", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/agent/new-ticket", label: "Raise a Ticket", icon: <AddCircleIcon /> },
  { to: "/agent/queue", label: "Department Tickets", icon: <AssignmentIcon /> },
];

export default function AgentLayout() {
  return <AppShell navItems={navItems} ticketSearchPath="/agent/queue" raiseTicketPath="/agent/new-ticket" />;
}
