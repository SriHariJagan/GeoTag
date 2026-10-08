"""Vendors V3 backend tests."""
import os
from datetime import datetime

import pytest
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)
from app.core.security import hash_password


ADMIN = login()
VID = {}


def test_create_vendor_and_backfill():
    r = client.post("/vendors/", json={
        "vendor_company": "Sai Transport", "vendor_code": "V-001",
        "contact_person": "Ravi", "phone": "+91 9000000001",
        "service_categories": "TRANSPORTATION,DRILLING",
        "years_of_experience": 5,
    }, headers=ADMIN)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ACTIVE"
    assert body["legal_business_name"] == "Sai Transport"
    assert body["compliance_overdue"] is False
    VID["id"] = body["id"]


def test_duplicate_vendor_code_409():
    r = client.post("/vendors/", json={"vendor_company": "Dup", "vendor_code": "V-001"},
                    headers=ADMIN)
    assert r.status_code == 409, r.text


def test_invalid_status_and_category_422():
    r = client.post("/vendors/", json={"vendor_company": "Bad", "status": "NOPE"},
                    headers=ADMIN)
    assert r.status_code == 422, r.text
    r = client.post("/vendors/", json={"vendor_company": "Bad", "service_categories": "NOPE"},
                    headers=ADMIN)
    assert r.status_code == 422, r.text


def test_public_list_now_gated():
    r = client.get("/vendors/")
    assert r.status_code in (401, 403), r.text


def test_search_filter_pagination():
    client.post("/vendors/", json={"vendor_company": "Alpha Drilling", "status": "ACTIVE"},
                headers=ADMIN)
    r = client.get("/vendors/", params={"search": "alpha"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    assert any("Alpha" in (v["legal_business_name"] or v["vendor_company"] or "")
               for v in r.json())
    r = client.get("/vendors/", params={"limit": 1, "offset": 0}, headers=ADMIN)
    assert len(r.json()) == 1


def test_update_and_status_change_with_audit():
    vid = VID["id"]
    r = client.put(f"/vendors/{vid}", json={"city": "Hyderabad", "rating": 4.5},
                   headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["city"] == "Hyderabad"
    r = client.patch(f"/vendors/{vid}/status", json={"status": "SUSPENDED"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SUSPENDED"
    r = client.get(f"/vendors/{vid}/audit", headers=ADMIN)
    assert r.status_code == 200, r.text
    actions = [a["action"] for a in r.json()]
    assert "VENDOR_CREATED" in actions and "VENDOR_STATUS_CHANGED" in actions
    client.patch(f"/vendors/{vid}/status", json={"status": "ACTIVE"}, headers=ADMIN)


def test_child_crud_and_validation():
    vid = VID["id"]
    r = client.post(f"/vendors/{vid}/contacts", json={"name": "Ops Lead"}, headers=ADMIN)
    assert r.status_code == 201, r.text
    r = client.post(f"/vendors/{vid}/capabilities", json={"category": "NOPE"}, headers=ADMIN)
    assert r.status_code == 422, r.text
    r = client.post(f"/vendors/{vid}/capabilities", json={"category": "DRILLING"},
                    headers=ADMIN)
    assert r.status_code == 201, r.text
    r = client.post(f"/vendors/{vid}/certifications",
                    json={"certification_name": "ISO", "issue_date": "2024-01-01",
                          "expiry_date": "2020-01-01"}, headers=ADMIN)
    assert r.status_code == 422, r.text
    r = client.post(f"/vendors/{vid}/certifications",
                    json={"certification_name": "ISO", "issue_date": "2024-01-01",
                          "expiry_date": "2020-01-01".replace("2020", "2027")},
                    headers=ADMIN)
    assert r.status_code == 201, r.text
    r = client.post(f"/vendors/{vid}/equipment",
                    json={"equipment_type": "Rig", "equipment_name": "Rig-1", "quantity": 0},
                    headers=ADMIN)
    assert r.status_code == 422, r.text
    r = client.post(f"/vendors/{vid}/documents",
                    json={"document_type": "PROFILE", "file_name": "p.pdf"}, headers=ADMIN)
    assert r.status_code == 201, r.text
    assert r.json()["storage_status"] == "PENDING"
    r = client.get(f"/vendors/{vid}/contacts", headers=ADMIN)
    assert r.status_code == 200 and len(r.json()) == 1, r.text


def test_vendor_user_link_and_portal_scoping():
    # create + activate a vendor-role user via real invite flow
    r = client.post("/users/", json={"email": "vend@example.com", "full_name": "Vend User",
                                     "role": "VENDOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    client.post("/users/invite", json={"email": "vend@example.com",
                                       "full_name": "Vend User", "role": "VENDOR"},
                headers=ADMIN)
    _to, link, _kw = last_invite()
    token = link.split("token=")[1]
    r = client.post("/users/invitations/accept",
                    json={"token": token, "password": "Strong@123"})
    assert r.status_code == 200, r.text
    # link to vendor
    r = client.post(f"/vendors/{VID['id']}/users", json={"user_id": uid, "org_role": "OWNER"},
                    headers=ADMIN)
    assert r.status_code == 200, r.text
    # duplicate link 409
    r = client.post(f"/vendors/{VID['id']}/users", json={"user_id": uid}, headers=ADMIN)
    assert r.status_code == 409, r.text
    # vendor portal: sees own, not others
    vh = login("vend@example.com", "Strong@123")
    r = client.get("/vendors/", headers=vh)
    assert r.status_code == 200, r.text
    assert [v["id"] for v in r.json()] == [VID["id"]]
    others = [v for v in client.get("/vendors/", headers=ADMIN).json()
              if v["id"] != VID["id"]]
    assert others, "need a second vendor for isolation check"
    r = client.get(f"/vendors/{others[0]['id']}", headers=vh)
    assert r.status_code == 403, r.text
    # vendor cannot create vendors
    r = client.post("/vendors/", json={"vendor_company": "Nope"}, headers=vh)
    assert r.status_code == 403, r.text


def test_supervisor_cannot_manage_vendors():
    r = client.post("/users/", json={"email": "sup@example.com", "full_name": "Sup",
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    uid = r.json()["id"]
    db = TestingSession()
    u = db.query(User).filter(User.id == uid).first()
    u.account_status = "ACTIVE"
    u.is_active = True
    u.hashed_password = hash_password("Strong@123")
    u.invite_accepted_at = __import__("datetime").datetime.utcnow()
    db.commit()
    db.close()
    sh = login("sup@example.com", "Strong@123")
    r = client.post("/vendors/", json={"vendor_company": "Nope"}, headers=sh)
    assert r.status_code == 403, r.text
    # Supervisors see only vendors of their assigned projects (none here)
    r = client.get("/vendors/", headers=sh)
    assert r.status_code == 200 and r.json() == [], r.text


def test_delete_blocked_with_project_link():
    p = client.post("/projects/", json={
        "project_code": "VDEL-001", "date": "2026-09-21", "name": "Del Proj",
        "client_name": "C", "engineer_in_charge": "E", "location": "L",
        "vendor_ids": [VID["id"]]}, headers=ADMIN)
    assert p.status_code == 200, p.text
    pid = p.json()["id"]
    r = client.delete(f"/vendors/{VID['id']}", headers=ADMIN)
    assert r.status_code == 409, r.text
    assert "project" in r.json()["detail"].lower()
    client.delete(f"/projects/{pid}", headers=ADMIN)
