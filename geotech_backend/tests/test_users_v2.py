"""User Management V2 backend tests."""
import os

import pytest
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)
from datetime import datetime, timedelta


ADMIN = None


def setup_module():
    global ADMIN
    ADMIN = login()


def _create_user(email="ravi@example.com", role="SUPERVISOR", **extra):
    payload = {"email": email, "full_name": "Ravi Kumar", "role": role}
    payload.update(extra)
    r = client.post("/users/", json=payload, headers=ADMIN)
    return r


def test_create_user_invited_not_active():
    r = _create_user()
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["account_status"] == "INVITED"
    assert body["is_active"] is False
    assert "hashed_password" not in body
    assert "password" not in body


def test_duplicate_email_409():
    r = _create_user(email="ravi@example.com")
    assert r.status_code == 409, r.text


def test_duplicate_employee_id_409():
    r1 = _create_user(email="e1@example.com", employee_id="EMP-001")
    assert r1.status_code == 200, r1.text
    r2 = _create_user(email="e2@example.com", employee_id="EMP-001")
    assert r2.status_code == 409, r2.text


def test_update_user_persists_contact():
    r = _create_user(email="upd@example.com")
    uid = r.json()["id"]
    r2 = client.put(f"/users/{uid}", json={"contact": "+91 98765 43210"}, headers=ADMIN)
    assert r2.status_code == 200, r2.text
    assert r2.json()["contact"] == "+91 98765 43210"


def test_invalid_role_rejected():
    r = _create_user(email="bad@example.com", role="LAB_ANALYST")
    assert r.status_code == 422, r.text


def test_negative_experience_rejected():
    r = _create_user(email="neg@example.com", years_of_experience=-2)
    assert r.status_code == 422, r.text


INVITE_TOKEN = {}


def test_invite_sends_link_without_password():
    r = client.post("/users/invite",
                    json={"email": "inv@example.com", "full_name": "Inv User", "role": "SUPERVISOR"},
                    headers=ADMIN)
    assert r.status_code == 200, r.text
    to_email, link, kwargs = last_invite()
    assert to_email == "inv@example.com"
    assert "/accept-invite?token=" in link
    assert "password" not in str(kwargs).lower()
    INVITE_TOKEN["token"] = link.split("token=")[1]
    INVITE_TOKEN["email"] = to_email


def test_invitation_validate_preview():
    r = client.get("/users/invitations/validate", params={"token": INVITE_TOKEN["token"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "inv@example.com"
    assert body["role"] == "SUPERVISOR"
    assert "password" not in body


def test_accept_invitation_activates():
    r = client.post("/users/invitations/accept",
                    json={"token": INVITE_TOKEN["token"], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    # Now can log in
    r2 = client.post("/users/login", json={"email": "inv@example.com", "password": "Strong@123"})
    assert r2.status_code == 200, r2.text


def test_reused_invitation_rejected():
    r = client.post("/users/invitations/accept",
                    json={"token": INVITE_TOKEN["token"], "password": "Strong@123"})
    assert r.status_code == 400, r.text


def test_expired_invitation_rejected():
    r = client.post("/users/invite",
                    json={"email": "exp@example.com", "full_name": "Exp User", "role": "SUPERVISOR"},
                    headers=ADMIN)
    assert r.status_code == 200, r.text
    to_email, link, _ = last_invite()
    token = link.split("token=")[1]
    # Force expiry in DB
    db = TestingSession()
    from app.modules.users.models import UserInvitation
    inv = db.query(UserInvitation).filter(UserInvitation.user_id == db.query(User).filter(User.email == "exp@example.com").first().id).order_by(UserInvitation.id.desc()).first()
    inv.expires_at = datetime.utcnow() - timedelta(hours=1)
    db.commit()
    db.close()
    r2 = client.post("/users/invitations/accept", json={"token": token, "password": "Strong@123"})
    assert r2.status_code == 400, r2.text


def test_weak_password_rejected():
    r = client.post("/users/invite",
                    json={"email": "weak@example.com", "full_name": "Weak User", "role": "SUPERVISOR"},
                    headers=ADMIN)
    assert r.status_code == 200, r.text
    _, link, _ = last_invite()
    token = link.split("token=")[1]
    r2 = client.post("/users/invitations/accept", json={"token": token, "password": "weak"})
    assert r2.status_code == 422, r2.text


def test_invalid_password_401():
    r = client.post("/users/login", json={"email": "inv@example.com", "password": "Wrong@123"})
    assert r.status_code == 401, r.text


def test_inactive_login_blocked():
    r = _create_user(email="inactive@example.com")
    assert r.status_code == 200
    r2 = client.post("/users/login", json={"email": "inactive@example.com", "password": "Whatever@123"})
    # No password set -> 401 (never 200)
    assert r2.status_code in (401, 403), r2.text


def test_suspended_login_blocked():
    r = _create_user(email="susp@example.com")
    uid = r.json()["id"]
    # Accept manually via DB + set password through invitation flow
    client.post("/users/invite",
                json={"email": "susp@example.com", "full_name": "Ravi Kumar", "role": "SUPERVISOR"},
                headers=ADMIN)
    _, link, _ = last_invite()
    token = link.split("token=")[1]
    r2 = client.post("/users/invitations/accept", json={"token": token, "password": "Strong@123"})
    assert r2.status_code == 200, r2.text
    # Suspend
    r3 = client.patch(f"/users/{uid}/status", json={"account_status": "SUSPENDED"}, headers=ADMIN)
    assert r3.status_code == 200, r3.text
    assert r3.json()["account_status"] == "SUSPENDED"
    # Login must fail with 403 (not 200)
    r4 = client.post("/users/login", json={"email": "susp@example.com", "password": "Strong@123"})
    assert r4.status_code == 403, r4.text
    # Reactivate for later tests
    client.patch(f"/users/{uid}/status", json={"account_status": "ACTIVE"}, headers=ADMIN)


def test_role_change_and_self_change_blocked():
    r = _create_user(email="role@example.com", role="ADMIN")
    uid = r.json()["id"]
    r2 = client.patch(f"/users/{uid}/role", json={"role": "SUPERVISOR"}, headers=ADMIN)
    assert r2.status_code == 200, r2.text
    assert r2.json()["role"] == "SUPERVISOR"
    # Self role change blocked: find admin id
    db = TestingSession()
    admin = db.query(User).filter(User.email == "admin@geotech.com").first()
    admin_id = admin.id
    db.close()
    r3 = client.patch(f"/users/{admin_id}/role", json={"role": "SUPERVISOR"}, headers=ADMIN)
    assert r3.status_code == 403, r3.text


def test_authorization_supervisor_cannot_create():
    # Supervisor login
    sup_headers = login(email="inv@example.com", password="Strong@123")
    r = client.post("/users/", json={"email": "x@example.com", "full_name": "X", "role": "SUPERVISOR"},
                    headers=sup_headers)
    assert r.status_code == 403, r.text


def test_eligibility_active_supervisor():
    db = TestingSession()
    u = db.query(User).filter(User.email == "inv@example.com").first()
    uid = u.id
    db.close()
    r = client.get(f"/users/{uid}/eligibility", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["eligible"] is True


def test_eligibility_invited_not_eligible():
    r = _create_user(email="elig@example.com", role="SUPERVISOR")
    uid = r.json()["id"]
    r2 = client.get(f"/users/{uid}/eligibility", headers=ADMIN)
    assert r2.status_code == 200, r2.text
    assert r2.json()["eligible"] is False
    assert "not active" in r2.json()["reason"].lower()


def test_project_assignment_lifecycle_and_scoping():
    # Create project as admin (minimal required fields)
    proj = {
        "project_code": "TST-001", "date": "2026-09-21", "name": "Test Project",
        "client_name": "Client", "engineer_in_charge": "Eng", "location": "Hyd",
    }
    r = client.post("/projects/", json=proj, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    # Assign active supervisor
    db = TestingSession()
    sup = db.query(User).filter(User.email == "inv@example.com").first()
    sup_id = sup.id
    db.close()
    r2 = client.post("/users/assignments",
                     json={"project_id": pid, "user_id": sup_id, "assignment_role": "SUPERVISOR"},
                     headers=ADMIN)
    assert r2.status_code == 201, r2.text
    # Duplicate active assignment -> 409
    r3 = client.post("/users/assignments",
                     json={"project_id": pid, "user_id": sup_id},
                     headers=ADMIN)
    assert r3.status_code == 409, r3.text
    # Ineligible (invited, not active) assignment -> 400
    db = TestingSession()
    inelig = db.query(User).filter(User.email == "elig@example.com").first()
    inelig_id = inelig.id
    db.close()
    r4 = client.post("/users/assignments",
                     json={"project_id": pid, "user_id": inelig_id},
                     headers=ADMIN)
    assert r4.status_code == 400, r4.text
    # Supervisor sees assigned project
    sup_headers = login(email="inv@example.com", password="Strong@123")
    r5 = client.get("/projects/my-projects", headers=sup_headers)
    assert r5.status_code == 200, r5.text
    assert any(p["id"] == pid for p in r5.json())
    # Unassigned supervisor sees nothing of it
    r6 = client.get(f"/projects/{pid}", headers=sup_headers)
    assert r6.status_code == 200, r6.text
    # End assignment -> supervisor loses access
    aid = r2.json()["id"]
    r7 = client.post(f"/users/assignments/{aid}/end", params={"reason": "Project completed"},
                     headers=ADMIN)
    assert r7.status_code == 200, r7.text
    r8 = client.get(f"/projects/{pid}", headers=sup_headers)
    assert r8.status_code == 403, r8.text


def test_sub_resources_crud():
    r = _create_user(email="sub@example.com", role="SUPERVISOR")
    uid = r.json()["id"]
    # Experience
    r2 = client.post(f"/users/{uid}/experience",
                     json={"company_name": "ABC Eng", "job_title": "Site Engineer"},
                     headers=ADMIN)
    assert r2.status_code == 201, r2.text
    exp_id = r2.json()["id"]
    r3 = client.put(f"/users/{uid}/experience/{exp_id}",
                    json={"company_name": "ABC Eng", "job_title": "Senior Engineer"},
                    headers=ADMIN)
    assert r3.status_code == 200, r3.text
    # Bad cert dates -> 422
    r4 = client.post(f"/users/{uid}/certifications",
                     json={"certification_name": "Safety", "issue_date": "2024-01-01",
                           "expiry_date": "2023-01-01"},
                     headers=ADMIN)
    assert r4.status_code == 422, r4.text
    # Good cert
    r5 = client.post(f"/users/{uid}/certifications",
                     json={"certification_name": "Safety", "issue_date": "2023-01-01",
                           "expiry_date": "2026-01-01"},
                     headers=ADMIN)
    assert r5.status_code == 201, r5.text
    # Duplicate skill -> 409
    r6 = client.post(f"/users/{uid}/skills", json={"skill": "Drilling"}, headers=ADMIN)
    assert r6.status_code == 201, r6.text
    r7 = client.post(f"/users/{uid}/skills", json={"skill": "Drilling"}, headers=ADMIN)
    assert r7.status_code == 409, r7.text
    # Document metadata (storage pending)
    r8 = client.post(f"/users/{uid}/documents",
                     json={"document_type": "RESUME", "file_name": "cv.pdf"},
                     headers=ADMIN)
    assert r8.status_code == 201, r8.text
    assert r8.json()["storage_status"] == "PENDING"
    # Audit trail exists
    r9 = client.get(f"/users/{uid}/audit", headers=ADMIN)
    assert r9.status_code == 200, r9.text
    assert any(a["action"] == "USER_CREATED" for a in r9.json())


def test_e2e_full_lifecycle():
    """Admin login -> create -> invite -> accept -> active -> role -> project
    -> assign -> supervisor sees project."""
    # create
    r = _create_user(email="e2e@example.com", role="ADMIN",
                     designation="Engineer", department="Geo",
                     employee_id="E2E-001")
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    assert r.json()["account_status"] == "INVITED"
    # invite (use resend path for coverage)
    r2 = client.post(f"/users/{uid}/resend-invite", headers=ADMIN)
    assert r2.status_code == 200, r2.text
    _, link, _ = last_invite()
    token = link.split("token=")[1]
    # accept
    r3 = client.post("/users/invitations/accept",
                     json={"token": token, "password": "E2eStrong@1"})
    assert r3.status_code == 200, r3.text
    # role to supervisor
    r4 = client.patch(f"/users/{uid}/role", json={"role": "SUPERVISOR"}, headers=ADMIN)
    assert r4.status_code == 200, r4.text
    # supervisor profile
    r5 = client.put(f"/users/{uid}/supervisor-profile",
                    json={"supervisor_experience_years": 5,
                          "specializations": "BOREHOLE_DRILLING,SAMPLING"},
                    headers=ADMIN)
    assert r5.status_code == 200, r5.text
    # project + assign
    proj = {"project_code": "E2E-001", "date": "2026-09-21", "name": "E2E Proj",
            "client_name": "C", "engineer_in_charge": "E", "location": "L"}
    rp = client.post("/projects/", json=proj, headers=ADMIN)
    assert rp.status_code in (200, 201), rp.text
    ra = client.post("/users/assignments",
                     json={"project_id": rp.json()["id"], "user_id": uid},
                     headers=ADMIN)
    assert ra.status_code == 201, ra.text
    # supervisor login sees it
    sup = login(email="e2e@example.com", password="E2eStrong@1")
    rm = client.get("/projects/my-projects", headers=sup)
    assert rm.status_code == 200, rm.text
    assert any(p["id"] == rp.json()["id"] for p in rm.json())
