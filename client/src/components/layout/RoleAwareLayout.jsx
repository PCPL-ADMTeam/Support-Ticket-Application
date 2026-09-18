import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AdminLayout from "./AdminLayout";
import AgentLayout from "./AgentLayout";
import PortalLayout from "./PortalLayout";

// Used for routes reachable from any portal (e.g. /tickets/:id, linked from
// notifications regardless of role) — renders whichever shell matches the
// signed-in user's role so the sidebar/nav stays consistent.
export default function RoleAwareLayout() {
  const { user } = useAuth();
  if (user.role.name === "ADMIN") return <AdminLayout />;
  if (user.role.name === "AGENT") return <AgentLayout />;
  return <PortalLayout />;
}
