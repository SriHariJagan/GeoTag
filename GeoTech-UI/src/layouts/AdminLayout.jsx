import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/context/AuthContext";
import Navbar from "../Components/Navbar/Navbar";
import { ROLES } from "../constants/roles";

const AdminLayout = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== ROLES.SUPERADMIN && user.role !== ROLES.ADMIN && user.role !== ROLES.MONITOR) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <div className="layout">
      <Navbar />

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
