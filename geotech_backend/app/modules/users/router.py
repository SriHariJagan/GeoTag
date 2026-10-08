"""Users router — User Management V2.

Legacy endpoints preserved (`POST /users/`, `PUT /users/{id}`, `GET /users/`,
`GET /users/admin`, `POST /users/invite`, `POST /users/accept-invite`,
`POST /users/login`, `DELETE /users/{id}`) plus professional-profile,
invitation-lifecycle, role/status, eligibility, assignment, and audit endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request, Response
from sqlalchemy.orm import Session
from datetime import date

from app.core.database import get_db
from app.core.rate_limit import login_limiter, invite_limiter
from app.modules.users import schemas, service
from app.modules.users.schemas import LoginRequest, TokenResponse
from app.modules.users import invitations as inv_mod
from app.utils.dependencies import require_superadmin, get_current_user, require_roles
from app.utils.pagination import page_param, limit_param

router = APIRouter(prefix="/users", tags=["Users"])

ADMIN_ROLES = ("SUPERADMIN", "ADMIN")
_admin_only = require_roles(*ADMIN_ROLES)
# Read-only oversight views (user directory, profiles, audit trails).
_admin_view = require_roles("SUPERADMIN", "ADMIN", "MONITOR")


def _rate_check(limiter, key: str):
    from app.core.config import settings
    if settings.ENV == "test":
        return  # automated suites bypass rate limits (production/dev enforce)
    allowed, retry = limiter.check(key)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Retry in {retry}s",
        )


# ---------- legacy CRUD (kept) ----------

@router.post("/", response_model=schemas.UserResponse,
             dependencies=[Depends(require_superadmin)])
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.create_user(db, user, actor_id=current_user.id)


@router.put("/{user_id}", response_model=schemas.UserResponse)
def update_user_api(user_id: int, data: schemas.UserUpdate,
                    db: Session = Depends(get_db),
                    current_user=Depends(get_current_user)):
    from app.core.rbac import normalize_role
    is_super = normalize_role(current_user.role) == "SUPERADMIN"
    is_self = current_user.id == user_id
    if not (is_super or is_self):
        raise HTTPException(status_code=403, detail="Not permitted")
    if is_self and not is_super:
        # Own profile only — role/status stay admin-controlled.
        data = data.model_copy(update={"role": None, "account_status": None,
                                       "is_active": None})
    return service.update_user(db, user_id, data, actor_id=current_user.id)


@router.get("/", response_model=list[schemas.UserResponse],
            dependencies=[Depends(require_superadmin)])
def list_users(db: Session = Depends(get_db)):
    return service.get_users(db)


@router.get("/admin", response_model=list[schemas.UserAdminView],
            dependencies=[Depends(_admin_view)])
def list_users_admin(q: str | None = None,
                     page: int = page_param(), limit: int = limit_param(),
                     db: Session = Depends(get_db),
                     response: Response = None):
    from app.utils.pagination import set_total as _set_total
    rows, total = service.get_users_admin_view(db, q=q, page=page, limit=limit)
    if response is not None:
        _set_total(response, total)
    return rows


# NOTE: registered before /{user_id} so "audit-log" is not parsed as an id.
@router.get("/audit-log", response_model=list[schemas.AuditLogEntry])
def list_audit_log(actor_id: int | None = None,
                   action: str | None = None,
                   target_type: str | None = None,
                   start_date: str | None = None,
                   end_date: str | None = None,
                   page: int = page_param(), limit: int = limit_param(),
                   db: Session = Depends(get_db),
                   current_user=Depends(get_current_user),
                   response: Response = None):
    """Global operation log with filters — oversight console."""
    from app.core.rbac import normalize_role
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN", "MONITOR"):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    from app.utils.pagination import paginate_query, set_total as _set_total
    from datetime import datetime as _dt

    def _parse_day(v: str | None, *, end: bool = False):
        if not v or not str(v).strip():
            return None
        s = str(v).strip()
        try:
            # Accept "YYYY-MM-DD" or full ISO datetime.
            if len(s) == 10:
                d = _dt.strptime(s, "%Y-%m-%d")
                if end:
                    d = d.replace(hour=23, minute=59, second=59, microsecond=999999)
                else:
                    d = d.replace(hour=0, minute=0, second=0, microsecond=0)
                return d
            parsed = _dt.fromisoformat(s.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                parsed = parsed.replace(tzinfo=None)
            return parsed
        except Exception:
            return None

    query = db.query(models.AuditLog)
    if actor_id is not None:
        query = query.filter(models.AuditLog.actor_id == actor_id)
    if (action or "").strip():
        query = query.filter(models.AuditLog.action.ilike(f"%{action.strip()}%"))
    if (target_type or "").strip():
        query = query.filter(models.AuditLog.target_type == target_type.strip().lower())
    _start = _parse_day(start_date, end=False)
    if _start is not None:
        query = query.filter(models.AuditLog.timestamp >= _start)
    _end = _parse_day(end_date, end=True)
    if _end is not None:
        query = query.filter(models.AuditLog.timestamp <= _end)
    rows, total = paginate_query(
        query.order_by(models.AuditLog.timestamp.desc(),
                       models.AuditLog.id.desc()), page, limit)
    if response is not None:
        _set_total(response, total)
    users = {u.id: u for u in db.query(models.User).filter(
        models.User.id.in_({r.actor_id for r in rows if r.actor_id})).all()} \
        if rows else {}
    out = []
    for r in rows:
        u = users.get(r.actor_id) if r.actor_id else None
        out.append({
            "id": r.id, "actor_id": r.actor_id, "action": r.action,
            "target_type": r.target_type, "target_id": r.target_id,
            "timestamp": r.timestamp, "meta_info": r.meta_info,
            "actor_email": u.email if u else None,
            "actor_name": u.full_name if u else None,
        })
    return out


# ---------- invitations ----------

@router.post("/invite", dependencies=[Depends(_admin_only)])
def invite_user(invite: schemas.InviteUserRequest, request: Request,
                background: BackgroundTasks, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    _rate_check(invite_limiter, f"invite:{current_user.id}")
    return service.invite_user(db, invite, actor_id=current_user.id, background=background)


@router.post("/{user_id}/invite", dependencies=[Depends(_admin_only)])
def invite_existing_user(user_id: int, background: BackgroundTasks,
                         db: Session = Depends(get_db),
                         current_user=Depends(get_current_user)):
    from app.modules.users import models
    _rate_check(invite_limiter, f"invite:{current_user.id}")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.account_status == "ACTIVE" or user.is_active:
        raise HTTPException(status_code=400, detail="User already active")
    inv_mod.send_invitation(db, user, created_by=current_user.id, background=background)
    return {"message": "Invitation sent successfully"}


@router.post("/{user_id}/resend-invite", dependencies=[Depends(_admin_only)])
def resend_invite(user_id: int, background: BackgroundTasks,
                  db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    from app.modules.users import models
    from app.modules.users.audit import log_action
    _rate_check(invite_limiter, f"invite:{current_user.id}")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.account_status == "ACTIVE" or user.invite_accepted_at:
        raise HTTPException(status_code=400, detail="User already accepted invite")
    token, inv = inv_mod.send_invitation(db, user, created_by=current_user.id, background=background)
    inv.resend_count = (inv.resend_count or 0)
    db.commit()
    log_action(db, action="INVITATION_RESENT", actor_id=current_user.id,
               target_type="user", target_id=user.id, metadata={"email": user.email})
    db.commit()
    return {"message": "Invitation resent successfully"}


@router.post("/{user_id}/revoke-invite", dependencies=[Depends(_admin_only)])
def revoke_invite(user_id: int, db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    from datetime import datetime
    from app.modules.users import models
    from app.modules.users.audit import log_action
    inv = inv_mod._active_invitation(db, user_id)
    if not inv:
        raise HTTPException(status_code=404, detail="No pending invitation")
    inv.status = "REVOKED"
    inv.revoked_at = datetime.utcnow()
    log_action(db, action="INVITATION_REVOKED", actor_id=current_user.id,
               target_type="user", target_id=user_id, metadata={})
    db.commit()
    return {"message": "Invitation revoked"}


@router.get("/invitations/validate")
def validate_invitation(token: str, db: Session = Depends(get_db)):
    """Public pre-validation before showing the password form."""
    return inv_mod.validate_invitation(db, token)


@router.post("/invitations/accept")
def accept_invitation_new(data: schemas.AcceptInviteRequest,
                          db: Session = Depends(get_db)):
    _rate_check(login_limiter, "accept-invite")
    inv_mod.accept_invitation(db, data.token, data.password)
    return {"message": "Account activated successfully"}


@router.post("/accept-invite")
def accept_invite(data: schemas.AcceptInviteRequest, db: Session = Depends(get_db)):
    user = service.accept_invite(db, data.token, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid or expired invite")
    return {"message": "Account activated successfully"}


# ---------- login (fixed: status enforcement + 401 vs 403) ----------

@router.post("/login", response_model=TokenResponse)
def login_user_api(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    _rate_check(login_limiter, f"login:{data.email}")
    try:
        user = service.login_user_or_raise(db, data.email, data.password)
    except HTTPException as e:
        # Preserve legacy message for invalid credentials; surface status blocks
        raise e
    from app.core.security import create_access_token
    token = create_access_token({"email": user.email, "role": user.role, "user_id": user.id})
    return {"access_token": token}


# ---------- detail / role / status / eligibility ----------

@router.get("/{user_id}", response_model=schemas.UserDetailView)
def get_user(user_id: int, db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    view = service._admin_view(user, db)
    # Merge full detail columns
    for col in ("first_name", "middle_name", "last_name", "profile_photo", "gender",
                "date_of_birth", "nationality", "secondary_email", "secondary_phone",
                "country", "state", "city", "address_line1", "address_line2",
                "postal_code", "emergency_contact_name", "emergency_contact_relationship",
                "emergency_contact_phone", "emergency_contact_secondary_phone",
                "emergency_contact_email", "employment_type", "joining_date",
                "reporting_manager_id", "professional_summary", "current_specialization",
                "suspended_at", "deactivated_at", "updated_at"):
        view[col] = getattr(user, col, None)
    return view


@router.patch("/{user_id}/role", response_model=schemas.UserResponse,
              dependencies=[Depends(_admin_only)])
def change_role(user_id: int, data: schemas.RoleChangeRequest,
                db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.change_role(db, user_id, data.role, actor_id=current_user.id)


@router.patch("/{user_id}/status", response_model=schemas.UserResponse,
              dependencies=[Depends(_admin_only)])
def change_status(user_id: int, data: schemas.StatusChangeRequest,
                  db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    return service.change_status(db, user_id, data.account_status,
                                 actor_id=current_user.id, reason=data.reason)


@router.get("/{user_id}/eligibility", response_model=schemas.EligibilityResponse)
def eligibility(user_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    from app.modules.users import models
    from app.core.rbac import normalize_role
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN") and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not permitted")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    eligible, reason = service.is_supervisor_eligible(user)
    return {"eligible": eligible, "reason": reason,
            "account_status": user.account_status or "", "role": user.role}


@router.delete("/{user_id}", dependencies=[Depends(require_superadmin)])
def delete_user(user_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.delete_user(db=db, user_id=user_id, current_user_id=current_user.id)


# ---------- profile sub-resources ----------

def _get_user_or_404(db: Session, user_id: int):
    from app.modules.users import models
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _can_edit_profile(current_user, user_id: int) -> bool:
    from app.core.rbac import normalize_role
    return normalize_role(current_user.role) in ("SUPERADMIN", "ADMIN") or current_user.id == user_id


def _can_view_profile(current_user, user_id: int) -> bool:
    """Read-only monitors may inspect any profile; writes stay edit-gated."""
    from app.core.rbac import normalize_role
    return _can_edit_profile(current_user, user_id) or \
        normalize_role(current_user.role) == "MONITOR"


@router.get("/{user_id}/experience", response_model=list[schemas.ExperienceResponse])
def list_experience(user_id: int, db: Session = Depends(get_db),
                    current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    return db.query(models.UserExperience).filter(models.UserExperience.user_id == user_id).all()


@router.post("/{user_id}/experience", response_model=schemas.ExperienceResponse,
             status_code=status.HTTP_201_CREATED)
def add_experience(user_id: int, data: schemas.ExperienceCreate, db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    from app.modules.users.audit import log_action
    _get_user_or_404(db, user_id)
    rec = models.UserExperience(user_id=user_id, **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    log_action(db, action="USER_UPDATED", actor_id=current_user.id, target_type="user",
               target_id=user_id, metadata={"section": "experience", "op": "create"})
    db.commit()
    return rec


@router.put("/{user_id}/experience/{exp_id}", response_model=schemas.ExperienceResponse)
def update_experience(user_id: int, exp_id: int, data: schemas.ExperienceUpdate,
                      db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rec = db.query(models.UserExperience).filter(
        models.UserExperience.id == exp_id, models.UserExperience.user_id == user_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Experience not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/{user_id}/experience/{exp_id}")
def delete_experience(user_id: int, exp_id: int, db: Session = Depends(get_db),
                      current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rec = db.query(models.UserExperience).filter(
        models.UserExperience.id == exp_id, models.UserExperience.user_id == user_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Experience not found")
    db.delete(rec)
    db.commit()
    return {"message": "Experience deleted"}


@router.get("/{user_id}/education", response_model=list[schemas.EducationResponse])
def list_education(user_id: int, db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    return db.query(models.UserEducation).filter(models.UserEducation.user_id == user_id).all()


@router.post("/{user_id}/education", response_model=schemas.EducationResponse,
             status_code=status.HTTP_201_CREATED)
def add_education(user_id: int, data: schemas.EducationCreate, db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    _get_user_or_404(db, user_id)
    rec = models.UserEducation(user_id=user_id, **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.put("/{user_id}/education/{edu_id}", response_model=schemas.EducationResponse)
def update_education(user_id: int, edu_id: int, data: schemas.EducationUpdate,
                     db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rec = db.query(models.UserEducation).filter(
        models.UserEducation.id == edu_id, models.UserEducation.user_id == user_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Education not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/{user_id}/education/{edu_id}")
def delete_education(user_id: int, edu_id: int, db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rec = db.query(models.UserEducation).filter(
        models.UserEducation.id == edu_id, models.UserEducation.user_id == user_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Education not found")
    db.delete(rec)
    db.commit()
    return {"message": "Education deleted"}


@router.get("/{user_id}/skills", response_model=list[schemas.SkillResponse])
def list_skills(user_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    return db.query(models.UserSkill).filter(models.UserSkill.user_id == user_id).all()


@router.post("/{user_id}/skills", response_model=schemas.SkillResponse,
             status_code=status.HTTP_201_CREATED)
def add_skill(user_id: int, data: schemas.SkillCreate, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    _get_user_or_404(db, user_id)
    if db.query(models.UserSkill).filter(
            models.UserSkill.user_id == user_id, models.UserSkill.skill == data.skill).first():
        raise HTTPException(status_code=409, detail="Skill already added")
    rec = models.UserSkill(user_id=user_id, **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/{user_id}/skills/{skill_id}")
def delete_skill(user_id: int, skill_id: int, db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rec = db.query(models.UserSkill).filter(
        models.UserSkill.id == skill_id, models.UserSkill.user_id == user_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Skill not found")
    db.delete(rec)
    db.commit()
    return {"message": "Skill deleted"}


@router.get("/{user_id}/certifications", response_model=list[schemas.CertificationResponse])
def list_certs(user_id: int, db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rows = db.query(models.UserCertification).filter(
        models.UserCertification.user_id == user_id).all()
    out = []
    today = date.today()
    for r in rows:
        expired = bool(r.expiry_date and r.expiry_date < today)
        d = {c: getattr(r, c) for c in (
            "certification_name", "issuing_organization", "certificate_number",
            "issue_date", "expiry_date", "status", "description")}
        d.update(id=r.id, user_id=r.user_id, is_expired=expired)
        out.append(d)
    return out


@router.post("/{user_id}/certifications", response_model=schemas.CertificationResponse,
             status_code=status.HTTP_201_CREATED)
def add_cert(user_id: int, data: schemas.CertificationCreate, db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    _get_user_or_404(db, user_id)
    rec = models.UserCertification(user_id=user_id, **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {**data.model_dump(), "id": rec.id, "user_id": user_id, "is_expired": False}


@router.delete("/{user_id}/certifications/{cert_id}")
def delete_cert(user_id: int, cert_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rec = db.query(models.UserCertification).filter(
        models.UserCertification.id == cert_id,
        models.UserCertification.user_id == user_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Certification not found")
    db.delete(rec)
    db.commit()
    return {"message": "Certification deleted"}


@router.get("/{user_id}/licenses", response_model=list[schemas.LicenseResponse])
def list_licenses(user_id: int, db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rows = db.query(models.UserLicense).filter(models.UserLicense.user_id == user_id).all()
    out = []
    today = date.today()
    for r in rows:
        expired = bool(r.expiry_date and r.expiry_date < today)
        d = {c: getattr(r, c) for c in (
            "license_name", "license_number", "issuing_authority",
            "issue_date", "expiry_date", "status")}
        d.update(id=r.id, user_id=r.user_id, is_expired=expired)
        out.append(d)
    return out


@router.post("/{user_id}/licenses", response_model=schemas.LicenseResponse,
             status_code=status.HTTP_201_CREATED)
def add_license(user_id: int, data: schemas.LicenseCreate, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    _get_user_or_404(db, user_id)
    rec = models.UserLicense(user_id=user_id, **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {**data.model_dump(), "id": rec.id, "user_id": user_id, "is_expired": False}


@router.delete("/{user_id}/licenses/{lic_id}")
def delete_license(user_id: int, lic_id: int, db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    rec = db.query(models.UserLicense).filter(
        models.UserLicense.id == lic_id, models.UserLicense.user_id == user_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="License not found")
    db.delete(rec)
    db.commit()
    return {"message": "License deleted"}


@router.get("/{user_id}/documents", response_model=list[schemas.DocumentResponse])
def list_documents(user_id: int, db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    return db.query(models.UserDocument).filter(models.UserDocument.user_id == user_id).all()


@router.post("/{user_id}/documents", response_model=schemas.DocumentResponse,
             status_code=status.HTTP_201_CREATED)
def add_document_meta(user_id: int, data: schemas.DocumentCreate,
                      db: Session = Depends(get_db),
                      current_user=Depends(get_current_user)):
    """Metadata-only. Binary upload is an explicit next phase (storage_status=PENDING)."""
    if not _can_edit_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    _get_user_or_404(db, user_id)
    rec = models.UserDocument(user_id=user_id, storage_status="PENDING", **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/{user_id}/supervisor-profile", response_model=schemas.SupervisorProfileResponse)
def get_supervisor_profile(user_id: int, db: Session = Depends(get_db),
                           current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    prof = db.query(models.SupervisorProfile).filter(
        models.SupervisorProfile.user_id == user_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Supervisor profile not found")
    return prof


@router.put("/{user_id}/supervisor-profile", response_model=schemas.SupervisorProfileResponse)
def upsert_supervisor_profile(user_id: int, data: schemas.SupervisorProfileUpsert,
                              db: Session = Depends(get_db),
                              current_user=Depends(get_current_user)):
    from app.modules.users import models
    from app.core.rbac import normalize_role
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    user = _get_user_or_404(db, user_id)
    if normalize_role(user.role) != "SUPERVISOR":
        raise HTTPException(status_code=400, detail="Supervisor profile requires role=SUPERVISOR")
    prof = db.query(models.SupervisorProfile).filter(
        models.SupervisorProfile.user_id == user_id).first()
    if not prof:
        prof = models.SupervisorProfile(user_id=user_id, **data.model_dump(exclude_unset=True))
        db.add(prof)
    else:
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(prof, k, v)
    db.commit()
    db.refresh(prof)
    return prof


@router.get("/{user_id}/assignments", response_model=list[schemas.AssignmentResponse])
def list_user_assignments(user_id: int, db: Session = Depends(get_db),
                          current_user=Depends(get_current_user)):
    if not _can_view_profile(current_user, user_id):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.projects import models as pm
    return db.query(pm.ProjectAssignment).filter(pm.ProjectAssignment.user_id == user_id).all()


@router.get("/{user_id}/audit", response_model=list[schemas.AuditLogResponse])
def list_user_audit(user_id: int, db: Session = Depends(get_db),
                    current_user=Depends(get_current_user),
                    page: int = page_param(), limit: int = limit_param(),
                    response: Response = None):
    from app.core.rbac import normalize_role
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN", "MONITOR"):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    from app.utils.pagination import paginate_query, set_total as _set_total
    rows, total = paginate_query(
        db.query(models.AuditLog).filter(
            models.AuditLog.target_type == "user",
            models.AuditLog.target_id == user_id,
        ).order_by(models.AuditLog.timestamp.desc()), page, limit)
    if response is not None:
        _set_total(response, total)
    return rows


@router.get("/{user_id}/activity", response_model=list[schemas.AuditLogResponse])
def list_user_activity(user_id: int, db: Session = Depends(get_db),
                       current_user=Depends(get_current_user),
                       page: int = page_param(), limit: int = limit_param(),
                       response: Response = None):
    """Operations performed BY this user (actor view for oversight)."""
    from app.core.rbac import normalize_role
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN", "MONITOR"):
        raise HTTPException(status_code=403, detail="Not permitted")
    from app.modules.users import models
    from app.utils.pagination import paginate_query, set_total as _set_total
    rows, total = paginate_query(
        db.query(models.AuditLog).filter(
            models.AuditLog.actor_id == user_id,
        ).order_by(models.AuditLog.timestamp.desc()), page, limit)
    if response is not None:
        _set_total(response, total)
    return rows


# ---------- assignments (foundation) ----------

@router.post("/assignments", response_model=schemas.AssignmentResponse,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(_admin_only)])
def create_assignment(data: schemas.AssignmentCreate, db: Session = Depends(get_db),
                      current_user=Depends(get_current_user)):
    from app.modules.projects import models as pm
    from app.modules.users import models as um
    from app.modules.users.audit import log_action
    project = db.query(pm.Project).filter(pm.Project.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    user = db.query(um.User).filter(um.User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    eligible, reason = service.is_supervisor_eligible(user)
    if not eligible:
        raise HTTPException(status_code=400, detail=f"Not eligible: {reason}")
    existing = db.query(pm.ProjectAssignment).filter(
        pm.ProjectAssignment.project_id == data.project_id,
        pm.ProjectAssignment.user_id == data.user_id,
        pm.ProjectAssignment.status == "ACTIVE").first()
    if existing:
        raise HTTPException(status_code=409, detail="Active assignment already exists")
    if data.is_primary:
        clash = db.query(pm.ProjectAssignment).filter(
            pm.ProjectAssignment.project_id == data.project_id,
            pm.ProjectAssignment.status == "ACTIVE",
            pm.ProjectAssignment.is_primary == True).first()  # noqa: E712
        if clash:
            raise HTTPException(status_code=409,
                                detail="Project already has a primary supervisor")
    rec = pm.ProjectAssignment(
        project_id=data.project_id, user_id=data.user_id,
        assignment_role=(data.assignment_role or "SUPERVISOR").upper(),
        status="ACTIVE", is_primary=bool(data.is_primary),
        start_date=data.start_date, end_date=data.end_date,
        assigned_by=current_user.id, notes=data.notes,
    )
    db.add(rec)
    # Compat: keep legacy project_supervisors in sync (old DER/supervisor views)
    legacy = pm.ProjectSupervisor(project_id=data.project_id,
                                  supervisor_id=data.user_id, is_active=True)
    db.add(legacy)
    log_action(db, action="SUPERVISOR_ASSIGNED", actor_id=current_user.id,
               target_type="project", target_id=data.project_id,
               metadata={"user_id": data.user_id})
    db.commit()
    db.refresh(rec)
    return rec


@router.post("/assignments/{assignment_id}/end")
def end_assignment(assignment_id: int, reason: str = "Completed",
                   db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    from datetime import datetime
    from app.modules.projects import models as pm
    from app.modules.users.audit import log_action
    from app.core.rbac import normalize_role
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    rec = db.query(pm.ProjectAssignment).filter(pm.ProjectAssignment.id == assignment_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Assignment not found")
    rec.status = "REMOVED" if "remov" in reason.lower() else "COMPLETED"
    rec.removed_by = current_user.id
    rec.removed_at = datetime.utcnow()
    rec.removal_reason = reason
    # Compat: deactivate legacy link
    legacy = db.query(pm.ProjectSupervisor).filter(
        pm.ProjectSupervisor.project_id == rec.project_id,
        pm.ProjectSupervisor.supervisor_id == rec.user_id).first()
    if legacy:
        legacy.is_active = False
    log_action(db, action="SUPERVISOR_REMOVED", actor_id=current_user.id,
               target_type="project", target_id=rec.project_id,
               metadata={"user_id": rec.user_id, "reason": reason})
    db.commit()
    return {"message": f"Assignment {rec.status.lower()}"}
