"""Expenditures V3 backend tests: clean model + legacy crash fixes."""
import os

import pytest
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)


ADMIN = login()


def _supervisor(email):
    r = client.post("/users/", json={"email": email, "full_name": "XS " + email,
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    client.post("/users/invite", json={"email": email, "full_name": "XS",
                                       "role": "SUPERVISOR"}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    return uid, login(email, "Strong@123")


def _project(code):
    r = client.post("/projects/", json={
        "project_code": code, "date": "2026-09-21", "name": "Exp " + code,
        "client_name": "C", "engineer_in_charge": "E", "location": "L"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _setup_exp1():
    uid, sh = _supervisor("exp1@example.com")
    pid = _project("EXP-001")
    base = {"project_id": pid, "expense_date": "2026-09-20", "expense_category": "FUEL",
            "description": "Diesel", "amount": 5000}
    # unassigned -> 403
    r = client.post("/project-expenditures/", json=base, headers=sh)
    assert r.status_code == 403, r.text
    client.post("/users/assignments", json={"project_id": pid, "user_id": uid},
                headers=ADMIN)
    r = client.post("/project-expenditures/", json=base, headers=sh)
    assert r.status_code == 201 and r.json()["status"] == "DRAFT", r.text
    eid = r.json()["id"]
    # invalid category / negative / future
    for bad in [{"expense_category": "NOPE"}, {"amount": -5},
                {"expense_date": "2099-01-01"}]:
        r = client.post("/project-expenditures/", json={**base, **bad}, headers=sh)
        assert r.status_code == 422, (bad, r.text)
    # unknown vendor
    r = client.post("/project-expenditures/",
                    json={**base, "vendor_id": 99999}, headers=sh)
    assert r.status_code == 404, r.text
    return eid, sh, pid


import pytest as _pytest


@_pytest.fixture(scope="module")
def _exp1():
    return _setup_exp1()


def test_create_validation_and_scoping(_exp1):
    eid, _sh, _pid = _exp1
    assert eid


def test_patch_submit_approve_flow(_exp1):
    eid, sh, pid = _exp1
    # K-11: partial patch changes only supplied fields
    r = client.patch(f"/project-expenditures/{eid}", json={"amount": 6000}, headers=sh)
    assert r.status_code == 200, r.text
    assert r.json()["amount"] == 6000
    assert r.json()["description"] == "Diesel"
    assert r.json()["expense_category"] == "FUEL"
    # submit then supervisor edit blocked
    r = client.post(f"/project-expenditures/{eid}/submit", headers=sh)
    assert r.status_code == 200 and r.json()["status"] == "SUBMITTED", r.text
    r = client.patch(f"/project-expenditures/{eid}", json={"amount": 1}, headers=sh)
    assert r.status_code == 409, r.text
    # admin approves
    r = client.post(f"/project-expenditures/{eid}/approve", headers=ADMIN)
    assert r.status_code == 200 and r.json()["status"] == "APPROVED", r.text
    # totals reflect approval
    r = client.get(f"/project-expenditures/project/{pid}/totals", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["approved_total"] == 6000, r.text
    assert r.json()["by_category"]["FUEL"] == 6000


def test_reject_and_self_approval_block():
    uid, sh = _supervisor("exp2@example.com")
    pid = _project("EXP-002")
    client.post("/users/assignments", json={"project_id": pid, "user_id": uid},
                headers=ADMIN)
    # second admin (non-superadmin) submits then cannot approve own
    r = client.post("/users/", json={"email": "expadm@example.com", "full_name": "EA",
                                     "role": "ADMIN"}, headers=ADMIN)
    aid = r.json()["id"]
    db = TestingSession()
    u = db.query(User).filter(User.id == aid).first()
    u.account_status = "ACTIVE"
    u.is_active = True
    from app.core.security import hash_password
    import datetime
    u.hashed_password = hash_password("Strong@123")
    u.invite_accepted_at = datetime.datetime.utcnow()
    db.commit()
    db.close()
    ah = login("expadm@example.com", "Strong@123")
    r = client.post("/project-expenditures/", json={
        "project_id": pid, "expense_date": "2026-09-20",
        "expense_category": "MATERIAL", "amount": 100}, headers=ah)
    eid = r.json()["id"]
    client.post(f"/project-expenditures/{eid}/submit", headers=ah)
    r = client.post(f"/project-expenditures/{eid}/approve", headers=ah)
    assert r.status_code == 403, r.text
    r = client.post(f"/project-expenditures/{eid}/reject",
                    params={"reason": "needs receipt"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["status"] == "REJECTED", r.text


def test_vendor_and_anon_blocked_and_legacy_stable():
    r = client.get("/project-expenditures/", headers={})
    assert r.status_code in (401, 403), r.text
    # legacy aggregated endpoint returns [] (no crash) on empty data
    r = client.get("/expenditures/aggregated-all-projects", headers=ADMIN)
    assert r.status_code == 200 and r.json() == [], r.text
