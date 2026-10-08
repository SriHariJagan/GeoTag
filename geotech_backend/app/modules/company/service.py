"""Company settings service — singleton get/update + logo + numbering."""
from __future__ import annotations

import os
import uuid
from datetime import datetime
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.modules.company import models as m
from app.modules.users.audit import log_action

LOGO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(__file__)))), "storage", "company")
ALLOWED_LOGO = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg"}
MAX_LOGO_BYTES = 5 * 1024 * 1024

DEFAULTS = {
    "company_name": "GeoTech Engineering Pvt Ltd",
    "tagline": "Geotechnical Investigation & Field Engineering",
    "address_line1": "Plot 12, Industrial Estate",
    "city": "Hyderabad",
    "state": "Telangana",
    "pin": "500001",
    "phone": "+91-40-0000-0000",
    "email": "projects@geotech.example.com",
    "website": "www.geotech.example.com",
    "wo_number_prefix": "GEOTECH/WO",
    "wo_number_format": "{prefix}/{project}/{seq:02d}",
    "footer_head_office": "Head Office: Plot 12, Industrial Estate, Hyderabad 500001",
}


def get_settings(db: Session) -> m.CompanySettings:
    rec = db.query(m.CompanySettings).filter(m.CompanySettings.id == 1).first()
    if rec:
        return rec
    rec = m.CompanySettings(id=1, **DEFAULTS)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def serialize(rec: m.CompanySettings) -> dict:
    d = {c.name: getattr(rec, c.name) for c in rec.__table__.columns}
    d["logo_url"] = f"/company-settings/logo?ts={int(datetime.utcnow().timestamp())}" \
        if rec.logo_path else None
    return d


def update_settings(db: Session, data, user) -> dict:
    from app.modules.procurement.service import _is_admin
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only admin can update company settings")
    rec = get_settings(db)
    payload = data.model_dump(exclude_unset=True)
    if "wo_number_format" in payload and payload["wo_number_format"]:
        _validate_number_format(payload["wo_number_format"])
    for k, v in payload.items():
        if hasattr(rec, k):
            setattr(rec, k, v)
    rec.updated_by = user.id
    log_action(db, action="COMPANY_SETTINGS_UPDATED", actor_id=user.id,
               target_type="company_settings", target_id=1,
               metadata={"fields": sorted(payload.keys())})
    db.commit()
    db.refresh(rec)
    return serialize(rec)


def _validate_number_format(fmt: str) -> None:
    try:
        out = fmt.format(prefix="P", project="PRJ", yy="26", yyyy="2026", seq=1)
    except (KeyError, ValueError, IndexError) as e:
        raise HTTPException(status_code=422,
                            detail=f"Invalid number format: {e}. "
                            "Tokens: {prefix} {project} {yy} {yyyy} {seq} (supports :02d padding)")
    if "{seq" not in fmt:
        raise HTTPException(status_code=422,
                            detail="Number format must contain a {seq} token")
    if len(out) > 80:
        raise HTTPException(status_code=422, detail="Number format renders too long")


def build_wo_number(db: Session, project_id: int) -> str:
    """Next WO number from company settings (uniqueness still enforced at create)."""
    from app.modules.projects.models import Project
    from app.modules.procurement import models as pm
    settings = get_settings(db)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    now = datetime.utcnow()
    seq = db.query(pm.WorkOrder).filter(
        pm.WorkOrder.project_id == project_id).count() + 1
    number = settings.wo_number_format.format(
        prefix=settings.wo_number_prefix, project=project.project_code,
        yy=now.strftime("%y"), yyyy=now.strftime("%Y"), seq=seq)
    while db.query(pm.WorkOrder).filter(
            pm.WorkOrder.work_order_number == number).first():
        seq += 1
        number = settings.wo_number_format.format(
            prefix=settings.wo_number_prefix, project=project.project_code,
            yy=now.strftime("%y"), yyyy=now.strftime("%Y"), seq=seq)
    return number


def upload_logo(db: Session, file: UploadFile, user) -> dict:
    from app.modules.procurement.service import _is_admin
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only admin can upload the logo")
    ext = ALLOWED_LOGO.get((file.content_type or "").lower())
    if not ext:
        raise HTTPException(status_code=415,
                            detail="Logo must be PNG or JPG/JPEG")
    data = file.file.read()
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="Logo exceeds 5 MB")
    if len(data) == 0:
        raise HTTPException(status_code=422, detail="Empty file")
    try:
        from PIL import Image as _PILImage
        import io as _io
        with _PILImage.open(_io.BytesIO(data)) as _img:
            _img.verify()
    except Exception:
        raise HTTPException(status_code=422, detail="Unreadable image file")
    os.makedirs(LOGO_DIR, exist_ok=True)
    fname = f"logo_{uuid.uuid4().hex}{ext}"
    with open(os.path.join(LOGO_DIR, fname), "wb") as f:
        f.write(data)
    rec = get_settings(db)
    old = rec.logo_path
    rec.logo_path = os.path.join("storage", "company", fname)
    rec.updated_by = user.id
    log_action(db, action="COMPANY_LOGO_UPLOADED", actor_id=user.id,
               target_type="company_settings", target_id=1, metadata={"file": fname})
    db.commit()
    if old:
        try:
            os.remove(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
                os.path.dirname(__file__)))), old))
        except OSError:
            pass
    db.refresh(rec)
    return serialize(rec)


def logo_abs_path(db: Session) -> str | None:
    rec = get_settings(db)
    if not rec.logo_path:
        return None
    base = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.dirname(__file__))))
    p = os.path.join(base, rec.logo_path)
    return p if os.path.exists(p) else None
