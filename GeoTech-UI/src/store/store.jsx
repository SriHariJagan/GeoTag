import React from "react";
import { DashboardProvider } from "./context/DashboardContext";
import { MachineProvider } from "./context/MachineContext";
import { VendorProvider } from "./context/VendorContext";
import { SupervisorProvider } from "./context/SupervisorContext";
import { DERProvider } from "./context/DailyExecutionContext";
import { UserProvider } from "./context/UserContext";
import { ExpendituresProvider } from "./context/ExpendituresContext";
import { ProcurementProvider } from "./context/ProcurementContext";
import { AuthProvider } from "./context/AuthContext";
import { ProjectProvider } from "./context/ProjectContext";

const Store = ({ children }) => {
  return (
    <>
      <AuthProvider>
        <DashboardProvider>
          <ProjectProvider>
            <DERProvider>
              <SupervisorProvider>
                <VendorProvider>
                  <MachineProvider>
                    <UserProvider>
                      <ExpendituresProvider>
                        <ProcurementProvider>
                          {children}
                        </ProcurementProvider>
                      </ExpendituresProvider>
                    </UserProvider>
                  </MachineProvider>
                </VendorProvider>
              </SupervisorProvider>
            </DERProvider>
          </ProjectProvider>
        </DashboardProvider>
      </AuthProvider>
    </>
  );
};

export default Store;
