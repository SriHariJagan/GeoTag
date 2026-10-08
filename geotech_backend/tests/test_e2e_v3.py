"""V3 end-to-end lifecycle (spec section 60), real backend + isolated DB.

Admin login -> create user -> invite -> accept -> ACTIVE -> vendor ->
project -> assign supervisor -> RFQ -> 2 vendors -> 2 quotes -> compare ->
evaluate -> award A -> work order -> accept -> active assignment ->
supervisor DER -> expenditure -> admin approve -> audit covers lifecycle.
"""
import os

import pytest
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)


ADMIN = login()


def test_full_business_lifecycle():
    # --- user ---
    r = client.post("/users/", json={"email": "e2e3@example.com",
                                     "full_name": "E2E Sup",
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    assert r.json()["account_status"] == "INVITED"
    client.post("/users/invite", json={"email": "e2e3@example.com",
                                       "full_name": "E2E Sup",
                                       "role": "SUPERVISOR"}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    sh = login("e2e3@example.com", "Strong@123")

    # --- vendors + portal users ---
    va = client.post("/vendors/", json={"vendor_company": "E2E A", "vendor_code": "E2EA"},
                     headers=ADMIN).json()["id"]
    vb = client.post("/vendors/", json={"vendor_company": "E2E B", "vendor_code": "E2EB"},
                     headers=ADMIN).json()["id"]
    vh = {}
    for email, vid in (("e2eva@example.com", va), ("e2evb@example.com", vb)):
        r = client.post("/users/", json={"email": email, "full_name": "E2E " + email,
                                         "role": "VENDOR"}, headers=ADMIN)
        uid = r.json()["id"]
        client.post("/users/invite", json={"email": email, "full_name": "E2E",
                                           "role": "VENDOR"}, headers=ADMIN)
        _to, link, _kw = last_invite()
        client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
        client.post(f"/vendors/{vid}/users", json={"user_id": uid}, headers=ADMIN)
        vh[vid] = login(email, "Strong@123")

    # --- project + supervisor assignment ---
    pid = client.post("/projects/", json={
        "project_code": "E2E3", "date": "2026-09-21", "name": "E2E Full",
        "client_name": "C", "engineer_in_charge": "E", "location": "L"},
        headers=ADMIN).json()["id"]
    r = client.post("/users/assignments",
                    json={"project_id": pid, "user_id": sid, "is_primary": True},
                    headers=ADMIN)
    assert r.status_code == 201, r.text
    r = client.patch(f"/projects/{pid}/status", json={"status": "PLANNED"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    r = client.patch(f"/projects/{pid}/status", json={"status": "ACTIVE"}, headers=ADMIN)
    assert r.status_code == 200, r.text

    # --- RFQ to both vendors ---
    rfq = client.post("/rfqs", json={
        "project_id": pid, "title": "E2E works",
        "items": [{"description": "Drilling", "quantity": 5, "unit": "m"}]},
        headers=ADMIN).json()
    client.post(f"/rfqs/{rfq['id']}/send", json={"vendor_ids": [va, vb]}, headers=ADMIN)
    item_id = rfq["items"][0]["id"]

    # --- both quote; totals server-side ---
    qa = client.post("/quotations", json={
        "rfq_id": rfq["id"], "vendor_id": va,
        "items": [{"rfq_item_id": item_id, "quantity": 5, "unit_rate": 1000}]},
        headers=vh[va]).json()
    assert qa["total"] == 5000.0, qa
    qb = client.post("/quotations", json={
        "rfq_id": rfq["id"], "vendor_id": vb,
        "items": [{"rfq_item_id": item_id, "quantity": 5, "unit_rate": 1500}]},
        headers=vh[vb]).json()
    assert qb["total"] == 7500.0, qb

    # --- compare + evaluate + award A ---
    comp = client.get(f"/rfqs/{rfq['id']}/compare", headers=ADMIN).json()
    assert [q["vendor_id"] for q in comp["quotations"]] == [va, vb]
    client.post(f"/quotations/{qa['id']}/evaluate",
                json={"technical_score": 90, "commercial_score": 85}, headers=ADMIN)
    client.post(f"/quotations/{qb['id']}/evaluate",
                json={"technical_score": 70, "commercial_score": 60}, headers=ADMIN)
    award = client.post(f"/rfqs/{rfq['id']}/award",
                        json={"quotation_id": qa["id"], "award_reason": "Best value",
                              "lowest_compliant": "YES"}, headers=ADMIN).json()
    assert award["vendor_id"] == va

    # --- work order -> accept -> active assignment ---
    wo = client.post("/work-orders", json={
        "project_id": pid, "vendor_id": va, "quotation_id": qa["id"]}, headers=ADMIN).json()
    assert wo["items"] and wo["items"][0]["description"] == "Drilling"
    client.post(f"/work-orders/{wo['id']}/issue", headers=ADMIN)
    assert client.post(f"/work-orders/{wo['id']}/issue",
                       headers=ADMIN).status_code == 409  # already issued
    client.post(f"/work-orders/{wo['id']}/accept", headers=vh[va])
    got = client.get(f"/work-orders/{wo['id']}", headers=vh[va]).json()
    assert got["status"] == "ACCEPTED" and got["contract_value"] == 5000.0
    assigns = client.get("/project-vendor-assignments", params={"project_id": pid},
                         headers=ADMIN).json()
    assert len(assigns) == 1 and assigns[0]["status"] == "ACTIVE"

    # --- supervisor opens project, submits DER + manpower + vendor activity ---
    r = client.get(f"/projects/{pid}", headers=sh)
    assert r.status_code == 200, r.text
    der = client.post("/daily-execution/", json={
        "project_id": pid, "borehole_started": "BH-1", "borehole_ended": "BH-1",
        "site_location": "S1", "borehole_no": "1", "rig_no": "R1",
        "type_of_rig": "Rotary", "chainage": "0+10",
        "client": "C", "client_person_name": "P", "client_person_designation": "E",
        "report_date": "2026-09-20", "soil_depth": 8, "status": "DRAFT"}, headers=sh).json()
    assert der["total_depth"] == 8 and der["status"] == "DRAFT"
    r = client.post(f"/daily-execution/{der['id']}/manpower",
                    json={"role": "Helper", "actual_count": 4, "hours": 8}, headers=sh)
    assert r.status_code == 201, r.text
    r = client.post(f"/daily-execution/{der['id']}/vendor-activity",
                    json={"vendor_id": va, "work_order_id": wo["id"],
                          "activity": "Drilling", "quantity_completed": 8},
                    headers=sh)
    assert r.status_code == 201, r.text
    r = client.post(f"/daily-execution/{der['id']}/submit", headers=sh)
    assert r.status_code == 200 and r.json()["status"] == "SUBMITTED", r.text

    # --- expenditure submit + approve ---
    exp = client.post("/project-expenditures/", json={
        "project_id": pid, "expense_date": "2026-09-20",
        "expense_category": "FUEL", "amount": 2000, "vendor_id": va,
        "work_order_id": wo["id"]}, headers=sh).json()
    client.post(f"/project-expenditures/{exp['id']}/submit", headers=sh)
    r = client.post(f"/project-expenditures/{exp['id']}/approve", headers=ADMIN)
    assert r.json()["status"] == "APPROVED", r.text

    # --- audit covers the lifecycle ---
    db = TestingSession()
    from app.modules.users.models import AuditLog
    actions = {a.action for a in db.query(AuditLog).all()}
    db.close()
    for expected in ("USER_CREATED", "INVITATION_SENT", "INVITATION_ACCEPTED",
                     "VENDOR_CREATED", "PROJECT_CREATED", "SUPERVISOR_ASSIGNED",
                     "RFQ_CREATED", "RFQ_SENT", "QUOTATION_SUBMITTED",
                     "QUOTATION_EVALUATED", "VENDOR_AWARDED", "WORK_ORDER_CREATED",
                     "WORK_ORDER_ISSUED", "WORK_ORDER_ACCEPTED", "VENDOR_ASSIGNED",
                     "DER_CREATED", "EXPENDITURE_CREATED", "EXPENDITURE_SUBMITTED",
                     "EXPENDITURE_APPROVED"):
        assert expected in actions, f"missing audit: {expected}"
