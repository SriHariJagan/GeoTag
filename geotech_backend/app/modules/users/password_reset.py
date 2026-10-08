"""Forgot-password flow: OTP first, then a single-use reset link.

Step 1  POST /auth/forgot-password  {email}          -> OTP emailed (10 min)
Step 2  POST /auth/verify-otp       {email, otp}     -> reset link emailed (30 min)
Step 3  POST /auth/reset-password   {token, password} -> password updated

Only hashes are stored. Responses never reveal whether an email is registered.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, validate_password_strength
from app.modules.users import models
from app.modules.users.audit import log_action

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
RESET_TTL_MINUTES = 30

_GENERIC_FORGOT = "If this email is registered, a verification code is on its way."
_GENERIC_OTP = "Invalid or expired code."
_GENERIC_TOKEN = "This reset link is invalid or has expired."


def _sha(v: str) -> str:
    return hashlib.sha256(v.encode("utf-8")).hexdigest()


def _mask_email(email: str) -> str:
    local, _, domain = (email or "").partition("@")
    if not domain:
        return "***"
    head = local[:1] + "***" if local else "***"
    return f"{head}@{domain}"


def _send_otp_email(email: str, otp: str, full_name: str = "") -> None:
    from app.core import email as email_mod
    try:
        email_mod.send_otp_email(email, otp, full_name=full_name)
    except Exception as exc:  # never break the flow on mail failure
        print(f"[password-reset] OTP email failed for {email}: {exc}")
        if settings.ENV != "production":
            print(f"[password-reset] DEV OTP for {email}: {otp}")


def _send_reset_link_email(email: str, link: str, full_name: str = "") -> None:
    from app.core import email as email_mod
    try:
        email_mod.send_reset_link_email(email, link, full_name=full_name)
    except Exception as exc:
        print(f"[password-reset] reset-link email failed for {email}: {exc}")
        if settings.ENV != "production":
            print(f"[password-reset] DEV reset link for {email}: {link}")


def _find_user(db: Session, email: str):
    return db.query(models.User).filter(
        models.User.email == (email or "").strip()).first()


def _live_rows(db: Session, user_id: int):
    return db.query(models.PasswordReset).filter(
        models.PasswordReset.user_id == user_id,
        models.PasswordReset.status.in_(["PENDING", "VERIFIED"]),
    ).all()


def request_reset(db: Session, email: str) -> None:
    """Always succeeds silently — never reveal registration status."""
    email = (email or "").strip()
    user = _find_user(db, email)
    if not user or not user.hashed_password:
        return
    now = datetime.utcnow()
    for old in _live_rows(db, user.id):
        old.status = "SUPERSEDED"
    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    db.add(models.PasswordReset(
        user_id=user.id,
        otp_hash=_sha(otp),
        otp_expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
        status="PENDING",
    ))
    db.commit()
    log_action(db, action="PASSWORD_RESET_REQUESTED", actor_id=user.id,
               target_type="user", target_id=user.id, metadata={})
    db.commit()
    _send_otp_email(user.email, otp, full_name=user.full_name or "")


def verify_otp(db: Session, email: str, otp: str) -> None:
    email = (email or "").strip()
    user = _find_user(db, email)
    row = None
    if user:
        row = db.query(models.PasswordReset).filter(
            models.PasswordReset.user_id == user.id,
            models.PasswordReset.status == "PENDING",
        ).order_by(models.PasswordReset.id.desc()).first()
    now = datetime.utcnow()
    if not user or not row:
        if user:
            latest = db.query(models.PasswordReset).filter(
                models.PasswordReset.user_id == user.id,
            ).order_by(models.PasswordReset.id.desc()).first()
            if (latest and latest.status == "FAILED"
                    and latest.otp_attempts >= OTP_MAX_ATTEMPTS):
                raise HTTPException(
                    status_code=429,
                    detail="Too many wrong attempts — request a new code.")
        raise HTTPException(status_code=400, detail=_GENERIC_OTP)
    if row.otp_expires_at < now:
        row.status = "FAILED"
        db.commit()
        raise HTTPException(status_code=400,
                            detail="This code has expired — request a new one.")
    if row.otp_attempts >= OTP_MAX_ATTEMPTS:
        row.status = "FAILED"
        db.commit()
        raise HTTPException(status_code=429,
                            detail="Too many wrong attempts — request a new code.")
    if not hmac.compare_digest(row.otp_hash, _sha((otp or "").strip())):
        row.otp_attempts += 1
        if row.otp_attempts >= OTP_MAX_ATTEMPTS:
            row.status = "FAILED"
            db.commit()
            raise HTTPException(status_code=429,
                                detail="Too many wrong attempts — request a new code.")
        db.commit()
        raise HTTPException(status_code=400, detail=_GENERIC_OTP)
    # OTP correct -> issue the one-time link (token itself never leaves the email).
    token = secrets.token_urlsafe(32)
    row.token_hash = _sha(token)
    row.token_expires_at = now + timedelta(minutes=RESET_TTL_MINUTES)
    row.status = "VERIFIED"
    row.verified_at = now
    db.commit()
    log_action(db, action="PASSWORD_RESET_VERIFIED", actor_id=user.id,
               target_type="user", target_id=user.id,
               metadata={"request_id": row.id})
    db.commit()
    link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    _send_reset_link_email(user.email, link, full_name=user.full_name or "")


def _live_token_row(db: Session, token: str):
    if not token:
        return None
    return db.query(models.PasswordReset).filter(
        models.PasswordReset.token_hash == _sha(token),
        models.PasswordReset.status == "VERIFIED",
    ).first()


def validate_token(db: Session, token: str) -> dict:
    row = _live_token_row(db, token or "")
    now = datetime.utcnow()
    if not row or not row.token_expires_at or row.token_expires_at < now:
        return {"valid": False, "email_masked": None}
    user = db.query(models.User).filter(models.User.id == row.user_id).first()
    return {"valid": True,
            "email_masked": _mask_email(user.email if user else "")}


def reset_password(db: Session, token: str, password: str):
    row = _live_token_row(db, token or "")
    now = datetime.utcnow()
    if not row or not row.token_expires_at or row.token_expires_at < now:
        raise HTTPException(status_code=400, detail=_GENERIC_TOKEN)
    ok, reason = validate_password_strength(password or "")
    if not ok:
        raise HTTPException(status_code=422, detail=reason)
    user = db.query(models.User).filter(models.User.id == row.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail=_GENERIC_TOKEN)
    user.hashed_password = hash_password(password)
    user.updated_at = now
    row.status = "USED"
    row.used_at = now
    for other in _live_rows(db, user.id):
        if other.id != row.id:
            other.status = "SUPERSEDED"
    db.commit()
    log_action(db, action="PASSWORD_RESET", actor_id=user.id,
               target_type="user", target_id=user.id,
               metadata={"request_id": row.id})
    db.commit()
    return user
