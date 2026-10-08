from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import jwt
import hashlib
import re
import uuid
from app.core.config import settings

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

MAX_BCRYPT_LENGTH = 72

# Minimum password policy for new passwords (existing hashes still verify).
MIN_PASSWORD_LENGTH = 8
_PASSWORD_RE = {
    "lower": re.compile(r"[a-z]"),
    "upper": re.compile(r"[A-Z]"),
    "digit": re.compile(r"[0-9]"),
}


def validate_password_strength(password: str) -> tuple[bool, str]:
    """Return (ok, reason). Enforces min length + upper/lower/digit."""
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    if not _PASSWORD_RE["lower"].search(password):
        return False, "Password must contain a lowercase letter"
    if not _PASSWORD_RE["upper"].search(password):
        return False, "Password must contain an uppercase letter"
    if not _PASSWORD_RE["digit"].search(password):
        return False, "Password must contain a digit"
    return True, "ok"


def hash_invite_token(token: str) -> str:
    """SHA-256 hash for storing invitation tokens (never plaintext)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    # bcrypt supports max 72 bytes
    return pwd_context.hash(password[:MAX_BCRYPT_LENGTH])


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(
        plain_password[:MAX_BCRYPT_LENGTH],
        hashed_password
    )


def create_access_token(data: dict) -> str:
    to_encode = data.copy()

    to_encode.update({
        "sub": data["email"],
        "iss": settings.PROJECT_NAME,
        "aud": "geotech-users",
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        ),
    })

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )


def create_invite_token(email: str, role: str) -> str:
    payload = {
        "sub": email,
        "email": email,               # optional but fine
        "role": role,
        "type": "invite",
        "iss": settings.PROJECT_NAME,
        "aud": "geotech-users",
        "jti": str(uuid.uuid4()),
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=24),
    }

    return jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
