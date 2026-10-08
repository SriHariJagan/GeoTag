"""Invitation lifecycle: secure single-use hashed tokens with expiry/revoke."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.rbac import normalize_role, VALID_ROLES
from app.core.security import hash_invite_token, validate_password_strength, hash_password
from app.modules.users import models
from app.modules.users.audit import log_action

INVITE_TTL_HOURS = 24


def _invite_link(token: str) -> str:
    base = (settings.FRONTEND_URL or "").strip().rstrip("/")
    return f"{base}/accept-invite?token={token}"


def _decode_invite_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience="geotech-users",
            issuer=settings.PROJECT_NAME,
        )
    except JWTError:
        return None
    if payload.get("type") != "invite":
        return None
    return payload


def _active_invitation(db: Session, user_id: int) -> models.UserInvitation | None:
    now = datetime.utcnow()
    inv = (
        db.query(models.UserInvitation)
        .filter(
            models.UserInvitation.user_id == user_id,
            models.UserInvitation.status.in_(["PENDING", "SENT"]),
        )
        .order_by(models.UserInvitation.id.desc())
        .first()
    )
    if inv and inv.expires_at < now:
        inv.status = "EXPIRED"
        db.commit()
        return None
    return inv


def send_invitation(db: Session, user: models.User, *, created_by: int | None = None, background=None) -> tuple[str, models.UserInvitation]:
    """Create a fresh single-use invitation, revoke prior pending ones."""
    from app.core.email import send_invite_email

    # Revoke older pending invitations (single-use invariant)
    now = datetime.utcnow()
    old = db.query(models.UserInvitation).filter(
        models.UserInvitation.user_id == user.id,
        models.UserInvitation.status.in_(["PENDING", "SENT"]),
    ).all()
    for o in old:
        o.status = "REVOKED"
        o.revoked_at = now

    jti = str(uuid.uuid4())
    payload = {
        "sub": user.email,
        "email": user.email,
        "role": user.role,
        "type": "invite",
        "iss": settings.PROJECT_NAME,
        "aud": "geotech-users",
        "jti": jti,
        "iat": now,
        "exp": now + timedelta(hours=INVITE_TTL_HOURS),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    inv = models.UserInvitation(
        user_id=user.id,
        token_hash=hash_invite_token(token),
        token_jti=jti,
        status="SENT",
        sent_at=now,
        expires_at=now + timedelta(hours=INVITE_TTL_HOURS),
        created_by=created_by,
    )
    db.add(inv)
    user.invited_at = now
    user.invitation_expires_at = inv.expires_at
    if user.account_status not in ("ACTIVE", "SUSPENDED", "DEACTIVATED"):
        user.account_status = "INVITED"
        user.is_active = False
    db.commit()
    db.refresh(inv)

    send_invite_email(
        user.email, _invite_link(token),
        full_name=user.full_name, role=user.role,
        organization=settings.ORGANIZATION_NAME,
        background=background,
    )
    log_action(db, action="INVITATION_SENT", actor_id=created_by,
               target_type="user", target_id=user.id,
               metadata={"email": user.email})
    db.commit()
    return token, inv


def validate_invitation(db: Session, token: str) -> dict:
    """Validate before showing the password form. Returns public profile preview."""
    payload = _decode_invite_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invitation")
    email = payload.get("email") or payload.get("sub")
    jti = payload.get("jti")
    inv = db.query(models.UserInvitation).filter(models.UserInvitation.token_jti == jti).first()
    if not inv or inv.token_hash != hash_invite_token(token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invitation")
    if inv.status in ("ACCEPTED", "REVOKED"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation already used or revoked")
    if inv.status == "EXPIRED" or inv.expires_at < datetime.utcnow():
        inv.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation expired")
    user = db.query(models.User).filter(models.User.id == inv.user_id).first()
    if not user or (email and user.email != email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invitation")
    if user.invite_accepted_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation already accepted")
    return {
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "organization": settings.ORGANIZATION_NAME,
        "expires_at": inv.expires_at,
    }


def accept_invitation(db: Session, token: str, password: str) -> models.User:
    ok, reason = validate_password_strength(password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=reason)
    payload = _decode_invite_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invitation")
    jti = payload.get("jti")
    inv = db.query(models.UserInvitation).filter(models.UserInvitation.token_jti == jti).first()
    if not inv or inv.token_hash != hash_invite_token(token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invitation")
    if inv.status in ("ACCEPTED", "REVOKED"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation already used or revoked")
    if inv.expires_at < datetime.utcnow():
        inv.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation expired")
    user = db.query(models.User).filter(models.User.id == inv.user_id).first()
    if not user or user.invite_accepted_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation already accepted")

    now = datetime.utcnow()
    user.hashed_password = hash_password(password)
    user.account_status = "ACTIVE"
    user.is_active = True
    user.invite_accepted_at = now
    inv.status = "ACCEPTED"
    inv.accepted_at = now
    # Revoke any other pending invitations for this user
    others = db.query(models.UserInvitation).filter(
        models.UserInvitation.user_id == user.id,
        models.UserInvitation.id != inv.id,
        models.UserInvitation.status.in_(["PENDING", "SENT"]),
    ).all()
    for o in others:
        o.status = "REVOKED"
        o.revoked_at = now
    log_action(db, action="INVITATION_ACCEPTED", actor_id=user.id,
               target_type="user", target_id=user.id, metadata={"email": user.email})
    db.commit()
    db.refresh(user)
    return user
