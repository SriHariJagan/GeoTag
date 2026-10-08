import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/context/AuthContext";
import { ROLES } from "../constants/roles";

const AuthLayout = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

  // Already logged in → role-based redirect
  if (user) {
    if (user.role === ROLES.SUPERADMIN || user.role === ROLES.ADMIN || user.role === ROLES.MONITOR) {
      return <Navigate to="/admin/" replace />;
    }

    if (user.role === ROLES.SUPERVISOR) {
      return <Navigate to="/supervisor/" replace />;
    }

    if (user.role === ROLES.VENDOR) {
      return <Navigate to="/vendor/" replace />;
    }
  }

  return (
    <div className="auth-layout">
      <Outlet />
    </div>
  );
};

export default AuthLayout;
