import DashboardIcon from "@mui/icons-material/Dashboard";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AppShell from "./AppShell";

const navItems = [
  { to: "/manager", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/manager/tickets", label: "All Department Tickets", icon: <ConfirmationNumberIcon /> },
  { to: "/manager/unassigned", label: "Unassigned", icon: <AssignmentLateIcon /> },
  { to: "/manager/assigned", label: "Assigned Tickets", icon: <AssignmentTurnedInIcon /> },
  { to: "/manager/overdue", label: "Overdue", icon: <WarningAmberIcon /> },
];

export default function ManagerLayout() {
  return <AppShell navItems={navItems} ticketSearchPath="/manager/tickets" />;
}
