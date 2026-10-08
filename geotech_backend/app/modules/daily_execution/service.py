"""DER service — V3 repairs: K-02 (detail), K-05 (relationship), K-09 (upsert)."""
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError
from datetime import date, datetime
from fastapi import HTTPException

from app.modules.daily_execution.models import (
    DailyExecutionReport, DERManpower, DEREquipment, DERVendorActivity,
    DEREditRequest,
)
from app.modules.projects.models import ProjectSupervisor, ProjectVendor
from app.modules.projects.service import is_supervisor_assigned
from app.core.rbac import normalize_role
from app.modules.users.audit import log_action


def _role(user) -> str:
    return normalize_role(getattr(user, "role", ""))


def _is_admin(user) -> bool:
    return _role(user) in ("SUPERADMIN", "ADMIN")


def _can_view_all(user) -> bool:
    """Admins + read-only monitors see every report; writes stay admin-gated."""
    return _role(user) in ("SUPERADMIN", "ADMIN", "MONITOR")


def _check_project_access(db: Session, project_id: int, user) -> None:
    """Supervisors must be assigned; vendors have no DER access."""
    if _is_admin(user):
        return
    if _role(user) == "SUPERVISOR":
        if not is_supervisor_assigned(db, project_id, user.id):
            raise HTTPException(status_code=403,
                                detail="Not assigned to this project")
        return
    raise HTTPException(status_code=403, detail="Not permitted")


def _validate_refs(db: Session, project_id: int, vendor_id, machine_id,
                   work_order_id=None) -> None:
    from app.modules.machinery.models import Machine
    from app.modules.vendors.models import Vendor
    if vendor_id is not None:
        if not db.query(Vendor).filter(Vendor.id == vendor_id).first():
            raise HTTPException(status_code=404, detail="Vendor not found")
        # Vendor must belong to the project (legacy link or active assignment)
        legacy = db.query(ProjectVendor).filter(
            ProjectVendor.project_id == project_id,
            ProjectVendor.vendor_id == vendor_id).first()
        assigned = False
        try:
            from app.modules.procurement.models import ProjectVendorAssignment
            assigned = db.query(ProjectVendorAssignment).filter(
                ProjectVendorAssignment.project_id == project_id,
                ProjectVendorAssignment.vendor_id == vendor_id,
                ProjectVendorAssignment.status == "ACTIVE").first() is not None
        except ImportError:
            pass
        if not legacy and not assigned:
            raise HTTPException(status_code=422,
                                detail="Vendor is not assigned to this project")
    if machine_id is not None:
        if not db.query(Machine).filter(Machine.id == machine_id).first():
            raise HTTPException(status_code=404, detail="Machine not found")
    if work_order_id is not None:
        try:
            from app.modules.procurement.models import WorkOrder
            wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
            if not wo:
                raise HTTPException(status_code=404, detail="Work order not found")
            if wo.project_id != project_id or wo.vendor_id != vendor_id:
                raise HTTPException(status_code=422,
                                    detail="Work order does not match project/vendor")
        except ImportError:
            raise HTTPException(status_code=422, detail="Work orders unavailable")


# ================= CREATE (upsert per supervisor/project/day) =================
def create_report(db: Session, data, current_user):
    if _role(current_user) not in ("SUPERVISOR", "SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")

    payload = data.model_dump()
    _check_project_access(db, payload["project_id"], current_user)
    if payload.get("report_date") and payload["report_date"] > date.today():
        raise HTTPException(status_code=422, detail="report_date cannot be in the future")
    payload["created_by"] = current_user.id

    # Calculate total depth
    payload["total_depth"] = (
        payload.get("soil_depth", 0)
        + payload.get("soft_rock_depth", 0)
        + payload.get("hard_rock_depth", 0)
    )
    status = (payload.pop("status", None) or "SUBMITTED").upper()
    if status not in ("DRAFT", "SUBMITTED"):
        raise HTTPException(status_code=422, detail="status must be DRAFT or SUBMITTED")

    _validate_refs(db, payload["project_id"], payload.get("vendor_id"),
                   payload.get("machine_id"))

    # 🔥 One effective report per supervisor/project/day (DB UNIQUE backs this)
    existing = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.project_id == payload["project_id"],
        DailyExecutionReport.created_by == current_user.id,
        DailyExecutionReport.report_date == payload["report_date"]
    ).first()

    if existing:
        if _role(current_user) == "SUPERVISOR" and existing.status == "SUBMITTED":
            raise HTTPException(status_code=409,
                                detail="Report already submitted for this day")
        for key, value in payload.items():
            setattr(existing, key, value)
        existing.status = status
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        log_action(db, action="DER_UPDATED", actor_id=current_user.id,
                   target_type="der", target_id=existing.id, metadata={"upsert": True})
        db.commit()
        return existing

    report = DailyExecutionReport(**payload, status=status)
    if status == "SUBMITTED":
        report.submitted_at = datetime.utcnow()
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409,
                            detail="Report already exists for this day")
    db.refresh(report)
    log_action(db, action="DER_CREATED", actor_id=current_user.id,
               target_type="der", target_id=report.id,
               metadata={"project_id": report.project_id})
    db.commit()
    db.refresh(report)
    return report


# ================= GET BY ID (K-02 implemented with scoping) =================
def get_report_by_id(db: Session, report_id: int, current_user):
    report = db.query(DailyExecutionReport).options(
        joinedload(DailyExecutionReport.creator),
        joinedload(DailyExecutionReport.project),
        joinedload(DailyExecutionReport.vendor),
        joinedload(DailyExecutionReport.manpower),
        joinedload(DailyExecutionReport.equipment),
        joinedload(DailyExecutionReport.vendor_activity),
    ).filter(DailyExecutionReport.id == report_id).first()
    if not report:
        return None
    if _can_view_all(current_user):
        return report
    if _role(current_user) == "SUPERVISOR":
        if report.created_by != current_user.id and not is_supervisor_assigned(
                db, report.project_id, current_user.id):
            return None
        return report
    return None


# ================= GET REPORTS =================
def get_all_daily_reports(db: Session, current_user, page, limit,
                          project_id=None, report_date=None, vendor_id=None):
    from app.utils.pagination import paginate_query
    offset = (page - 1) * limit

    query = db.query(DailyExecutionReport).options(
        joinedload(DailyExecutionReport.creator),
        joinedload(DailyExecutionReport.project),
        joinedload(DailyExecutionReport.vendor),
    )

    if _role(current_user) == "SUPERVISOR":
        from app.modules.projects.models import ProjectAssignment
        query = query.filter(
            (DailyExecutionReport.created_by == current_user.id) |
            (DailyExecutionReport.project_id.in_(
                db.query(ProjectSupervisor.project_id).filter(
                    ProjectSupervisor.supervisor_id == current_user.id,
                    ProjectSupervisor.is_active == True).union(
                    db.query(ProjectAssignment.project_id).filter(
                        ProjectAssignment.user_id == current_user.id,
                        ProjectAssignment.status == "ACTIVE"))
            ))
        )
    elif not _can_view_all(current_user):
        raise HTTPException(status_code=403, detail="Not permitted")

    if project_id:
        if _role(current_user) == "SUPERVISOR":
            _check_project_access(db, project_id, current_user)
        query = query.filter(DailyExecutionReport.project_id == project_id)

    if report_date:
        query = query.filter(DailyExecutionReport.report_date == report_date)

    if vendor_id:
        query = query.filter(DailyExecutionReport.vendor_id == vendor_id)

    rows, total = paginate_query(
        query.order_by(
            desc(DailyExecutionReport.report_date),
            desc(DailyExecutionReport.id)
        ), page, limit)
    return rows, total


# ================= UPDATE =================
def update_report(db: Session, report_id: int, data, current_user):
    report = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.id == report_id
    ).first()

    if not report:
        return None

    if _role(current_user) == "SUPERVISOR":
        if report.created_by != current_user.id:
            return None
        if report.status == "SUBMITTED":
            raise HTTPException(status_code=409,
                                detail="Submitted reports can only be edited by admin")
    elif not _is_admin(current_user):
        return None

    update_data = data.model_dump(exclude_unset=True)
    update_data.pop("status", None)  # status changes go through submit()
    update_data.pop("report_date", None)
    update_data.pop("project_id", None)
    if "vendor_id" in update_data or "machine_id" in update_data:
        _validate_refs(db, report.project_id,
                       update_data.get("vendor_id", report.vendor_id),
                       update_data.get("machine_id", report.machine_id))

    for field, value in update_data.items():
        setattr(report, field, value)

    if any(k in update_data for k in ["soil_depth", "soft_rock_depth", "hard_rock_depth"]):
        report.total_depth = (
            (report.soil_depth or 0)
            + (report.soft_rock_depth or 0)
            + (report.hard_rock_depth or 0)
        )
    report.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(report)
    log_action(db, action="DER_UPDATED", actor_id=current_user.id,
               target_type="der", target_id=report.id, metadata={})
    db.commit()
    return report


def submit_report(db: Session, report_id: int, current_user):
    report = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if _role(current_user) == "SUPERVISOR" and report.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not permitted")
    if not _is_admin(current_user) and _role(current_user) != "SUPERVISOR":
        raise HTTPException(status_code=403, detail="Not permitted")
    if report.status == "SUBMITTED":
        raise HTTPException(status_code=409, detail="Already submitted")
    report.status = "SUBMITTED"
    report.submitted_at = datetime.utcnow()
    log_action(db, action="DER_SUBMITTED", actor_id=current_user.id,
               target_type="der", target_id=report.id, metadata={})
    db.commit()
    db.refresh(report)
    return report


# ================= DELETE =================
def delete_report(db: Session, report_id: int, current_user):
    report = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.id == report_id
    ).first()

    if not report:
        return False

    if _role(current_user) != "SUPERADMIN":
        return False

    db.delete(report)
    db.commit()
    return True


# ================= WORKING DAYS =================
def calculate_supervisor_working_days(db: Session, supervisor_id: int):
    return db.query(DailyExecutionReport.report_date).filter(
        DailyExecutionReport.created_by == supervisor_id
    ).distinct().count()


# ================= child rows =================

def _child_parent(db: Session, report_id: int, user):
    report = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if _is_admin(user):
        return report
    if _role(user) == "SUPERVISOR" and report.created_by == user.id \
            and report.status == "DRAFT":
        return report
    raise HTTPException(status_code=403, detail="Not permitted")


def add_manpower(db: Session, report_id: int, data, user):
    report = _child_parent(db, report_id, user)
    rec = DERManpower(report_id=report.id, **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def add_equipment(db: Session, report_id: int, data, user):
    from app.modules.machinery.models import Machine
    report = _child_parent(db, report_id, user)
    if data.machine_id and not db.query(Machine).filter(
            Machine.id == data.machine_id).first():
        raise HTTPException(status_code=404, detail="Machine not found")
    rec = DEREquipment(report_id=report.id, **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def add_vendor_activity(db: Session, report_id: int, data, user):
    report = _child_parent(db, report_id, user)
    _validate_refs(db, report.project_id, data.vendor_id, None,
                   data.work_order_id)
    rec = DERVendorActivity(report_id=report.id, **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


# ================= EDIT REQUESTS (supervisor asks, admin decides) =================

def _serialize_edit_request(db: Session, req: DEREditRequest) -> dict:
    from app.modules.users.models import User
    report = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.id == req.report_id).first()
    requester = db.query(User).filter(User.id == req.requested_by).first()
    return {
        "id": req.id,
        "report_id": req.report_id,
        "requested_by": req.requested_by,
        "requester_name": requester.full_name if requester else None,
        "message": req.message,
        "status": req.status,
        "reviewed_by": req.reviewed_by,
        "review_note": req.review_note,
        "created_at": req.created_at,
        "reviewed_at": req.reviewed_at,
        "report_date": report.report_date if report else None,
        "project_id": report.project_id if report else None,
        "project_name": report.project.name if report and report.project else None,
        "borehole_no": report.borehole_no if report else None,
        "report_status": report.status if report else None,
    }


def request_der_edit(db: Session, report_id: int, user, message: str) -> dict:
    """Supervisor asks admin to unlock one of their SUBMITTED reports."""
    report = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if _role(user) == "SUPERVISOR":
        if report.created_by != user.id:
            raise HTTPException(status_code=403, detail="Only your own reports")
        _check_project_access(db, report.project_id, user)
    elif not _is_admin(user):
        raise HTTPException(status_code=403, detail="Not permitted")
    if report.status != "SUBMITTED":
        raise HTTPException(status_code=422,
                            detail=f"Report is {report.status}; only submitted reports need approval")
    existing = db.query(DEREditRequest).filter(
        DEREditRequest.report_id == report_id,
        DEREditRequest.status == "PENDING").first()
    if existing:
        raise HTTPException(status_code=409, detail="A request is already pending for this report")
    req = DEREditRequest(report_id=report_id, requested_by=user.id,
                         message=(message or "").strip(), status="PENDING")
    db.add(req)
    db.commit()
    db.refresh(req)
    log_action(db, action="DER_EDIT_REQUESTED", actor_id=user.id,
               target_type="der", target_id=report_id,
               metadata={"request_id": req.id})
    db.commit()
    return _serialize_edit_request(db, req)


def list_edit_requests(db: Session, user, status: str | None = None,
                       report_id: int | None = None) -> list[dict]:
    query = db.query(DEREditRequest).order_by(DEREditRequest.id.desc())
    if _role(user) == "SUPERVISOR" and not _is_admin(user):
        query = query.filter(DEREditRequest.requested_by == user.id)
    elif not _is_admin(user):
        raise HTTPException(status_code=403, detail="Not permitted")
    if (status or "").strip():
        query = query.filter(DEREditRequest.status == status.strip().upper())
    if report_id is not None:
        query = query.filter(DEREditRequest.report_id == report_id)
    return [_serialize_edit_request(db, r) for r in query.limit(200).all()]


def review_der_edit(db: Session, request_id: int, user,
                    approve: bool, note: str | None = None) -> dict:
    """Admin approves (report flips back to DRAFT) or rejects (untouched)."""
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Not permitted")
    req = db.query(DEREditRequest).filter(
        DEREditRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=409,
                            detail=f"Request already {req.status}")
    now = datetime.utcnow()
    req.reviewed_by = user.id
    req.review_note = (note or "").strip() or None
    req.reviewed_at = now
    report = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.id == req.report_id).first()
    if approve:
        req.status = "APPROVED"
        if report and report.status == "SUBMITTED":
            report.status = "DRAFT"
            report.updated_at = now
        log_action(db, action="DER_EDIT_APPROVED", actor_id=user.id,
                   target_type="der", target_id=req.report_id,
                   metadata={"request_id": req.id})
    else:
        req.status = "REJECTED"
        log_action(db, action="DER_EDIT_REJECTED", actor_id=user.id,
                   target_type="der", target_id=req.report_id,
                   metadata={"request_id": req.id, "note": req.review_note or ""})
    db.commit()
    db.refresh(req)
    return _serialize_edit_request(db, req)
