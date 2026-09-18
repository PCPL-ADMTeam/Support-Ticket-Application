import DashboardIcon from "@mui/icons-material/Dashboard";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PersonIcon from "@mui/icons-material/Person";
import AppShell from "./AppShell";

const navItems = [
  { to: "/portal", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/portal/new-ticket", label: "Raise a Ticket", icon: <AddCircleIcon /> },
  { to: "/portal/my-tickets", label: "Tickets", icon: <ListAltIcon /> },
  { to: "/portal/profile", label: "Profile", icon: <PersonIcon /> },
];

export default function PortalLayout() {
  return (
    <AppShell
      navItems={navItems}
      ticketSearchPath="/portal/my-tickets"
      raiseTicketPath="/portal/new-ticket"
    />
  );
}
