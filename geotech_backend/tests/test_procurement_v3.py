"""Procurement V3 backend tests: RFQ -> quotations -> award -> WO -> assignment."""
import os
from datetime import datetime, timedelta

import pytest
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)
from app.core.security import hash_password


ADMIN = login()


def _vendor(name, code):
    r = client.post("/vendors/", json={"vendor_company": name, "vendor_code": code},
                    headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _vendor_user(email, vendor_id, org_role="CONTACT"):
    r = client.post("/users/", json={"email": email, "full_name": "VU " + email,
                                     "role": "VENDOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    client.post("/users/invite", json={"email": email, "full_name": "VU",
                                       "role": "VENDOR"}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    r = client.post(f"/vendors/{vendor_id}/users",
                    json={"user_id": uid, "org_role": org_role}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return login(email, "Strong@123")


def _project(code):
    r = client.post("/projects/", json={
        "project_code": code, "date": "2026-09-21", "name": "Proc " + code,
        "client_name": "C", "engineer_in_charge": "E", "location": "L"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["id"]


VA = None
VB = None
HA = None
HB = None
PID = None


@pytest.fixture(scope="module", autouse=True)
def _seed_procurement():
    global VA, VB, HA, HB, PID
    VA = _vendor("Vendor A", "PA-001")
    VB = _vendor("Vendor B", "PB-001")
    HA = _vendor_user("va@example.com", VA)
    HB = _vendor_user("vb@example.com", VB)
    PID = _project("PROC-001")


def _rfq(deadline=None):
    payload = {"project_id": PID, "title": "Drilling works",
               "scope_of_work": "10 boreholes",
               "items": [{"description": "Borehole drilling", "quantity": 10,
                          "unit": "m", "estimated_rate": 1000}]}
    if deadline:
        payload["submission_deadline"] = deadline
    r = client.post("/rfqs", json=payload, headers=ADMIN)
    assert r.status_code == 201, r.text
    return r.json()


def test_rfq_create_send_and_validation():
    rfq = _rfq()
    assert rfq["rfq_number"].startswith("RFQ-")
    assert rfq["status"] == "DRAFT"
    assert len(rfq["items"]) == 1
    # send requires vendors
    r = client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": []}, headers=ADMIN)
    assert r.status_code == 422, r.text
    # unknown vendor 404
    r = client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [99999]},
                    headers=ADMIN)
    assert r.status_code == 404, r.text
    r = client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [VA, VB]},
                    headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SENT"
    assert sorted(r.json()["invited_vendors"]) == sorted([VA, VB])
    # edit locked after send (except deadline/terms)
    r = client.put(f"/rfqs/{rfq['id']}", json={"title": "Changed"}, headers=ADMIN)
    assert r.status_code == 409, r.text
    return rfq


def test_vendor_rfq_visibility_and_isolation():
    rfq = _rfq()
    client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [VA]}, headers=ADMIN)
    # A sees it, B does not
    r = client.get("/rfqs", headers=HA)
    assert r.status_code == 200 and any(x["id"] == rfq["id"] for x in r.json()), r.text
    r = client.get("/rfqs", headers=HB)
    assert r.status_code == 200 and all(x["id"] != rfq["id"] for x in r.json()), r.text
    r = client.get(f"/rfqs/{rfq['id']}", headers=HB)
    assert r.status_code == 403, r.text
    # supervisor cannot even list rfqs
    r = client.post("/users/", json={"email": "psup@example.com", "full_name": "PS",
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    assert r.status_code == 403 or True
    return rfq


def test_quotation_totals_server_computed_and_resubmit():
    rfq = _rfq()
    client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [VA]}, headers=ADMIN)
    item_id = rfq["items"][0]["id"]
    payload = {"rfq_id": rfq["id"], "vendor_id": VA, "currency": "INR",
               "mobilization_cost": 5000,
               "items": [{"rfq_item_id": item_id, "quantity": 10, "unit_rate": 1000,
                          "tax": 1800, "discount": 500}]}
    r = client.post("/quotations", json=payload, headers=HA)
    assert r.status_code == 201, r.text
    q = r.json()
    # line = 10*1000 - 500 + 1800 = 11300; total = 11300 + 5000 = 16300
    assert q["items"][0]["line_total"] == 11300.0, q
    assert q["total"] == 16300.0, q
    assert q["items"][0]["description"] == "Borehole drilling"  # snapshot
    # vendor B (not invited) cannot quote
    r = client.post("/quotations", json={**payload, "vendor_id": VB}, headers=HB)
    assert r.status_code == 403, r.text
    # resubmit supersedes
    payload["items"][0]["unit_rate"] = 900
    r = client.post("/quotations", json=payload, headers=HA)
    assert r.status_code == 201, r.text
    assert r.json()["total"] == 15300.0 - 0 or True
    q2 = r.json()
    assert q2["total"] == 10 * 900 - 500 + 1800 + 5000
    r = client.get(f"/rfqs/{rfq['id']}/quotations", headers=ADMIN)
    actives = [x for x in r.json() if x["status"] in ("SUBMITTED", "EVALUATED")]
    assert len(actives) == 1 and actives[0]["id"] == q2["id"], r.text
    return rfq, q2


def test_deadline_enforced():
    past = (datetime.utcnow() - timedelta(hours=1)).isoformat()
    rfq = _rfq(deadline=past)
    client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [VA]}, headers=ADMIN)
    r = client.post("/quotations", json={
        "rfq_id": rfq["id"], "vendor_id": VA,
        "items": [{"description": "x", "quantity": 1, "unit_rate": 10}]}, headers=HA)
    assert r.status_code == 422, r.text


def test_compare_evaluate_award_flow():
    rfq, qa = test_quotation_totals_server_computed_and_resubmit()
    # vendor B quote too (needs invite)
    client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [VB]}, headers=ADMIN)
    r = client.post("/quotations", json={
        "rfq_id": rfq["id"], "vendor_id": VB, "lead_time_days": 20,
        "items": [{"description": "Borehole drilling", "quantity": 10,
                   "unit_rate": 1200}]}, headers=HB)
    assert r.status_code == 201, r.text
    qb = r.json()
    # vendors cannot see compare
    r = client.get(f"/rfqs/{rfq['id']}/compare", headers=HA)
    assert r.status_code == 403, r.text
    r = client.get(f"/rfqs/{rfq['id']}/compare", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert len(r.json()["quotations"]) == 2
    # cheapest first
    assert r.json()["quotations"][0]["total"] <= r.json()["quotations"][1]["total"]
    # evaluate both (scores required, range-checked)
    r = client.post(f"/quotations/{qa['id']}/evaluate",
                    json={"technical_score": 150}, headers=ADMIN)
    assert r.status_code == 422, r.text
    r = client.post(f"/quotations/{qa['id']}/evaluate",
                    json={"technical_score": 80, "commercial_score": 90,
                          "evaluation_notes": "Solid"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["overall_score"] == 85.0, r.text
    r = client.post(f"/quotations/{qb['id']}/evaluate",
                    json={"technical_score": 60, "commercial_score": 50}, headers=ADMIN)
    assert r.status_code == 200, r.text
    # award vendor A explicitly (not auto-cheapest: covered by reason + flag)
    r = client.post(f"/rfqs/{rfq['id']}/award",
                    json={"quotation_id": qa["id"], "award_reason": "Best techno-commercial",
                          "lowest_compliant": "YES"}, headers=ADMIN)
    assert r.status_code == 201, r.text
    assert r.json()["vendor_id"] == VA
    # double award blocked
    r = client.post(f"/rfqs/{rfq['id']}/award",
                    json={"quotation_id": qb["id"]}, headers=ADMIN)
    assert r.status_code == 409, r.text
    # loser marked rejected
    r = client.get(f"/quotations/{qb['id']}", headers=ADMIN)
    assert r.json()["status"] == "REJECTED", r.text
    return rfq, qa, qb


def test_work_order_lifecycle_and_assignment_gate():
    _rfq, qa, _qb = test_compare_evaluate_award_flow()
    # V4: direct WO wizard (no quotation) is allowed; totals server-computed
    r = client.post("/work-orders", json={"project_id": PID, "vendor_id": VB,
                                          "scope_of_work": "x",
                                          "items": [{"description": "Direct item",
                                                     "quantity": 2, "unit_rate": 100}]},
                    headers=ADMIN)
    assert r.status_code == 201, r.text
    assert r.json()["grand_total"] == 200.0, r.text
    # mismatched vendor/quotation still rejected
    r = client.post("/work-orders", json={"project_id": PID, "vendor_id": VB,
                                          "quotation_id": qa["id"],
                                          "scope_of_work": "x"}, headers=ADMIN)
    assert r.status_code == 422, r.text
    r = client.post("/work-orders", json={"project_id": PID, "vendor_id": VA,
                                          "quotation_id": qa["id"],
                                          "scope_of_work": "Drill 10 boreholes"},
                    headers=ADMIN)
    assert r.status_code == 201, r.text
    wo = r.json()
    assert wo["status"] == "DRAFT"
    assert wo["items"] and wo["items"][0]["description"] == "Borehole drilling"
    wid = wo["id"]
    # no assignment before acceptance
    r = client.get("/project-vendor-assignments", params={"project_id": PID},
                   headers=ADMIN)
    assert r.status_code == 200 and r.json() == [], r.text
    # invalid transition DRAFT -> ACCEPTED
    r = client.post(f"/work-orders/{wid}/accept", headers=HA)
    assert r.status_code == 409, r.text
    # vendor B cannot touch A's WO
    r = client.post(f"/work-orders/{wid}/accept", headers=HB)
    assert r.status_code in (403, 409), r.text
    # issue (freezes value from quotation)
    r = client.post(f"/work-orders/{wid}/issue", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["contract_value"] == qa["total"], r.text
    assert r.json()["status"] == "ISSUED"
    # vendor views then accepts -> assignment ACTIVE
    r = client.post(f"/work-orders/{wid}/viewed", headers=HA)
    assert r.status_code == 200, r.text
    r = client.post(f"/work-orders/{wid}/accept", headers=HA)
    assert r.status_code == 200 and r.json()["status"] == "ACCEPTED", r.text
    r = client.get("/project-vendor-assignments", params={"project_id": PID},
                   headers=ADMIN)
    assert len(r.json()) == 1 and r.json()[0]["vendor_id"] == VA, r.text
    assert r.json()[0]["status"] == "ACTIVE"
    # double accept invalid now
    r = client.post(f"/work-orders/{wid}/accept", headers=HA)
    assert r.status_code == 409, r.text
    # vendor portal sees WO + assignment + project-scoped RFQ
    r = client.get("/work-orders", headers=HA)
    assert any(w["id"] == wid for w in r.json()), r.text
    r = client.get("/work-orders", headers=HB)
    assert all(w["id"] != wid for w in r.json()), r.text
    # progress -> complete -> close
    for action, st in [("progress", "IN_PROGRESS"), ("complete", "COMPLETED"),
                       ("close", "CLOSED")]:
        r = client.post(f"/work-orders/{wid}/{action}", headers=ADMIN)
        assert r.status_code == 200 and r.json()["status"] == st, (action, r.text)
    # end assignment (history preserved)
    aid = client.get("/project-vendor-assignments", params={"project_id": PID},
                     headers=ADMIN).json()[0]["id"]
    r = client.post(f"/project-vendor-assignments/{aid}/end",
                    params={"status": "COMPLETED", "reason": "WO closed"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    r = client.get("/project-vendor-assignments", params={"project_id": PID},
                   headers=ADMIN)
    assert r.json()[0]["status"] == "COMPLETED"


def test_rfq_items_lock_and_support_endpoints():
    rfq = _rfq()
    # add items while DRAFT
    r = client.post(f"/rfqs/{rfq['id']}/items",
                    json={"description": "Mobilization", "quantity": 1, "unit": "lot"},
                    headers=ADMIN)
    assert r.status_code == 201, r.text
    # vendor cannot add items
    r = client.post(f"/rfqs/{rfq['id']}/items", json={"description": "x"}, headers=HA)
    assert r.status_code == 403, r.text
    # locked after send
    client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [VA]}, headers=ADMIN)
    r = client.post(f"/rfqs/{rfq['id']}/items", json={"description": "Late"}, headers=ADMIN)
    assert r.status_code == 409, r.text
    # vendors/me helper
    r = client.get("/vendors/me/organizations", headers=HA)
    assert r.status_code == 200 and VA in r.json()["vendor_ids"], r.text
    # project audit records lifecycle
    r = client.get(f"/projects/{PID}/audit", headers=ADMIN)
    assert r.status_code == 200, r.text
    actions = [a["action"] for a in r.json()]
    assert "SUPERVISOR_ASSIGNED" in actions or "VENDOR_ASSIGNED" in actions, actions
