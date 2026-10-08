"""Project expenditure service — scoped, approved, PATCH-correct."""
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.core.rbac import normalize_role
from app.modules.project_expenditures import models as m
from app.modules.projects.service import is_supervisor_assigned
from app.modules.users.audit import log_action


def _role(user) -> str:
    return normalize_role(getattr(user, "role", ""))


def _is_admin(user) -> bool:
    return _role(user) in ("SUPERADMIN", "ADMIN")


def _check_project_access(db: Session, project_id: int, user, *, write: bool = False) -> None:
    if _is_admin(user):
        return
    # Read-only monitors see every project ledger; all writes stay blocked.
    if _role(user) == "MONITOR" and not write:
        return
    if _role(user) == "SUPERVISOR":
        if not is_supervisor_assigned(db, project_id, user.id):
            raise HTTPException(status_code=403, detail="Not assigned to this project")
        return
    raise HTTPException(status_code=403, detail="Not permitted")


def _validate_links(db: Session, project_id: int, vendor_id, work_order_id) -> None:
    if vendor_id is not None:
        from app.modules.vendors.models import Vendor
        if not db.query(Vendor).filter(Vendor.id == vendor_id).first():
            raise HTTPException(status_code=404, detail="Vendor not found")
    if work_order_id is not None:
        try:
            from app.modules.procurement.models import WorkOrder
        except ImportError:
            raise HTTPException(status_code=422, detail="Work orders unavailable")
        wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
        if not wo:
            raise HTTPException(status_code=404, detail="Work order not found")
        if wo.project_id != project_id:
            raise HTTPException(status_code=422,
                                detail="Work order does not belong to this project")
        if vendor_id is not None and wo.vendor_id != vendor_id:
            raise HTTPException(status_code=422,
                                detail="Work order does not belong to this vendor")


def _serialize(db: Session, e: m.ProjectExpenditure) -> dict:
    d = {c.name: getattr(e, c.name) for c in e.__table__.columns}
    d["vendor_name"] = None
    if e.vendor_id:
        from app.modules.vendors.models import Vendor
        v = db.query(Vendor).filter(Vendor.id == e.vendor_id).first()
        d["vendor_name"] = (v.legal_business_name or v.vendor_company) if v else None
    return d


def create_expenditure(db: Session, data, user) -> dict:
    if _role(user) not in ("SUPERVISOR", "SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.projects.models import Project
    if not db.query(Project).filter(Project.id == data.project_id).first():
        raise HTTPException(status_code=404, detail="Project not found")
    _check_project_access(db, data.project_id, user, write=True)
    _validate_links(db, data.project_id, data.vendor_id, data.work_order_id)
    rec = m.ProjectExpenditure(
        **data.model_dump(), status="DRAFT", created_by=user.id,
        supervisor_id=user.id if _role(user) == "SUPERVISOR" else None)
    db.add(rec)
    log_action(db, action="EXPENDITURE_CREATED", actor_id=user.id,
               target_type="expenditure", target_id=rec.id,
               metadata={"project_id": data.project_id, "amount": data.amount})
    db.commit()
    db.refresh(rec)
    return _serialize(db, rec)


def update_expenditure(db: Session, exp_id: int, data, user) -> dict:
    rec = db.query(m.ProjectExpenditure).filter(m.ProjectExpenditure.id == exp_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Expenditure not found")
    _check_project_access(db, rec.project_id, user, write=True)
    if _role(user) == "SUPERVISOR":
        if rec.created_by != user.id:
            raise HTTPException(status_code=403, detail="Not permitted")
        if rec.status != "DRAFT":
            raise HTTPException(status_code=409,
                                detail="Only drafts can be edited by supervisors")
    payload = data.model_dump(exclude_unset=True)  # K-11: supplied fields only
    if "vendor_id" in payload or "work_order_id" in payload:
        _validate_links(db, rec.project_id,
                        payload.get("vendor_id", rec.vendor_id),
                        payload.get("work_order_id", rec.work_order_id))
    for k, v in payload.items():
        setattr(rec, k, v)
    log_action(db, action="EXPENDITURE_UPDATED", actor_id=user.id,
               target_type="expenditure", target_id=rec.id,
               metadata={"fields": sorted(payload.keys())})
    db.commit()
    db.refresh(rec)
    return _serialize(db, rec)


def submit_expenditure(db: Session, exp_id: int, user) -> dict:
    rec = db.query(m.ProjectExpenditure).filter(m.ProjectExpenditure.id == exp_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Expenditure not found")
    _check_project_access(db, rec.project_id, user, write=True)
    if _role(user) == "SUPERVISOR" and rec.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not permitted")
    if rec.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Expenditure is {rec.status}")
    rec.status = "SUBMITTED"
    log_action(db, action="EXPENDITURE_SUBMITTED", actor_id=user.id,
               target_type="expenditure", target_id=rec.id, metadata={})
    db.commit()
    db.refresh(rec)
    return _serialize(db, rec)


def review_expenditure(db: Session, exp_id: int, user, approve: bool,
                       reason: str = "") -> dict:
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Not permitted")
    rec = db.query(m.ProjectExpenditure).filter(m.ProjectExpenditure.id == exp_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Expenditure not found")
    if rec.status != "SUBMITTED":
        raise HTTPException(status_code=409, detail=f"Expenditure is {rec.status}")
    if approve and rec.created_by == user.id and _role(user) != "SUPERADMIN":
        raise HTTPException(status_code=403,
                            detail="Submitter cannot approve own expenditure")
    from datetime import datetime
    rec.status = "APPROVED" if approve else "REJECTED"
    rec.approved_by = user.id
    rec.approved_at = datetime.utcnow()
    if not approve:
        rec.rejection_reason = reason
    log_action(db, action="EXPENDITURE_APPROVED" if approve else "EXPENDITURE_REJECTED",
               actor_id=user.id, target_type="expenditure", target_id=rec.id,
               metadata={"reason": reason})
    db.commit()
    db.refresh(rec)
    return _serialize(db, rec)


def list_expenditures(db: Session, user, project_id: int | None = None,
                      status: str | None = None, q: str | None = None,
                      category: str | None = None,
                      page: int = 1, limit: int = 20) -> tuple[list[dict], int]:
    from app.utils.pagination import paginate_query
    query = db.query(m.ProjectExpenditure)
    if project_id:
        _check_project_access(db, project_id, user)
        query = query.filter(m.ProjectExpenditure.project_id == project_id)
    elif _role(user) == "SUPERVISOR":
        from app.modules.projects.service import get_projects_for_supervisor
        pids = [p.id for p in get_projects_for_supervisor(db, user.id)]
        query = query.filter(m.ProjectExpenditure.project_id.in_(pids)) if pids \
            else query.filter(False)
    elif _role(user) == "MONITOR":
        pass  # read-only oversight sees every project
    elif not _is_admin(user):
        raise HTTPException(status_code=403, detail="Not permitted")
    if status:
        query = query.filter(m.ProjectExpenditure.status == status)
    if category:
        query = query.filter(m.ProjectExpenditure.expense_category == category)
    if (q or "").strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            m.ProjectExpenditure.description.ilike(like) |
            m.ProjectExpenditure.expense_category.ilike(like) |
            m.ProjectExpenditure.reference_number.ilike(like) |
            m.ProjectExpenditure.payment_method.ilike(like))
    rows, total = paginate_query(
        query.order_by(m.ProjectExpenditure.id.desc()), page, limit)
    return [_serialize(db, r) for r in rows], total


def project_totals(db: Session, project_id: int, user) -> dict:
    _check_project_access(db, project_id, user)
    rows = db.query(m.ProjectExpenditure).filter(
        m.ProjectExpenditure.project_id == project_id).all()
    by_status: dict[str, float] = {}
    by_category: dict[str, float] = {}
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + (r.amount or 0)
        by_category[r.expense_category] = by_category.get(r.expense_category, 0) + (r.amount or 0)
    return {"project_id": project_id, "count": len(rows),
            "approved_total": by_status.get("APPROVED", 0),
            "by_status": by_status, "by_category": by_category}


def delete_expenditure(db: Session, exp_id: int, user) -> dict:
    """Hard-delete an expenditure (admin-only, audited).

    APPROVED rows are financial records: only SUPERADMIN may remove them
    (e.g. mistaken entry); ADMIN may delete DRAFT / SUBMITTED / REJECTED.
    """
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Not permitted")
    rec = db.query(m.ProjectExpenditure).filter(
        m.ProjectExpenditure.id == exp_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Expenditure not found")
    if rec.status == "APPROVED" and _role(user) != "SUPERADMIN":
        raise HTTPException(
            status_code=409,
            detail="Approved expenditures cannot be deleted by ADMIN "
                   "(reject/remove approval first or ask a SUPERADMIN)")
    snapshot = {"project_id": rec.project_id, "status": rec.status,
                "amount": rec.amount, "category": rec.expense_category}
    log_action(db, action="EXPENDITURE_DELETED", actor_id=user.id,
               target_type="expenditure", target_id=rec.id,
               metadata=snapshot)
    db.delete(rec)
    db.commit()
    return {"deleted": exp_id, **snapshot}
