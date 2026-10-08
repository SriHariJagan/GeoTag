"""Seed server user accounts — one per role (idempotent).

Creates ACTIVE login accounts for every role in app/core/rbac.py so each
permission set can be tested end-to-end on the server. Safe to re-run:
existing emails are skipped (but re-activated if needed).

Passwords come from SEED_PASSWORD_* env vars, falling back to the temporary
defaults below. Change them via the UI (Users page) after first login —
this file is for initial/test data only.

Run ON THE SERVER (scripts/ is not baked into the backend image):
    cd /var/www/project/GEOTECH
    git pull
    docker compose cp geotech_backend/scripts/seed_server_users.py backend:/tmp/seed_server_users.py
    docker compose exec backend python /tmp/seed_server_users.py

Optional custom passwords:
    docker compose exec -e SEED_PASSWORD_ADMIN='Strong1Pass' backend python /tmp/seed_server_users.py
"""

import os
import sys

sys.path.insert(0, "/app")

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.core.rbac import VALID_ROLES, permissions_for

import app.modules.users.models  # noqa: F401  (register tables before create_all)
from app.modules.users.models import User

# --- EDIT ME: accounts to ensure on the server ---
# (email, full name, role, default temporary password)
SEED_USERS: list[tuple[str, str, str, str]] = [
    ("admin@geotech.com", "Server Admin", "ADMIN", "Admin@123"),
    ("supervisor1@geotech.com", "Site Supervisor One", "SUPERVISOR", "Supervisor@123"),
    ("supervisor2@geotech.com", "Site Supervisor Two", "SUPERVISOR", "Supervisor@123"),
    ("vendor1@geotech.com", "Vendor Contact One", "VENDOR", "Vendor@123"),
    ("monitor@geotech.com", "Read-only Monitor", "MONITOR", "Monitor@123"),
    # SUPERADMIN is auto-created from SUPERADMIN_* in .env on startup,
    # so it is intentionally NOT listed here.
]

# Env override per role, e.g. SEED_PASSWORD_ADMIN, SEED_PASSWORD_VENDOR ...
ENV_BY_ROLE = {
    "ADMIN": "SEED_PASSWORD_ADMIN",
    "SUPERVISOR": "SEED_PASSWORD_SUPERVISOR",
    "VENDOR": "SEED_PASSWORD_VENDOR",
    "MONITOR": "SEED_PASSWORD_MONITOR",
}


def main() -> int:
    bad = [r for _, _, r, _ in SEED_USERS if r not in VALID_ROLES]
    if bad:
        print(f"ERROR: unknown role(s) {bad}. Valid: {sorted(VALID_ROLES)}")
        return 1

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for email, full_name, role, default_pw in SEED_USERS:
            password = os.getenv(ENV_BY_ROLE.get(role, ""), "") or default_pw
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                fixed = []
                if existing.account_status != "ACTIVE":
                    existing.account_status = "ACTIVE"
                    fixed.append("status->ACTIVE")
                if existing.is_active is not True:
                    existing.is_active = True
                    fixed.append("is_active=True")
                if existing.role != role:
                    existing.role = role
                    fixed.append(f"role->{role}")
                db.commit()
                note = ", ".join(fixed) if fixed else "already present"
                print(f"SKIP  {email:30s} {role:12s} ({note}; {len(permissions_for(role))} permissions)")
                continue
            db.add(
                User(
                    email=email,
                    full_name=full_name,
                    role=role,
                    account_status="ACTIVE",
                    hashed_password=hash_password(password),
                    is_active=True,
                )
            )
            db.commit()
            print(f"OK    {email:30s} {role:12s} ({len(permissions_for(role))} permissions)")
    finally:
        db.close()

    print("\nDone. Change temporary passwords via the UI (Users page).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
