"""Project expenditures router — clean V3 model (legacy /expenditures/* deprecated)."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.utils.dependencies import get_current_user, require_roles
from app.utils.pagination import page_param, limit_param, set_total
from app.core.rbac import normalize_role
from app.modules.project_expenditures import schemas, service

router = APIRouter(prefix="/project-expenditures", tags=["Project Expenditures"])


@router.post("/", response_model=schemas.ProjectExpenditureResponse, status_code=201)
def create(data: schemas.ProjectExpenditureCreate, db: Session = Depends(get_db),
           current_user=Depends(get_current_user)):
    if normalize_role(current_user.role) not in ("SUPERVISOR", "SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    return service.create_expenditure(db, data, current_user)


@router.get("/")
def list_all(project_id: Optional[int] = None, status: Optional[str] = None,
             q: Optional[str] = None, category: Optional[str] = None,
             page: int = page_param(), limit: int = limit_param(),
             db: Session = Depends(get_db),
             current_user=Depends(get_current_user),
             response: Response = None):
    rows, total = service.list_expenditures(db, current_user, project_id=project_id,
                                            status=status, q=q, category=category,
                                            page=page, limit=limit)
    if response is not None:
        set_total(response, total)
    return rows


@router.get("/project/{project_id}/totals")
def totals(project_id: int, db: Session = Depends(get_db),
           current_user=Depends(get_current_user)):
    return service.project_totals(db, project_id, current_user)


@router.patch("/{exp_id}", response_model=schemas.ProjectExpenditureResponse)
def patch(exp_id: int, data: schemas.ProjectExpenditureUpdate,
          db: Session = Depends(get_db),
          current_user=Depends(get_current_user)):
    return service.update_expenditure(db, exp_id, data, current_user)


@router.post("/{exp_id}/submit", response_model=schemas.ProjectExpenditureResponse)
def submit(exp_id: int, db: Session = Depends(get_db),
           current_user=Depends(get_current_user)):
    return service.submit_expenditure(db, exp_id, current_user)


@router.post("/{exp_id}/approve", response_model=schemas.ProjectExpenditureResponse,
             dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN"))])
def approve(exp_id: int, reason: str = "", db: Session = Depends(get_db),
            current_user=Depends(get_current_user)):
    return service.review_expenditure(db, exp_id, current_user, approve=True,
                                      reason=reason)


@router.post("/{exp_id}/reject", response_model=schemas.ProjectExpenditureResponse,
             dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN"))])
def reject(exp_id: int, reason: str = "", db: Session = Depends(get_db),
           current_user=Depends(get_current_user)):
    return service.review_expenditure(db, exp_id, current_user, approve=False,
                                      reason=reason)


@router.delete("/{exp_id}", dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN"))])
def remove(exp_id: int, db: Session = Depends(get_db),
           current_user=Depends(get_current_user)):
    return service.delete_expenditure(db, exp_id, current_user)
