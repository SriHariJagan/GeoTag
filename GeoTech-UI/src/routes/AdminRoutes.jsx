import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../store/context/AuthContext";
import AdminLayout from "../layouts/AdminLayout";
import Dashboard from "../Pages/Dashboard/AdminDashboard/AdminDashboard";
import NotFound from "../Pages/error/NotFound/NotFound";
import Projects from "../Pages/common/Projects/Projects";
import Machinery from "../Pages/admin/Machinery/Machinery";
import Vendors from "../Pages/admin/Vendors/Vendors";
import VendorProfile from "../Pages/admin/Vendors/VendorProfile";
import RFQs from "../Pages/admin/Procurement/RFQs";
import RFQDetail from "../Pages/admin/Procurement/RFQDetail";
import WorkOrders from "../Pages/admin/Procurement/WorkOrders";
import WorkOrderDetail from "../Pages/admin/Procurement/WorkOrderDetail";
import WorkOrderWizardPage from "../Pages/admin/Procurement/WorkOrderWizardPage";
import WorkOrderStudioPage from "../Pages/admin/Procurement/WorkOrderStudioPage";
import CompanySettings from "../Pages/admin/Settings/CompanySettings";
import Supervisors from "../Pages/admin/Supervisors/Supervisors";
import DER from "../Pages/common/DER/DER";
import Users from "../Pages/Users/Users";
import UserProfile from "../Pages/Users/UserProfile";
import ProjectDetails from "../Components/ProjectDetails/ProjectDetails";
import DailyReportDetails from "../Components/DailyReportDetails/DailyReportDetails";
import Logs from "../Pages/admin/Logs/Logs";
import Expenditures from "../Pages/common/Expenditures/Expenditures";
import ExpenditureDetailed from "../Pages/common/Expenditures/Expen_Admin/ExpenditureDetailed/ExpenditureDetailed";

const LOGS_ALLOWED_EMAIL = "sriharijagan04@gmail.com";

const LogsGate = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  const allowed =
    (user?.email || "").toLowerCase() === LOGS_ALLOWED_EMAIL;
  return allowed ? <Logs /> : <Navigate to="/unauthorized" replace />;
};

const AdminRoutes = () => {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        {/* /admin */}
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetails />} />
        <Route path="machines" element={<Machinery />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="vendors/:id" element={<VendorProfile />} />
        <Route path="procurement" element={<RFQs />} />
        <Route path="procurement/rfqs/:id" element={<RFQDetail />} />
        <Route path="work-orders" element={<WorkOrders />} />
        <Route path="work-orders/new" element={<WorkOrderStudioPage />} />
        <Route path="work-orders/create" element={<WorkOrderStudioPage />} />
        <Route path="work-orders/wizard" element={<WorkOrderWizardPage />} />
        <Route path="work-orders/:id" element={<WorkOrderDetail />} />
        <Route path="settings/company" element={<CompanySettings />} />
        <Route path="supervisors" element={<Supervisors />} />
        <Route path="daily-execution-report" element={<DER />} />
        <Route path="daily-execution-report/:id" element={<DailyReportDetails />} />
        <Route path="logs" element={<LogsGate />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<UserProfile />} />
        <Route path="expenditures" element={<Expenditures />} />
        <Route path="expenditures/:projectId" element={<ExpenditureDetailed />} />


        {/* fallback */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default AdminRoutes;
