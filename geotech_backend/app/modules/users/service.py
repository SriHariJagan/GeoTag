"""User service — User Management V2.

Business rules (see spec §49):
  1. Creating a user does NOT activate them (account_status=INVITED).
  2. Sending an invitation does NOT activate them.
  3. Accepting the invitation activates the account.
  4. Active != supervisor. Admin assigns role separately.
  5-6. Only ACTIVE SUPERVISORs are assignable.
  7. Assignment is separate from role (ProjectAssignment table).
"""
from __future__ import annotations

from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.modules.users import models, schemas
from app.core.security import hash_password, verify_password, create_access_token
from app.core.rbac import normalize_role, VALID_ROLES, VALID_ACCOUNT_STATUSES
from app.modules.users.audit import log_action


# ---------- helpers ----------

def _split_name(full_name: str) -> tuple[str | None, str | None]:
    parts = (full_name or "").strip().split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[-1]


def _sync_active_flag(user: models.User) -> None:
    user.is_active = (user.account_status == "ACTIVE")


def is_supervisor_eligible(user: models.User) -> tuple[bool, str]:
    """Eligibility: ACTIVE + role SUPERVISOR + not suspended/deactivated."""
    if user.account_status != "ACTIVE" or not user.is_active:
        return False, f"Account is not active (status={user.account_status})"
    if normalize_role(user.role) != "SUPERVISOR":
        return False, f"Role is {user.role}, SUPERVISOR required"
    return True, "Eligible for project assignment"


def _admin_view(user: models.User, db: Session) -> dict:
    from app.modules.users import invitations as inv_mod
    inv = inv_mod._active_invitation(db, user.id) if user.id else None
    eligible, reason = is_supervisor_eligible(user)
    latest_status = inv.status if inv else (
        "ACCEPTED" if user.invite_accepted_at else None
    )
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "is_active": bool(user.is_active),
        "account_status": user.account_status or ("ACTIVE" if user.is_active else "INVITED"),
        "employee_id": user.employee_id,
        "designation": user.designation,
        "department": user.department,
        "years_of_experience": user.years_of_experience,
        "contact": user.contact,
        "primary_phone": user.primary_phone,
        "invited_at": user.invited_at,
        "invite_accepted_at": user.invite_accepted_at,
        "invitation_expires_at": user.invitation_expires_at,
        "invitation_status": latest_status,
        "supervisor_eligible": eligible,
        "eligibility_reason": reason,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
    }


# ---------- CRUD ----------

def create_user(db: Session, user: schemas.UserCreate, *, actor_id: int | None = None) -> models.User:
    role = normalize_role(user.role)
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {sorted(VALID_ROLES)}")
    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if user.employee_id and db.query(models.User).filter(models.User.employee_id == user.employee_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee ID already registered")

    first, last = _split_name(user.full_name)
    db_user = models.User(
        email=user.email,
        full_name=user.full_name,
        first_name=user.first_name or first,
        last_name=user.last_name or last,
        middle_name=user.middle_name,
        gender=user.gender,
        date_of_birth=user.date_of_birth,
        nationality=user.nationality,
        contact=user.contact,
        secondary_email=user.secondary_email,
        primary_phone=user.primary_phone,
        secondary_phone=user.secondary_phone,
        country=user.country, state=user.state, city=user.city,
        address_line1=user.address_line1, address_line2=user.address_line2,
        postal_code=user.postal_code,
        emergency_contact_name=user.emergency_contact_name,
        emergency_contact_relationship=user.emergency_contact_relationship,
        emergency_contact_phone=user.emergency_contact_phone,
        emergency_contact_secondary_phone=user.emergency_contact_secondary_phone,
        emergency_contact_email=user.emergency_contact_email,
        employee_id=user.employee_id,
        designation=user.designation,
        department=user.department,
        employment_type=user.employment_type,
        joining_date=user.joining_date,
        reporting_manager_id=user.reporting_manager_id,
        years_of_experience=user.years_of_experience,
        professional_summary=user.professional_summary,
        current_specialization=user.current_specialization,
        profile_photo=user.profile_photo,
        role=role,
        account_status="INVITED",
        hashed_password=hash_password(user.password) if user.password else None,
        is_active=False,
    )
    db.add(db_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")
    db.refresh(db_user)
    log_action(db, action="USER_CREATED", actor_id=actor_id, target_type="user",
               target_id=db_user.id, metadata={"email": db_user.email, "role": role})
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user(db: Session, user_id: int, data: schemas.UserUpdate, *, actor_id: int | None = None) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    payload = data.model_dump(exclude_unset=True)
    # Email is the auth identity — not updatable via this endpoint
    payload.pop("email", None)
    # Role/status changes go through dedicated endpoints with audit; reject here
    # if they attempt privilege-relevant transitions without actor context? Allow
    # plain profile fields, but route role/status via change_role/change_status.
    role = payload.pop("role", None)
    acct = payload.pop("account_status", None)
    is_active_legacy = payload.pop("is_active", None)

    if data.employee_id and data.employee_id != user.employee_id:
        if db.query(models.User).filter(models.User.employee_id == data.employee_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee ID already registered")

    for key, value in payload.items():
        if hasattr(user, key):
            setattr(user, key, value)
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    log_action(db, action="USER_UPDATED", actor_id=actor_id, target_type="user",
               target_id=user.id, metadata={"fields": sorted(payload.keys())})
    db.commit()
    db.refresh(user)
    # Role/status requested alongside profile update → delegate (keeps audit trail)
    if role is not None:
        user = change_role(db, user.id, role, actor_id=actor_id)
    if acct is not None:
        user = change_status(db, user.id, acct, actor_id=actor_id)
    elif is_active_legacy is not None:
        user = change_status(db, user.id, "ACTIVE" if is_active_legacy else "SUSPENDED", actor_id=actor_id)
    return user


def get_users(db: Session):
    return db.query(models.User).all()


def get_users_admin_view(db: Session, q: str | None = None,
                         page: int = 1, limit: int = 20) -> tuple[list, int]:
    from app.utils.pagination import paginate_query
    query = db.query(models.User)
    if (q or "").strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            models.User.full_name.ilike(like) |
            models.User.email.ilike(like) |
            models.User.employee_id.ilike(like) |
            models.User.primary_phone.ilike(like) |
            models.User.secondary_phone.ilike(like) |
            models.User.contact.ilike(like))
    rows, total = paginate_query(query.order_by(models.User.id.desc()), page, limit)
    return [_admin_view(u, db) for u in rows], total


def get_user_detail(db: Session, user_id: int) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# ---------- auth ----------

def authenticate_user(db: Session, email: str, password: str):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    # Inactive/suspended/deactivated must NOT authenticate
    acct = user.account_status or ("ACTIVE" if user.is_active else "INVITED")
    if acct != "ACTIVE" or not user.is_active:
        return None
    return user


def login_user(db: Session, email: str, password: str):
    user = authenticate_user(db, email, password)
    if not user:
        return None
    user.last_login_at = datetime.utcnow()
    db.commit()
    return create_access_token({"email": user.email, "role": user.role, "user_id": user.id})


def login_user_or_raise(db: Session, email: str, password: str) -> models.User:
    """Same checks but distinguishes invalid credentials vs inactive status."""
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.hashed_password or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    acct = user.account_status or ("ACTIVE" if user.is_active else "INVITED")
    if acct != "ACTIVE" or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Account is {acct}. Contact your administrator.")
    user.last_login_at = datetime.utcnow()
    db.commit()
    return user


# ---------- invitations (legacy-compat wrappers) ----------

def invite_user(db: Session, invite, *, actor_id: int | None = None, background=None):
    from app.modules.users import invitations as inv_mod
    role = normalize_role(getattr(invite, "role", ""))
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {sorted(VALID_ROLES)}")
    user = db.query(models.User).filter(models.User.email == invite.email).first()
    if user and (user.account_status == "ACTIVE" or user.is_active):
        return {"message": "User already active"}
    if user and user.invite_accepted_at:
        return {"message": "User already accepted invite"}
    if not user:
        first, last = _split_name(getattr(invite, "full_name", invite.email))
        user = models.User(
            email=invite.email, full_name=getattr(invite, "full_name", invite.email),
            first_name=first, last_name=last, role=role,
            account_status="INVITED", is_active=False, invited_at=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        log_action(db, action="USER_CREATED", actor_id=actor_id, target_type="user",
                   target_id=user.id, metadata={"email": user.email, "via": "invite"})
        db.commit()
    elif normalize_role(user.role) != role:
        # Keep the invited role in sync when re-inviting before acceptance
        user.role = role
        db.commit()
    inv_mod.send_invitation(db, user, created_by=actor_id, background=background)
    return {"message": "Invitation sent successfully"}


def accept_invite(db: Session, token: str, password: str):
    """Legacy wrapper returning user|None (router maps None -> 400)."""
    from app.modules.users import invitations as inv_mod
    try:
        return inv_mod.accept_invitation(db, token, password)
    except HTTPException:
        return None


# ---------- role / status ----------

def change_role(db: Session, user_id: int, role: str, *, actor_id: int | None = None) -> models.User:
    role = normalize_role(role)
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {sorted(VALID_ROLES)}")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if actor_id is not None and user.id == actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot change your own role")
    old = user.role
    user.role = role
    user.updated_at = datetime.utcnow()
    # Changing to SUPERVISOR does not auto-activate; eligibility is computed.
    log_action(db, action="ROLE_CHANGED", actor_id=actor_id, target_type="user",
               target_id=user.id, metadata={"from": old, "to": role})
    db.commit()
    db.refresh(user)
    return user


def change_status(db: Session, user_id: int, account_status: str, *, actor_id: int | None = None, reason: str | None = None) -> models.User:
    if account_status not in VALID_ACCOUNT_STATUSES:
        raise HTTPException(status_code=422, detail=f"account_status must be one of {sorted(VALID_ACCOUNT_STATUSES)}")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if actor_id is not None and user.id == actor_id and account_status != "ACTIVE":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot suspend or deactivate your own account")
    if normalize_role(user.role) == "SUPERADMIN" and account_status in ("SUSPENDED", "DEACTIVATED"):
        remaining = db.query(models.User).filter(
            models.User.role == "SUPERADMIN",
            models.User.account_status == "ACTIVE",
            models.User.id != user.id,
        ).count()
        # Legacy lowercase seed compat
        remaining += db.query(models.User).filter(
            models.User.role == "superadmin",
            models.User.account_status == "ACTIVE",
            models.User.id != user.id,
        ).count()
        if remaining == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot suspend the last active superadmin")
    now = datetime.utcnow()
    user.account_status = account_status
    _sync_active_flag(user)
    if account_status == "SUSPENDED":
        user.suspended_at = now
    elif account_status == "DEACTIVATED":
        user.deactivated_at = now
    user.updated_at = now
    action = {"ACTIVE": "USER_ACTIVATED", "SUSPENDED": "USER_SUSPENDED",
              "DEACTIVATED": "USER_DEACTIVATED", "INVITED": "USER_UPDATED"}.get(account_status, "USER_UPDATED")
    log_action(db, action=action, actor_id=actor_id, target_type="user",
               target_id=user.id, metadata={"status": account_status, "reason": reason or ""})
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int, current_user_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == current_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    from app.modules.projects import models as project_models
    assigned = db.query(project_models.ProjectSupervisor).filter(
        project_models.ProjectSupervisor.supervisor_id == user.id).first()
    if assigned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Cannot delete user assigned as supervisor to a project")
    # New assignment table also blocks delete while ACTIVE
    if hasattr(project_models, "ProjectAssignment"):
        active = db.query(project_models.ProjectAssignment).filter(
            project_models.ProjectAssignment.user_id == user.id,
            project_models.ProjectAssignment.status == "ACTIVE").first()
        if active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Cannot delete user with an active project assignment")
    log_action(db, action="USER_DELETED", actor_id=current_user_id, target_type="user",
               target_id=user.id, metadata={"email": user.email})
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}
