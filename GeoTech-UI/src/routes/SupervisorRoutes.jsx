import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import SupervisorLayout from "../layouts/SupervisorLayout";
import { useAuth } from "../store/context/AuthContext";

// Pages
import NotFound from "../Pages/error/NotFound/NotFound";
import { ROLES } from "../constants/roles";
import Projects from "../Pages/common/Projects/Projects";
import DER from "../Pages/common/DER/DER";
import Expenditures from "../Pages/common/Expenditures/Expenditures";
import UserProfile from "../Pages/Users/UserProfile";
import ProjectDetails from "../Components/ProjectDetails/ProjectDetails";
import DailyReportDetails from "../Components/DailyReportDetails/DailyReportDetails";
import WorkOrderDetail from "../Pages/admin/Procurement/WorkOrderDetail";

const OwnProfile = () => {
  const { user } = useAuth();
  if (!user) return null;
  return <UserProfile userId={user.id} />;
};

export default function SupervisorRoutes() {
  return (
    <Routes>
      <Route
        element={
          <ProtectedRoute allowedRoles={[ROLES.SUPERVISOR]} />
        }
      >
        <Route element={<SupervisorLayout />}>
          {/* Supervisor dashboard can also be added here if you have one */}
          <Route index element={<Projects />} />

          {/* Pages accessible to supervisors */}
          <Route path="my-projects" element={<Projects />} />
          <Route path="my-projects/:id" element={<ProjectDetails />} />
          <Route path="daily-execution-report" element={<DER />} />
          <Route path="daily-execution-report/:id" element={<DailyReportDetails />} />
          <Route path="expenditures" element={<Expenditures />} />
          <Route path="profile" element={<OwnProfile />} />
          {/* Read-only work-order view for assigned projects */}
          <Route path="work-orders/:id" element={<WorkOrderDetail />} />

          {/* fallback for unknown routes */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
