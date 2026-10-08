import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import VendorLayout from "../layouts/VendorLayout";

import NotFound from "../Pages/error/NotFound/NotFound";
import { ROLES } from "../constants/roles";
import VendorDashboard from "../Pages/vendor/VendorDashboard";
import VendorRFQs from "../Pages/vendor/VendorRFQs";
import VendorRFQDetail from "../Pages/vendor/VendorRFQDetail";
import VendorWorkOrders from "../Pages/vendor/VendorWorkOrders";
import VendorWorkOrderDetail from "../Pages/vendor/VendorWorkOrderDetail";
import VendorProjects from "../Pages/vendor/VendorProjects";

export default function VendorRoutes() {
  return (
    <Routes>
      <Route element={<ProtectedRoute allowedRoles={[ROLES.VENDOR]} />}>
        <Route element={<VendorLayout />}>
          <Route index element={<VendorDashboard />} />
          <Route path="rfqs" element={<VendorRFQs />} />
          <Route path="rfqs/:id" element={<VendorRFQDetail />} />
          <Route path="work-orders" element={<VendorWorkOrders />} />
          <Route path="work-orders/:id" element={<VendorWorkOrderDetail />} />
          <Route path="projects" element={<VendorProjects />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
