import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../store/context/AuthContext";
import { ROLES } from "../constants/roles";

import AdminRoutes from "./AdminRoutes";
// import SupervisorRoutes from "./SupervisorRoutes";
import AuthLayout from "../layouts/AuthLayout";

// Pages
import Login from "../Pages/auth/login/Login";
import ForgotPassword from "../Pages/auth/forgot-password/ForgotPassword";
import ResetPassword from "../Pages/auth/reset-password/ResetPassword";
import Unauthorized from "../Pages/error/Unauthorized/Unauthorized";
import NotFound from "../Pages/error/NotFound/NotFound";
import AcceptInvite from "../Pages/AcceptInvite/AcceptInvite";
import SupervisorRoutes from "./SupervisorRoutes";
import VendorRoutes from "./VendorRoutes";

export default function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Auth */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
      </Route>

      {/* Admin */}
      <Route path="/admin/*" element={<AdminRoutes />} />

      {/* Supervisor (later) */}
      <Route path="/supervisor/*" element={<SupervisorRoutes />} />

      {/* Vendor portal */}
      <Route path="/vendor/*" element={<VendorRoutes />} />

      {/* Errors */}
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Root redirect */}
      <Route
        path="/"
        element={
          user ? (
            user.role === ROLES.SUPERADMIN || user.role === ROLES.ADMIN || user.role === ROLES.MONITOR ? (
              <Navigate to="/admin" replace />
            ) : user.role === ROLES.VENDOR ? (
              <Navigate to="/vendor" replace />
            ) : (
              <Navigate to="/supervisor" replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
