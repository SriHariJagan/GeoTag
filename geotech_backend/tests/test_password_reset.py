"""Forgot-password flow: OTP -> reset link -> new password, plus guards."""
import hashlib

from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)
from app.modules.users.models import PasswordReset


ADMIN = login()
CODE = "654321"
TOKEN = "test-reset-token-abcdef-123456"


def _sha(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def _supervisor(email):
    r = client.post("/users/", json={"email": email, "full_name": "PR " + email,
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    client.post("/users/invite", json={"email": email, "full_name": "PR",
                                       "role": "SUPERVISOR"}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    return uid, login(email, "Strong@123")


def _row_for(uid):
    db = TestingSession()
    try:
        return db.query(PasswordReset).filter(
            PasswordReset.user_id == uid).order_by(PasswordReset.id.desc()).first()
    finally:
        db.close()


def _set_otp(uid, code=CODE):
    db = TestingSession()
    try:
        row = db.query(PasswordReset).filter(
            PasswordReset.user_id == uid,
            PasswordReset.status == "PENDING").order_by(
            PasswordReset.id.desc()).first()
        row.otp_hash = _sha(code)
        db.commit()
        return row.id
    finally:
        db.close()


def _set_token(uid, token=TOKEN):
    db = TestingSession()
    try:
        row = db.query(PasswordReset).filter(
            PasswordReset.user_id == uid,
            PasswordReset.status == "VERIFIED").order_by(
            PasswordReset.id.desc()).first()
        row.token_hash = _sha(token)
        db.commit()
        return row.id
    finally:
        db.close()


def test_full_flow():
    email = "pwreset1@example.com"
    uid, _sh = _supervisor(email)

    # unknown email -> same generic 200 (no enumeration)
    r = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 200 and "registered" in r.json()["message"], r.text

    r = client.post("/auth/forgot-password", json={"email": email})
    assert r.status_code == 200, r.text

    _set_otp(uid)
    r = client.post("/auth/verify-otp", json={"email": email, "otp": CODE})
    assert r.status_code == 200, r.text

    _set_token(uid)
    r = client.get("/auth/reset-password/validate", params={"token": TOKEN})
    assert r.status_code == 200 and r.json()["valid"] is True, r.text
    assert r.json()["email_masked"].endswith("@example.com"), r.text

    # weak password refused
    r = client.post("/auth/reset-password",
                    json={"token": TOKEN, "password": "weak"})
    assert r.status_code == 422, r.text

    r = client.post("/auth/reset-password",
                    json={"token": TOKEN, "password": "NewStrong@456"})
    assert r.status_code == 200, r.text

    # new password logs in, old one doesn't
    assert login(email, "NewStrong@456")
    r = client.post("/auth/login", json={"email": email, "password": "Strong@123"})
    assert r.status_code in (401, 403), r.text

    # link is single-use
    r = client.post("/auth/reset-password",
                    json={"token": TOKEN, "password": "Another@789"})
    assert r.status_code == 400, r.text

    # bad token probe
    r = client.get("/auth/reset-password/validate", params={"token": "nope"})
    assert r.status_code == 200 and r.json()["valid"] is False, r.text


def test_otp_attempts_lock():
    email = "pwreset2@example.com"
    uid, _sh = _supervisor(email)
    client.post("/auth/forgot-password", json={"email": email})
    _set_otp(uid)
    for _ in range(4):
        r = client.post("/auth/verify-otp", json={"email": email, "otp": "000000"})
        assert r.status_code == 400, r.text
    r = client.post("/auth/verify-otp", json={"email": email, "otp": "000000"})
    assert r.status_code == 429, r.text
    # even the right code is dead after lockout
    r = client.post("/auth/verify-otp", json={"email": email, "otp": CODE})
    assert r.status_code == 429, r.text


def test_expired_otp_needs_new_code():
    from datetime import datetime, timedelta
    email = "pwreset3@example.com"
    uid, _sh = _supervisor(email)
    client.post("/auth/forgot-password", json={"email": email})
    rid = _set_otp(uid)
    db = TestingSession()
    try:
        row = db.query(PasswordReset).filter(PasswordReset.id == rid).first()
        row.otp_expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()
    r = client.post("/auth/verify-otp", json={"email": email, "otp": CODE})
    assert r.status_code == 400 and "expired" in r.json()["detail"].lower(), r.text
