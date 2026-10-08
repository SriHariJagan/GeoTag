import { ROLES } from "../../../constants/roles"
import { useAuth } from "../../../store/context/AuthContext"
import ExpendituresAdmin from "./Expen_Admin/ExpendituresAdmin"
import ExpendituresSupervisor from "./Expen_Supervisor/ExpendituresSupervisor"

const Expenditures = () => {
  const { user } = useAuth()

  if (!user) return null

  if (user.role === ROLES.SUPERADMIN || user.role === ROLES.ADMIN || user.role === ROLES.MONITOR) {
    return <ExpendituresAdmin />
  }

  if (user.role === ROLES.SUPERVISOR) {
    return <ExpendituresSupervisor />
  }

  return <div>Unauthorized</div>
}

export default Expenditures