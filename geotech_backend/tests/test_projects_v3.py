"""Projects V3 backend tests: descriptors, lifecycle, primary assignment."""
import os

import pytest
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)


ADMIN = login()


def _active_supervisor(email, name="Sup C"):
    r = client.post("/users/", json={"email": email, "full_name": name,
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    client.post("/users/invite", json={"email": email, "full_name": name,
                                       "role": "SUPERVISOR"}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    return uid


def test_project_create_with_descriptors_and_admin_write():
    # ADMIN (not superadmin) can create + update, but not delete
    r = client.post("/users/", json={"email": "adm3@example.com", "full_name": "Adm",
                                     "role": "ADMIN"}, headers=ADMIN)
    uid = r.json()["id"]
    db = TestingSession()
    u = db.query(User).filter(User.id == uid).first()
    u.account_status = "ACTIVE"
    u.is_active = True
    from app.core.security import hash_password
    import datetime
    u.hashed_password = hash_password("Strong@123")
    u.invite_accepted_at = datetime.datetime.utcnow()
    db.commit()
    db.close()
    ah = login("adm3@example.com", "Strong@123")
    r = client.post("/projects/", json={
        "project_code": "V3P-001", "date": "2026-09-21", "name": "V3 Project",
        "client_name": "C", "engineer_in_charge": "E", "location": "L",
        "description": "Deep boreholes", "project_type": "INVESTIGATION",
        "priority": "HIGH", "currency": "INR"}, headers=ah)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["description"] == "Deep boreholes"
    assert body["priority"] == "HIGH"
    pid = body["id"]
    r = client.put(f"/projects/{pid}", json={"priority": "CRITICAL"}, headers=ah)
    assert r.status_code == 200 and r.json()["priority"] == "CRITICAL", r.text
    r = client.delete(f"/projects/{pid}", headers=ah)
    assert r.status_code == 403, r.text
    r = client.put(f"/projects/{pid}", json={"priority": "NOPE"}, headers=ADMIN)
    assert r.status_code == 422, r.text  # request-time enum validation
    client.delete(f"/projects/{pid}", headers=ADMIN)


def test_project_status_lifecycle():
    r = client.post("/projects/", json={
        "project_code": "V3P-002", "date": "2026-09-21", "name": "Lifecycle",
        "client_name": "C", "engineer_in_charge": "E", "location": "L"}, headers=ADMIN)
    pid = r.json()["id"]
    # legacy "Not Started" treated as DRAFT: DRAFT -> ACTIVE invalid
    r = client.patch(f"/projects/{pid}/status", json={"status": "ACTIVE"}, headers=ADMIN)
    assert r.status_code == 409, r.text
    # valid chain
    for st in ["PLANNED", "ACTIVE", "ON_HOLD", "ACTIVE", "COMPLETED", "CLOSED"]:
        r = client.patch(f"/projects/{pid}/status", json={"status": st}, headers=ADMIN)
        assert r.status_code == 200, (st, r.text)
        assert r.json()["status"] == st
    # terminal: CLOSED -> ACTIVE rejected
    r = client.patch(f"/projects/{pid}/status", json={"status": "ACTIVE"}, headers=ADMIN)
    assert r.status_code == 409, r.text
    # unknown status 422
    r = client.patch(f"/projects/{pid}/status", json={"status": "NOPE"}, headers=ADMIN)
    assert r.status_code == 422, r.text
    client.delete(f"/projects/{pid}", headers=ADMIN)


def test_primary_supervisor_assignment():
    s1 = _active_supervisor("prim1@example.com")
    s2 = _active_supervisor("prim2@example.com")
    r = client.post("/projects/", json={
        "project_code": "V3P-003", "date": "2026-09-21", "name": "Prim Proj",
        "client_name": "C", "engineer_in_charge": "E", "location": "L"}, headers=ADMIN)
    pid = r.json()["id"]
    r = client.post("/users/assignments",
                    json={"project_id": pid, "user_id": s1, "is_primary": True,
                          "notes": "Lead"}, headers=ADMIN)
    assert r.status_code == 201, r.text
    assert r.json()["is_primary"] is True
    # second primary rejected
    r = client.post("/users/assignments",
                    json={"project_id": pid, "user_id": s2, "is_primary": True},
                    headers=ADMIN)
    assert r.status_code == 409, r.text
    # non-primary ok
    r = client.post("/users/assignments",
                    json={"project_id": pid, "user_id": s2}, headers=ADMIN)
    assert r.status_code == 201, r.text
    # bad dates rejected
    r = client.post("/users/assignments",
                    json={"project_id": pid, "user_id": s2,
                          "start_date": "2026-10-01", "end_date": "2026-09-01"},
                    headers=ADMIN)
    assert r.status_code == 422, r.text
    # assignment listing exposes is_primary
    r = client.get(f"/projects/{pid}/assignments", headers=ADMIN)
    assert r.status_code == 200, r.text
    primaries = [a for a in r.json() if a["is_primary"]]
    assert len(primaries) == 1 and primaries[0]["user_id"] == s1
    client.delete(f"/projects/{pid}", headers=ADMIN)
