"""Auth alias router — canonical /auth/* paths.

Delegates to the user service (single implementation). Legacy
POST /users/login is preserved for backward compatibility.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import login_limiter
from app.core.security import create_access_token
from app.modules.users import password_reset, schemas, service

router = APIRouter(prefix="/auth", tags=["Auth"])


def _rate_check(key: str):
    from app.core.config import settings
    if settings.ENV == "test":
        return  # automated suites bypass rate limits (production/dev enforce)
    allowed, retry = login_limiter.check(key)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Too many requests. Retry in {retry}s")


@router.post("/login", response_model=schemas.TokenResponse)
def auth_login(data: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    _rate_check(f"login:{data.email}")
    user = service.login_user_or_raise(db, data.email, data.password)
    token = create_access_token({"email": user.email, "role": user.role, "user_id": user.id})
    return {"access_token": token}


@router.post("/logout")
def auth_logout():
    # Stateless JWT: client discards the token. Kept for contract completeness.
    return {"message": "Logged out successfully"}


# ---------- Forgot password: OTP first, then a one-time reset link ----------

@router.post("/forgot-password")
def auth_forgot_password(data: schemas.ForgotPasswordRequest,
                         db: Session = Depends(get_db)):
    # Always 200 — never reveal whether an email is registered.
    _rate_check(f"forgot:{data.email}")
    password_reset.request_reset(db, data.email)
    return {"message": "If this email is registered, a verification code is on its way."}


@router.post("/verify-otp")
def auth_verify_otp(data: schemas.VerifyOtpRequest, db: Session = Depends(get_db)):
    _rate_check(f"otp:{data.email}")
    password_reset.verify_otp(db, data.email, data.otp)
    return {"message": "Code verified — a one-time reset link is on its way to your email."}


@router.get("/reset-password/validate")
def auth_validate_reset_token(token: str = "", db: Session = Depends(get_db)):
    return password_reset.validate_token(db, token)


@router.post("/reset-password")
def auth_reset_password(data: schemas.ResetPasswordRequest,
                        db: Session = Depends(get_db)):
    _rate_check(f"reset:{data.token[:12]}")
    password_reset.reset_password(db, data.token, data.password)
    return {"message": "Password updated — you can now log in with the new password."}
