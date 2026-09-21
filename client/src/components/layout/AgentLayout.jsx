import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AppShell from "./AppShell";

// AGENT = department manager — reviews/manages department tickets. Agents
// do not raise tickets from this portal (no nav item, no header "Create
// Ticket" button — omitting raiseTicketPath is what removes that), and
// never see Admin-only management pages (Users, Departments, Email
// Templates, etc.).
const navItems = [
  { to: "/agent", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/agent/queue", label: "Department Tickets", icon: <AssignmentIcon /> },
];

export default function AgentLayout() {
  return <AppShell navItems={navItems} ticketSearchPath="/agent/queue" />;
}
