"""Phase E backend tests: vendor project visibility + isolation of internals."""
import os

import pytest
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)


ADMIN = login()


def _vendor_user(email, vendor_id):
    r = client.post("/users/", json={"email": email, "full_name": "VE " + email,
                                     "role": "VENDOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    client.post("/users/invite", json={"email": email, "full_name": "VE",
                                       "role": "VENDOR"}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    db = TestingSession()
    uid = db.query(User).filter(User.email == email).first().id
    db.close()
    r = client.post(f"/vendors/{vendor_id}/users",
                    json={"user_id": uid},
                    headers=ADMIN)
    assert r.status_code == 200, r.text
    return login(email, "Strong@123")


def test_vendor_project_visibility_and_internal_stripping():
    va = client.post("/vendors/", json={"vendor_company": "E Vendor A",
                                        "vendor_code": "E-001"}, headers=ADMIN).json()["id"]
    vb = client.post("/vendors/", json={"vendor_company": "E Vendor B",
                                        "vendor_code": "E-002"}, headers=ADMIN).json()["id"]
    ha = _vendor_user("ea@example.com", va)
    hb = _vendor_user("eb@example.com", vb)
    pid = client.post("/projects/", json={
        "project_code": "EP-001", "date": "2026-09-21", "name": "E Proj",
        "client_name": "C", "engineer_in_charge": "E", "location": "L"},
        headers=ADMIN).json()["id"]

    # No assignment yet: vendor sees nothing
    r = client.get("/projects/my-projects", headers=ha)
    assert r.status_code == 200 and r.json() == [], r.text
    r = client.get(f"/projects/{pid}", headers=ha)
    assert r.status_code == 403, r.text

    # Full chain: RFQ -> quotes -> award -> WO -> accept
    rfq = client.post("/rfqs", json={
        "project_id": pid, "title": "Works",
        "items": [{"description": "Item", "quantity": 2, "unit": "lot"}]},
        headers=ADMIN).json()
    client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [va, vb]}, headers=ADMIN)
    qa = client.post("/quotations", json={
        "rfq_id": rfq["id"], "vendor_id": va,
        "items": [{"description": "Item", "quantity": 2, "unit_rate": 100}]},
        headers=ha).json()
    client.post(f"/quotations/{qa['id']}/evaluate",
                json={"technical_score": 70, "evaluation_notes": "SECRET-NOTE"},
                headers=ADMIN)
    client.post(f"/rfqs/{rfq['id']}/award",
                json={"quotation_id": qa["id"], "award_reason": "ok",
                      "internal_notes": "SECRET-AWARD"}, headers=ADMIN)
    wo = client.post("/work-orders", json={
        "project_id": pid, "vendor_id": va, "quotation_id": qa["id"]},
        headers=ADMIN).json()
    client.post(f"/work-orders/{wo['id']}/issue", headers=ADMIN)
    client.post(f"/work-orders/{wo['id']}/accept", headers=ha)

    # Vendor A now sees the project; B does not
    r = client.get("/projects/my-projects", headers=ha)
    assert any(p["id"] == pid for p in r.json()), r.text
    r = client.get(f"/projects/{pid}", headers=ha)
    assert r.status_code == 200, r.text
    r = client.get("/projects/my-projects", headers=hb)
    assert all(p["id"] != pid for p in r.json()), r.text
    r = client.get(f"/projects/{pid}", headers=hb)
    assert r.status_code == 403, r.text

    # Internals stripped: vendor quotation read exposes no evaluation content
    r = client.get(f"/quotations/{qa['id']}", headers=ha)
    assert r.status_code == 200, r.text
    ev = r.json()["evaluation"]
    assert ev and ev.get("evaluation_notes") is None, ev
    assert ev.get("overall_score") == 70.0  # scores visible, notes not
    # award endpoint is admin-only
    r = client.get(f"/rfqs/{rfq['id']}/award", headers=ha)
    assert r.status_code == 403, r.text
    # vendor B cannot read A's quotation at all
    r = client.get(f"/quotations/{qa['id']}", headers=hb)
    assert r.status_code == 403, r.text

    # Supervisor of the project can list vendor assignments
    r = client.post("/users/", json={"email": "esup@example.com", "full_name": "ES",
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    sid = r.json()["id"]
    db = TestingSession()
    u = db.query(User).filter(User.id == sid).first()
    u.account_status = "ACTIVE"
    u.is_active = True
    from app.core.security import hash_password
    import datetime
    u.hashed_password = hash_password("Strong@123")
    u.invite_accepted_at = datetime.datetime.utcnow()
    db.commit()
    db.close()
    client.post("/users/assignments", json={"project_id": pid, "user_id": sid},
                headers=ADMIN)
    sh = login("esup@example.com", "Strong@123")
    r = client.get("/project-vendor-assignments", params={"project_id": pid},
                   headers=sh)
    assert r.status_code == 200 and len(r.json()) == 1, r.text
