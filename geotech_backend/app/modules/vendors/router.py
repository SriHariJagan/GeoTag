"""Vendors router — V3. Legacy CRUD preserved; reads now require auth (K-03)."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.rate_limit import invite_limiter
from app.utils.dependencies import (
    require_superadmin, get_current_user, require_roles, require_permission,
)
from app.core.rbac import normalize_role
from . import schemas, service
from . import models as vendor_models

router = APIRouter(prefix="/vendors", tags=["Vendors"])

ADMIN_ROLES = ("SUPERADMIN", "ADMIN")
_admin_write = require_roles(*ADMIN_ROLES)


def _vendor_scope(db: Session, current_user) -> Optional[list[int]]:
    """Vendor users see only their orgs; supervisors only vendors of their
    projects; admins see all (None)."""
    role = normalize_role(current_user.role)
    if role == "VENDOR":
        return service.vendor_org_ids_for_user(db, current_user.id)
    if role == "SUPERVISOR":
        from app.modules.projects import models as pm
        from app.modules.projects.service import get_projects_for_supervisor
        pids = [p.id for p in get_projects_for_supervisor(db, current_user.id)]
        if not pids:
            return []
        rows = db.query(pm.ProjectVendor.vendor_id).filter(
            pm.ProjectVendor.project_id.in_(pids)).all()
        vids = {r[0] for r in rows}
        try:
            from app.modules.procurement import models as procm
            rows2 = db.query(procm.ProjectVendorAssignment.vendor_id).filter(
                procm.ProjectVendorAssignment.project_id.in_(pids),
                procm.ProjectVendorAssignment.status == "ACTIVE").all()
            vids |= {r[0] for r in rows2}
        except ImportError:
            pass
        return sorted(vids)
    return None


# ---------------- CREATE ----------------
@router.post("/", response_model=schemas.VendorResponse,
             dependencies=[Depends(_admin_write)])
def create_vendor(data: schemas.VendorCreate, db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    return service.create_vendor(db, data, actor_id=current_user.id)


@router.get("/me/organizations")
def my_organizations(db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    """Vendor org IDs linked to the current user (portal scoping helper)."""
    return {"vendor_ids": service.vendor_org_ids_for_user(db, current_user.id)}


# ---------------- GET ALL (auth-gated; vendors scoped to own orgs) ----------------
@router.get("/", response_model=List[schemas.VendorResponse])
def list_vendors(status: Optional[str] = None, category: Optional[str] = None,
                 search: Optional[str] = None,
                 limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                 page: Optional[int] = Query(None, ge=1),
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user),
                 response: Response = None):
    from app.utils.pagination import set_total as _set_total
    org_ids = _vendor_scope(db, current_user)
    if org_ids is not None:
        rows = [service.get_vendor_by_id(db, vid) for vid in org_ids]
        rows = [r for r in rows if r]
        if response is not None:
            _set_total(response, len(rows))
        return rows
    rows, total = service.get_vendors(db, status=status, category=category,
                                      search=search, limit=limit, offset=offset,
                                      page=page)
    if response is not None:
        _set_total(response, total)
    return rows


# ---------------- GET BY ID ----------------
@router.get("/{vendor_id}", response_model=schemas.VendorResponse)
def get_vendor(vendor_id: int, db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    org_ids = _vendor_scope(db, current_user)
    if org_ids is not None and vendor_id not in org_ids:
        raise HTTPException(status_code=403, detail="Not permitted for this vendor")
    vendor = service.get_vendor_by_id(db, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    if normalize_role(current_user.role) == "VENDOR":
        # Strip internal evaluation-side fields from vendor portal reads
        vendor.pop("rating", None)
    return vendor


# ---------------- UPDATE ----------------
@router.put("/{vendor_id}", response_model=schemas.VendorResponse,
            dependencies=[Depends(_admin_write)])
def update_vendor(vendor_id: int, data: schemas.VendorUpdate,
                  db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    vendor = service.update_vendor(db, vendor_id, data, actor_id=current_user.id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


@router.patch("/{vendor_id}/status", response_model=schemas.VendorResponse,
              dependencies=[Depends(_admin_write)])
def vendor_status(vendor_id: int, data: schemas.VendorStatusChange,
                  db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    return service.change_vendor_status(db, vendor_id, data.status,
                                        actor_id=current_user.id, reason=data.reason)


# ---------------- DELETE (SUPERADMIN only) ----------------
@router.delete("/{vendor_id}", dependencies=[Depends(require_superadmin)])
def delete_vendor(vendor_id: int, db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    vendor = service.delete_vendor(db, vendor_id, actor_id=current_user.id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return {"message": "Vendor deleted successfully"}


# ---------------- child resources (generic helper) ----------------

def _child_router(model, create_schema, response_schema, prefix: str, field: str):
    """Build list/create/delete endpoints for a vendor child table."""
    from fastapi import APIRouter as _APIRouter
    sub = _APIRouter()

    @sub.get("/{vendor_id}/" + prefix, response_model=list[response_schema])
    def _list(vendor_id: int, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
        org_ids = _vendor_scope(db, current_user)
        if org_ids is not None and vendor_id not in org_ids:
            raise HTTPException(status_code=403, detail="Not permitted for this vendor")
        if not db.query(vendor_models.Vendor).filter(
                vendor_models.Vendor.id == vendor_id).first():
            raise HTTPException(status_code=404, detail="Vendor not found")
        return db.query(model).filter(model.vendor_id == vendor_id).all()

    @sub.post("/{vendor_id}/" + prefix, response_model=response_schema, status_code=201,
              dependencies=[Depends(_admin_write)])
    def _create(vendor_id: int, data: create_schema, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
        from app.modules.users.audit import log_action
        if not db.query(vendor_models.Vendor).filter(
                vendor_models.Vendor.id == vendor_id).first():
            raise HTTPException(status_code=404, detail="Vendor not found")
        rec = model(vendor_id=vendor_id, **data.model_dump())
        db.add(rec)
        db.commit()
        db.refresh(rec)
        log_action(db, action="VENDOR_UPDATED", actor_id=current_user.id,
                   target_type="vendor", target_id=vendor_id,
                   metadata={"section": field, "op": "create"})
        db.commit()
        return rec

    @sub.delete("/{vendor_id}/" + prefix + "/{rec_id}",
                dependencies=[Depends(_admin_write)])
    def _delete(vendor_id: int, rec_id: int, db: Session = Depends(get_db)):
        rec = db.query(model).filter(model.id == rec_id,
                                     model.vendor_id == vendor_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Record not found")
        db.delete(rec)
        db.commit()
        return {"message": "Deleted"}
    return sub


for _model, _schema, _resp, _prefix, _field in [
    (vendor_models.VendorContact, schemas.VendorContactCreate, schemas.VendorContactResponse, "contacts", "contact"),
    (vendor_models.VendorExperience, schemas.VendorExperienceCreate, schemas.VendorExperienceResponse, "experiences", "experience"),
    (vendor_models.VendorReference, schemas.VendorReferenceCreate, schemas.VendorReferenceResponse, "references", "reference"),
    (vendor_models.VendorCapability, schemas.VendorCapabilityCreate, schemas.VendorCapabilityResponse, "capabilities", "capability"),
    (vendor_models.VendorEquipment, schemas.VendorEquipmentCreate, schemas.VendorEquipmentResponse, "equipment", "equipment"),
    (vendor_models.VendorCertification, schemas.VendorCertificationCreate, schemas.VendorCertificationResponse, "certifications", "certification"),
    (vendor_models.VendorLicense, schemas.VendorLicenseCreate, schemas.VendorLicenseResponse, "licenses", "license"),
    (vendor_models.VendorDocument, schemas.VendorDocumentCreate, schemas.VendorDocumentResponse, "documents", "document"),
]:
    router.include_router(_child_router(_model, _schema, _resp, _prefix, _field))


@router.get("/{vendor_id}/audit")
def vendor_audit(vendor_id: int, db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    from app.modules.users import models as user_models
    if normalize_role(current_user.role) not in (*ADMIN_ROLES, "MONITOR"):
        raise HTTPException(status_code=403, detail="Not permitted")
    return db.query(user_models.AuditLog).filter(
        user_models.AuditLog.target_type == "vendor",
        user_models.AuditLog.target_id == vendor_id,
    ).order_by(user_models.AuditLog.timestamp.desc()).limit(100).all()


@router.post("/{vendor_id}/users", dependencies=[Depends(_admin_write)])
def link_vendor_user(vendor_id: int, data: schemas.VendorUserLink,
                     db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    """Link an existing ACTIVE user to a vendor org (portal access)."""
    from app.modules.users import models as user_models
    from app.modules.users.audit import log_action
    vendor = db.query(vendor_models.Vendor).filter(
        vendor_models.Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    user = db.query(user_models.User).filter(
        user_models.User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if (user.account_status or "") != "ACTIVE" or not user.is_active:
        raise HTTPException(status_code=400, detail="Only ACTIVE users can be linked")
    if db.query(vendor_models.VendorUser).filter(
            vendor_models.VendorUser.vendor_id == vendor_id,
            vendor_models.VendorUser.user_id == data.user_id).first():
        raise HTTPException(status_code=409, detail="User already linked to vendor")
    link = vendor_models.VendorUser(vendor_id=vendor_id, **data.model_dump())
    db.add(link)
    log_action(db, action="VENDOR_USER_LINKED", actor_id=current_user.id,
               target_type="vendor", target_id=vendor_id,
               metadata={"user_id": data.user_id})
    db.commit()
    db.refresh(link)
    return link


@router.get("/{vendor_id}/users")
def list_vendor_users(vendor_id: int, db: Session = Depends(get_db),
                      current_user=Depends(get_current_user)):
    org_ids = _vendor_scope(db, current_user)
    if org_ids is not None and vendor_id not in org_ids:
        raise HTTPException(status_code=403, detail="Not permitted for this vendor")
    return db.query(vendor_models.VendorUser).filter(
        vendor_models.VendorUser.vendor_id == vendor_id).all()
