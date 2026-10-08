from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from datetime import datetime
from app.modules.projects.models import ProjectVendor
from app.modules.users.audit import log_action
from . import models, schemas


def _compliance_overdue(vendor) -> bool:
    today = datetime.utcnow().date()
    for c in list(vendor.certifications or []) + list(vendor.licenses or []):
        if c.expiry_date and c.expiry_date < today:
            return True
    return False


def _to_response(vendor) -> dict:
    project_names = [link.project.name for link in (vendor.projects or []) if link.project]
    data = {c.name: getattr(vendor, c.name) for c in vendor.__table__.columns}
    data["project_names"] = project_names
    data["compliance_overdue"] = _compliance_overdue(vendor)
    return data


# ---------------- CREATE ----------------
def _next_vendor_code(db: Session) -> str:
    """Auto Vendor ID: VN-000001, VN-000002, ... (unique, gap-tolerant)."""
    n = db.query(models.Vendor).count() + 1
    code = f"VN-{n:06d}"
    while db.query(models.Vendor).filter(models.Vendor.vendor_code == code).first():
        n += 1
        code = f"VN-{n:06d}"
    return code


def create_vendor(db: Session, data: schemas.VendorCreate, actor_id: int | None = None):
    if data.vendor_code and db.query(models.Vendor).filter(
            models.Vendor.vendor_code == data.vendor_code).first():
        raise HTTPException(status_code=409, detail="Vendor code already registered")
    if not data.vendor_code:
        data = data.model_copy(update={"vendor_code": _next_vendor_code(db)})
    payload = data.model_dump()
    # Backfill: legal name defaults to legacy company field
    if not payload.get("legal_business_name") and payload.get("vendor_company"):
        payload["legal_business_name"] = payload["vendor_company"]
    vendor = models.Vendor(**payload)
    db.add(vendor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Vendor already exists")
    db.refresh(vendor)
    log_action(db, action="VENDOR_CREATED", actor_id=actor_id, target_type="vendor",
               target_id=vendor.id, metadata={"name": vendor.legal_business_name or vendor.vendor_company})
    db.commit()
    db.refresh(vendor)
    return _to_response(vendor)


# ---------------- GET ALL ----------------
def get_vendors(db, status: str | None = None, category: str | None = None,
                search: str | None = None, limit: int = 100, offset: int = 0,
                page: int | None = None):
    from app.utils.pagination import paginate_query
    query = db.query(models.Vendor).options(
        joinedload(models.Vendor.projects)
        .joinedload(ProjectVendor.project),
        joinedload(models.Vendor.certifications),
        joinedload(models.Vendor.licenses),
    )
    if status:
        query = query.filter(models.Vendor.status == status)
    if search:
        like = f"%{search}%"
        query = query.filter(
            (models.Vendor.legal_business_name.ilike(like)) |
            (models.Vendor.vendor_company.ilike(like)) |
            (models.Vendor.vendor_code.ilike(like))
        )
    if category:
        query = query.filter(models.Vendor.service_categories.ilike(f"%{category}%"))
    query = query.order_by(models.Vendor.id.desc())
    if page is not None:
        vendors, total = paginate_query(query, page, limit)
    else:
        total = query.order_by(None).count()
        vendors = query.offset(offset).limit(limit).all()
    return [_to_response(vendor) for vendor in vendors], total

# ---------------- GET BY ID ----------------
def get_vendor_by_id(db, vendor_id):
    vendor = db.query(models.Vendor).options(
        joinedload(models.Vendor.projects)
        .joinedload(ProjectVendor.project),
        joinedload(models.Vendor.certifications),
        joinedload(models.Vendor.licenses),
    ).filter(models.Vendor.id == vendor_id).first()

    if not vendor:
        return None

    return _to_response(vendor)




# ---------------- UPDATE ----------------
def update_vendor(db: Session, vendor_id: int, data: schemas.VendorUpdate,
                  actor_id: int | None = None):
    vendor = db.query(models.Vendor).filter(
        models.Vendor.id == vendor_id
    ).first()

    if not vendor:
        return None

    payload = data.model_dump(exclude_unset=True)
    if "vendor_code" in payload and payload["vendor_code"] != vendor.vendor_code:
        if db.query(models.Vendor).filter(
                models.Vendor.vendor_code == payload["vendor_code"]).first():
            raise HTTPException(status_code=409, detail="Vendor code already registered")

    for key, value in payload.items():
        setattr(vendor, key, value)

    db.commit()
    db.refresh(vendor)

    log_action(db, action="VENDOR_UPDATED", actor_id=actor_id, target_type="vendor",
               target_id=vendor.id, metadata={"fields": sorted(payload.keys())})
    db.commit()
    db.refresh(vendor)
    return _to_response(vendor)


def change_vendor_status(db: Session, vendor_id: int, status: str,
                         actor_id: int | None = None, reason: str | None = None):
    from app.core.rbac import VALID_VENDOR_STATUSES
    if status not in VALID_VENDOR_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid vendor status")
    vendor = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    vendor.status = status
    vendor.status_changed_at = datetime.utcnow()
    log_action(db, action="VENDOR_STATUS_CHANGED", actor_id=actor_id, target_type="vendor",
               target_id=vendor.id, metadata={"status": status, "reason": reason or ""})
    db.commit()
    db.refresh(vendor)
    return _to_response(vendor)


# ---------------- DELETE ----------------
def delete_vendor(db: Session, vendor_id: int, actor_id: int | None = None):
    vendor = db.query(models.Vendor).filter(
        models.Vendor.id == vendor_id
    ).first()

    if not vendor:
        return None

    blocker = _active_reference(db, vendor_id)
    if blocker:
        raise HTTPException(status_code=409, detail=f"Cannot delete vendor: {blocker}")

    log_action(db, action="VENDOR_DELETED", actor_id=actor_id, target_type="vendor",
               target_id=vendor.id, metadata={"name": vendor.legal_business_name or vendor.vendor_company})
    db.delete(vendor)
    db.commit()
    return vendor


def _active_reference(db: Session, vendor_id: int) -> str | None:
    """Any live procurement/execution reference blocks deletion (history preserved)."""
    if db.query(ProjectVendor).filter(ProjectVendor.vendor_id == vendor_id).first():
        return "linked to a project"
    try:
        from app.modules.procurement import models as pm
        if db.query(pm.RFQVendor).filter(pm.RFQVendor.vendor_id == vendor_id).first():
            return "invited to an RFQ"
        if db.query(pm.Quotation).filter(
                pm.Quotation.vendor_id == vendor_id,
                pm.Quotation.status.in_(["DRAFT", "SUBMITTED", "EVALUATED"])).first():
            return "has an open quotation"
        if db.query(pm.WorkOrder).filter(
                pm.WorkOrder.vendor_id == vendor_id,
                pm.WorkOrder.status.notin_(["CLOSED", "CANCELLED", "REJECTED"])).first():
            return "has an open work order"
        if db.query(pm.ProjectVendorAssignment).filter(
                pm.ProjectVendorAssignment.vendor_id == vendor_id,
                pm.ProjectVendorAssignment.status == "ACTIVE").first():
            return "actively assigned to a project"
    except ImportError:
        pass
    return None


def vendor_org_ids_for_user(db: Session, user_id: int) -> list[int]:
    return [r.vendor_id for r in db.query(models.VendorUser).filter(
        models.VendorUser.user_id == user_id).all()]