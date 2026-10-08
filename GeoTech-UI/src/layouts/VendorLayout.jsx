import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/context/AuthContext";
import Navbar from "../Components/Navbar/Navbar";
import { ROLES } from "../constants/roles";

const VendorLayout = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user || user.role !== ROLES.VENDOR) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="layout vendor-layout">
      <Navbar />

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
};

export default VendorLayout;
