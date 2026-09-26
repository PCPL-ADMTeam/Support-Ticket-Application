import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import AppShell from "./AppShell";

// Shared by both department-management roles (MANAGER and TEAMLEAD) —
// identical nav either way; the two roles' different capabilities (e.g. no
// "Assigned to Me" for a Manager, single- vs multi-department scope) are
// handled INSIDE the pages themselves, never as separate sidebar
// entries/routes. Deliberately just 3 sidebar items — the personal-vs-
// department distinction lives INSIDE the Dashboard page
// (/agent?view=my|department, see AgentDashboardPage.jsx) and INSIDE the
// Tickets page (/agent/queue?view=my|department, see AgentQueuePage.jsx)
// as an in-page Tabs switch. Both roles can also raise a ticket themselves
// (reusing the same NewTicketPage/POST /tickets flow the Employee portal
// uses — see App.jsx's /agent/new-ticket route). Neither role sees
// Admin-only management pages (Users, Departments, Email Templates, etc.).
const navItems = [
  { to: "/agent", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/agent/new-ticket", label: "Raise a Ticket", icon: <AddCircleIcon /> },
  { to: "/agent/queue", label: "Tickets", icon: <AssignmentIcon /> },
];

export default function AgentLayout() {
  //return <AppShell navItems={navItems} ticketSearchPath="/agent/queue" raiseTicketPath="/agent/new-ticket" />;
    return <AppShell navItems={navItems} /* ticketSearchPath="/agent/queue" */ raiseTicketPath="/agent/new-ticket" />;
}
