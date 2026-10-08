from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.utils.dependencies import require_superadmin, require_roles, normalize_role, get_current_user
from app.utils.pagination import page_param, limit_param, set_total
from . import service, schemas

router = APIRouter(
    prefix="/supervisors",
    tags=["Supervisors"],
)

# Super Admin view of all supervisors (read-only monitors included)
@router.get(
    "/",
    response_model=list[schemas.SupervisorAdminView],
    dependencies=[Depends(require_roles("SUPERADMIN", "MONITOR"))]
)
def list_supervisors_admin(q: Optional[str] = None,
                           page: int = page_param(), limit: int = limit_param(),
                           db: Session = Depends(get_db),
                           response: Response = None):
    rows, total = service.get_supervisors_admin_view(db, q=q, page=page, limit=limit)
    if response is not None:
        set_total(response, total)
    return rows

@router.get("/my-attendance")
def my_attendance(db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    """The signed-in supervisor's own attendance and machinery cost,
    across every project they are assigned to."""
    if normalize_role(current_user.role) != "SUPERVISOR":
        raise HTTPException(status_code=403, detail="Supervisors only")
    from app.modules.projects import service as project_service
    data = project_service.get_supervisor_attendance(
        db, supervisor_id=current_user.id)
    data["supervisors"] = [s for s in data["supervisors"]
                           if s["supervisor_id"] == current_user.id]
    mine = data["supervisors"][0] if data["supervisors"] else {
        "supervisor_id": current_user.id, "name": current_user.full_name,
        "employee_id": current_user.employee_id, "designation": current_user.designation,
        "email": current_user.email, "projects": 0, "days_worked": 0, "reports": 0,
        "hours_worked": 0.0, "avg_hours_per_day": 0.0, "manpower_count_total": 0,
        "manpower_days": 0.0, "total_depth": 0.0, "machines": [],
        "machinery_cost": 0.0, "cost_per_day": 0.0, "per_project": [],
    }
    data["totals"] = {
        "supervisors": 1,
        "days_worked": mine["days_worked"],
        "reports": mine["reports"],
        "hours_worked": mine["hours_worked"],
        "machinery_cost": mine["machinery_cost"],
    }
    data["me"] = mine
    return data