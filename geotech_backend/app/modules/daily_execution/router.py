from app.modules.daily_execution.models import DailyExecutionReport
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from sqlalchemy import case, desc
from sqlalchemy.orm import Session
from datetime import date 
from app.core.database import get_db
from app.utils.dependencies import (
    get_current_user,
    require_superadmin,
    require_roles
)
from . import schemas, service

router = APIRouter(
    prefix="/daily-execution",
    tags=["Daily Execution Reports"]
)

@router.post(
    "/",
    response_model=schemas.DailyExecutionResponse,
    dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR"))]
)
def create_daily_report(data: schemas.DailyExecutionCreate,
                        db: Session = Depends(get_db),
                        current_user=Depends(get_current_user)):
    try:
        report = service.create_report(db, data, current_user)
    except HTTPException:
        raise
    if not report:
        raise HTTPException(status_code=403, detail="Not allowed to create report for this project")
    return report


@router.get(
    "/",
    response_model=list[schemas.DailyExecutionResponse],
    dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR", "MONITOR"))]
)
def get_all_daily_execution_reports(page: int = Query(1, ge=1),
                                    limit: int = Query(20, le=100),
                                    project_id: int | None = None,
                                    report_date: date | None = None,
                                    vendor_id: int | None = None,
                                    db: Session = Depends(get_db),
                                    current_user=Depends(get_current_user),
                                    response: Response = None):
    from app.utils.pagination import set_total as _set_total
    rows, total = service.get_all_daily_reports(db, current_user, page, limit, project_id,
                                                report_date, vendor_id)
    if response is not None:
        _set_total(response, total)
    return rows


@router.put(
    "/{report_id}",
    response_model=schemas.DailyExecutionResponse,
    dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR"))]
)
def update_daily_report(report_id: int,
                        data: schemas.DailyExecutionUpdate,
                        db: Session = Depends(get_db),
                        current_user=Depends(get_current_user)):
    try:
        report = service.update_report(db, report_id, data, current_user)
    except HTTPException:
        raise
    if not report:
        raise HTTPException(status_code=403, detail="Not allowed or report not found")
    return report


@router.post("/{report_id}/submit", response_model=schemas.DailyExecutionResponse,
             dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR"))])
def submit_daily_report(report_id: int, db: Session = Depends(get_db),
                        current_user=Depends(get_current_user)):
    return service.submit_report(db, report_id, current_user)


@router.delete(
    "/{report_id}",
    dependencies=[Depends(require_roles("SUPERADMIN"))]  # only admin
)
def delete_daily_report(report_id: int,
                        db: Session = Depends(get_db),
                        current_user=Depends(get_current_user)):
    if not service.delete_report(db, report_id, current_user):
        raise HTTPException(status_code=403, detail="Not allowed or report not found")
    return {"message": "Daily execution report deleted successfully"}


    
# NOTE: registered before /{report_id} so "edit-requests" is not parsed as an id.
@router.get(
    "/edit-requests",
    response_model=list[schemas.DEREditRequestResponse],
    dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR"))]
)
def list_der_edit_requests(status: str | None = None,
                           report_id: int | None = None,
                           db: Session = Depends(get_db),
                           current_user=Depends(get_current_user)):
    """Admins see every request; supervisors see only their own."""
    return service.list_edit_requests(db, current_user, status=status,
                                      report_id=report_id)


@router.post(
    "/edit-requests/{request_id}/review",
    response_model=schemas.DEREditRequestResponse,
    dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN"))]
)
def review_der_edit_request(request_id: int, data: schemas.DEREditRequestReview,
                            db: Session = Depends(get_db),
                            current_user=Depends(get_current_user)):
    """Admin approves (report unlocks to DRAFT) or rejects with a note."""
    return service.review_der_edit(db, request_id, current_user,
                                   approve=data.approve, note=data.note)


@router.post(
    "/{report_id}/edit-requests",
    response_model=schemas.DEREditRequestResponse,
    status_code=201,
    dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR"))]
)
def create_der_edit_request(report_id: int, data: schemas.DEREditRequestCreate,
                            db: Session = Depends(get_db),
                            current_user=Depends(get_current_user)):
    """Supervisor asks admin to unlock one of their submitted reports."""
    return service.request_der_edit(db, report_id, current_user, data.message)


@router.get(
    "/{report_id}",
    response_model=schemas.DailyExecutionResponse,
    dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR", "MONITOR"))]
)
def get_daily_report_by_id(
    report_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    report = service.get_report_by_id(db, report_id, current_user)

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return report


@router.post("/{report_id}/manpower", status_code=201,
             dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR"))])
def add_manpower(report_id: int, data: schemas.DERManpowerCreate,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    return service.add_manpower(db, report_id, data, current_user)


@router.post("/{report_id}/equipment", status_code=201,
             dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR"))])
def add_equipment(report_id: int, data: schemas.DEREquipmentCreate,
                  db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    return service.add_equipment(db, report_id, data, current_user)


@router.post("/{report_id}/vendor-activity", status_code=201,
             dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "SUPERVISOR"))])
def add_vendor_activity(report_id: int, data: schemas.DERVendorActivityCreate,
                        db: Session = Depends(get_db),
                        current_user=Depends(get_current_user)):
    return service.add_vendor_activity(db, report_id, data, current_user)