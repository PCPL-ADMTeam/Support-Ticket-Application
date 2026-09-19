import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import AppShell from "./AppShell";

const navItems = [
  { to: "/agent", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/agent/queue", label: "My Queue", icon: <AssignmentIcon /> },
];

export default function AgentLayout() {
  return <AppShell navItems={navItems} />;
}
