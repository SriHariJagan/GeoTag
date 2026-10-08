# Core package initializer
from sqlalchemy.orm import Session
from app.modules.users.models import User
from app.core.security import hash_password
from app.core.config import settings

def create_superadmin(db: Session):
    existing_admin = db.query(User).filter(
        User.role == "superadmin"
    ).first() or db.query(User).filter(
        User.role == "SUPERADMIN"
    ).first()

    if existing_admin:
        # Backfill new columns for legacy seed rows (is_active is source of truth)
        patched = False
        if getattr(existing_admin, "is_active", False) and getattr(existing_admin, "account_status", None) != "ACTIVE":
            existing_admin.account_status = "ACTIVE"
            patched = True
        if not getattr(existing_admin, "account_status", None):
            existing_admin.account_status = "ACTIVE" if existing_admin.is_active else "INVITED"
            patched = True
        if existing_admin.is_active is not True:
            existing_admin.is_active = True
            patched = True
        if not getattr(existing_admin, "created_at", None):
            from datetime import datetime as _dt
            existing_admin.created_at = _dt.utcnow()
            existing_admin.updated_at = _dt.utcnow()
            patched = True
        if patched:
            db.commit()
        return

    admin = User(
        email=settings.SUPERADMIN_EMAIL,
        full_name=settings.SUPERADMIN_NAME,
        role="SUPERADMIN",
        account_status="ACTIVE",
        hashed_password=hash_password(settings.SUPERADMIN_PASSWORD),
        is_active=True,
    )

    db.add(admin)
    db.commit()
