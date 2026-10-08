"""DER V3 backend tests: detail fix, uniqueness, children, submit flow."""
import os

import pytest
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)


ADMIN = login()
SID = {}


def _supervisor(email):
    r = client.post("/users/", json={"email": email, "full_name": "DS " + email,
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    client.post("/users/invite", json={"email": email, "full_name": "DS",
                                       "role": "SUPERVISOR"}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    return uid, login(email, "Strong@123")


def _project(code):
    r = client.post("/projects/", json={
        "project_code": code, "date": "2026-09-21", "name": "DER " + code,
        "client_name": "C", "engineer_in_charge": "E", "location": "L"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _payload(pid, **over):
    p = {"project_id": pid, "borehole_started": "BH-1", "borehole_ended": "BH-2",
         "site_location": "Site A", "borehole_no": "1", "rig_no": "R1",
         "type_of_rig": "Rotary", "chainage": "0+100",
         "client": "C", "client_person_name": "P", "client_person_designation": "E",
         "report_date": "2026-09-20", "soil_depth": 5, "soft_rock_depth": 3,
         "hard_rock_depth": 2}
    p.update(over)
    return p


def test_der_create_detail_and_uniqueness():
    uid, sh = _supervisor("der1@example.com")
    pid = _project("DER-001")
    client.post("/users/assignments", json={"project_id": pid, "user_id": uid},
                headers=ADMIN)
    r = client.post("/daily-execution/", json=_payload(pid), headers=sh)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_depth"] == 10
    assert body["status"] == "SUBMITTED"
    rid = body["id"]
    # detail endpoint works with scoping (K-02 fixed)
    r = client.get(f"/daily-execution/{rid}", headers=sh)
    assert r.status_code == 200 and r.json()["id"] == rid, r.text
    # duplicate same-day submit -> 409 (was silent overwrite)
    r = client.post("/daily-execution/", json=_payload(pid), headers=sh)
    assert r.status_code == 409, r.text
    # future date rejected
    r = client.post("/daily-execution/", json=_payload(pid, report_date="2099-01-01"),
                    headers=sh)
    assert r.status_code == 422, r.text
    SID["rid"] = rid
    SID["pid"] = pid
    SID["sh"] = sh
    SID["uid"] = uid


def test_der_unassigned_supervisor_blocked():
    _uid2, sh2 = _supervisor("der2@example.com")
    r = client.post("/daily-execution/", json=_payload(SID["pid"]), headers=sh2)
    assert r.status_code == 403, r.text
    r = client.get(f"/daily-execution/{SID['rid']}", headers=sh2)
    assert r.status_code == 404, r.text  # scoped out: not found (no leak)


def test_der_draft_submit_and_child_rows():
    uid, sh = _supervisor("der3@example.com")
    pid = _project("DER-002")
    client.post("/users/assignments", json={"project_id": pid, "user_id": uid},
                headers=ADMIN)
    # link a vendor to the project for activity validation
    vid = client.post("/vendors/", json={"vendor_company": "DER Vend",
                                         "vendor_code": "DERV-1"},
                      headers=ADMIN).json()["id"]
    client.put(f"/projects/{pid}", json={"vendor_ids": [vid]}, headers=ADMIN)
    r = client.post("/daily-execution/",
                    json=_payload(pid, report_date="2026-09-19", status="DRAFT"),
                    headers=sh)
    assert r.status_code == 200 and r.json()["status"] == "DRAFT", r.text
    rid = r.json()["id"]
    # child rows on draft
    r = client.post(f"/daily-execution/{rid}/manpower",
                    json={"category": "Labor", "role": "Helper",
                          "planned_count": 5, "actual_count": 4, "hours": 8},
                    headers=sh)
    assert r.status_code == 201, r.text
    r = client.post(f"/daily-execution/{rid}/equipment",
                    json={"equipment_name": "Rig R1", "quantity": 1, "hours_used": 6},
                    headers=sh)
    assert r.status_code == 201, r.text
    # unknown vendor rejected; unassigned vendor rejected
    r = client.post(f"/daily-execution/{rid}/vendor-activity",
                    json={"vendor_id": 99999, "activity": "x"}, headers=sh)
    assert r.status_code == 404, r.text
    other = client.post("/vendors/", json={"vendor_company": "Other",
                                           "vendor_code": "DERV-2"},
                        headers=ADMIN).json()["id"]
    r = client.post(f"/daily-execution/{rid}/vendor-activity",
                    json={"vendor_id": other, "activity": "x"}, headers=sh)
    assert r.status_code == 422, r.text
    r = client.post(f"/daily-execution/{rid}/vendor-activity",
                    json={"vendor_id": vid, "activity": "Drilling",
                          "quantity_completed": 5}, headers=sh)
    assert r.status_code == 201, r.text
    # submit, then supervisor edit blocked; admin edit allowed
    r = client.post(f"/daily-execution/{rid}/submit", headers=sh)
    assert r.status_code == 200 and r.json()["status"] == "SUBMITTED", r.text
    r = client.put(f"/daily-execution/{rid}", json={"remarks": "late edit"}, headers=sh)
    assert r.status_code == 409, r.text
    r = client.put(f"/daily-execution/{rid}", json={"remarks": "admin edit"},
                   headers=ADMIN)
    assert r.status_code == 200, r.text
    # detail exposes children
    r = client.get(f"/daily-execution/{rid}", headers=ADMIN)
    assert len(r.json()["manpower"]) == 1, r.text
    assert len(r.json()["equipment"]) == 1
    assert len(r.json()["vendor_activity"]) == 1


def test_der_filtering_and_pagination():
    sh = SID["sh"]
    r = client.get("/daily-execution/",
                   params={"page": 1, "limit": 10, "project_id": SID["pid"]},
                   headers=sh)
    assert r.status_code == 200, r.text
    assert all(x["project_id"] == SID["pid"] for x in r.json())
    r = client.get("/daily-execution/",
                   params={"page": 1, "limit": 10, "report_date": "2026-09-20"},
                   headers=ADMIN)
    assert r.status_code == 200 and len(r.json()) >= 1, r.text
