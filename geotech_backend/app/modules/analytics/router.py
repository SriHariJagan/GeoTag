from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.analytics import schemas, service
from app.modules.projects.service import is_supervisor_assigned
from app.utils.dependencies import get_current_user, normalize_role, require_roles

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _can_access_project(db: Session, project_id: int, current_user):
    role = normalize_role(current_user.role)
    if role in ("SUPERADMIN", "MONITOR"):
        return True
    if role == "SUPERVISOR":
        return is_supervisor_assigned(db, project_id, current_user.id)
    return False


@router.get(
    "/projects/{project_id}/delay-risk",
    response_model=schemas.DelayRiskResponse,
)
def get_project_delay_risk(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not _can_access_project(db, project_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    result = service.get_delay_risk(db, project_id)
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@router.get(
    "/projects/{project_id}/cost-risk",
    response_model=schemas.CostRiskResponse,
)
def get_project_cost_risk(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not _can_access_project(db, project_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    result = service.get_cost_risk(db, project_id)
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@router.get(
    "/dashboard/insights",
    response_model=schemas.DashboardInsightsResponse,
    dependencies=[Depends(require_roles("SUPERADMIN", "MONITOR"))],
)
def get_dashboard_insights(db: Session = Depends(get_db)):
    return service.get_dashboard_insights(db)
