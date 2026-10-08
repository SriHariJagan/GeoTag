"""V4 integrated business workflow tests: WO wizard -> sign/stamp -> accept gate.

Covers spec section 18: autocomplete, selection, vendor/supervisor acceptance
gates, WO lifecycle, PDF, sign/stamp auth, immutability, duplicates, isolation,
expenditure auth, audit timeline.
"""
import re

import pytest
from tests.conftest import client, login, last_invite

ADMIN = login()
PW = "Strong@123"


def _mkuser(email, role="SUPERVISOR", accept=True, **extra):
    r = client.post("/users/", json={"email": email, "full_name": "V4 " + email,
                                     "role": role, **extra}, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    client.post("/users/invite", json={"email": email, "full_name": "V4",
                                       "role": role}, headers=ADMIN)
    if accept:
        _to, link, _kw = last_invite()
        r = client.post("/users/invitations/accept",
                        json={"token": link.split("token=")[1], "password": PW})
        assert r.status_code == 200, r.text
        return login(email, PW)
    return None


def _vendor(name, extra=None):
    payload = {"vendor_company": name}
    if extra:
        payload.update(extra)
    r = client.post("/vendors/", json=payload, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _link_vendor(email, vendor_id):
    h = _mkuser(email, role="VENDOR")
    rows = client.get("/users/admin", headers=ADMIN).json()
    uid = next((u["id"] for u in rows if u["email"] == email), None)
    r = client.post(f"/vendors/{vendor_id}/users",
                    json={"user_id": uid, "org_role": "OWNER"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return h


@pytest.fixture(scope="module")
def wf():
    """Shared V4 world: project + vendors + users + machine."""
    sup_a = _mkuser("v4supA@example.com")
    sup_b = _mkuser("v4supB@example.com")
    _mkuser("v4pending@example.com", accept=False)  # INVITED, never accepts
    va = _vendor("V4 Vendor A")
    vb = _vendor("V4 Vendor B")
    ha = _link_vendor("v4vendA@example.com", va["id"])
    hb = _link_vendor("v4vendB@example.com", vb["id"])
    r = client.post("/projects/", json={
        "project_code": "V4-GEO-2026-001", "date": "2026-09-21",
        "name": "V4 Project", "client_name": "V4 Client",
        "engineer_in_charge": "V4 Eng", "location": "V4 Site"}, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    r = client.post("/machines", json={"machine_name": "V4-RIG",
                                       "machine_type": "Rotary"}, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    return {"sup_a": sup_a, "sup_b": sup_b, "va": va, "vb": vb,
            "ha": ha, "hb": hb, "pid": pid, "mid": r.json()["id"]}


def _mkwo(pid, vendor_id=None, number=None, items=None, full=False):
    payload = {"project_id": pid, "scope_of_work": "V4 scope",
               "items": items or [{"item_number": "1", "description": "V4 item",
                                   "quantity": 10, "unit": "m", "unit_rate": 1000}]}
    if vendor_id is not None:
        payload["vendor_id"] = vendor_id
    if number is not None:
        payload["work_order_number"] = number
    if full:
        payload.update({
            "subject": "V4 subject", "reference": "V4 ref",
            "intro_text": "Dear Sir, V4 intro.",
            "acceptance_text": "V4 acceptance.",
            "payment_terms_list": ["V4 pay term 1"],
            "general_terms": ["V4 general term 1"],
            "signer_name": "V4 Admin", "signer_designation": "Director",
        })
    r = client.post("/work-orders", json=payload, headers=ADMIN)
    assert r.status_code == 201, r.text
    return r.json()


def test_vendor_auto_id_and_search(wf):
    assert re.fullmatch(r"VN-\d{6}", wf["va"]["vendor_code"]), wf["va"]
    assert re.fullmatch(r"VN-\d{6}", wf["vb"]["vendor_code"]), wf["vb"]
    # searchable by ID / company / capability / status
    r = client.get("/work-orders/vendors/eligible",
                   params={"search": wf["va"]["vendor_code"]}, headers=ADMIN)
    assert r.status_code == 200 and any(
        v["id"] == wf["va"]["id"] for v in r.json()), r.text
    r = client.get("/work-orders/vendors/eligible",
                   params={"search": "V4 Vendor B"}, headers=ADMIN)
    assert any(v["id"] == wf["vb"]["id"] for v in r.json()), r.text


def test_project_autocomplete_and_selection(wf):
    r = client.get("/projects/search", params={"q": "V4-GEO-2026"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    assert any(p["project_code"] == "V4-GEO-2026-001" for p in r.json()), r.text
    r = client.get(f"/projects/details/{wf['pid']}", headers=ADMIN)
    assert r.status_code == 200, r.text


def test_duplicate_project_and_wo_numbers(wf):
    r = client.post("/projects/", json={
        "project_code": "V4-GEO-2026-001", "date": "2026-09-21", "name": "Dup",
        "client_name": "C", "engineer_in_charge": "E", "location": "L"},
        headers=ADMIN)
    assert r.status_code == 409, r.text
    _mkwo(wf["pid"], number="V4-WO-DUP-001")
    r = client.post("/work-orders", json={"project_id": wf["pid"],
                                          "work_order_number": "V4-WO-DUP-001",
                                          "scope_of_work": "x"}, headers=ADMIN)
    assert r.status_code == 409, r.text


def test_wo_totals_server_computed(wf):
    wo = _mkwo(wf["pid"], items=[
        {"item_number": "1", "description": "a", "quantity": 3, "unit_rate": 100},
        {"item_number": "2", "description": "b", "quantity": 2, "unit_rate": 50}])
    # 3*100 + 2*50 = 400; frontend totals are ignored entirely
    assert wo["subtotal"] == 400.0 and wo["grand_total"] == 400.0, wo
    r = client.post("/work-orders", json={
        "project_id": wf["pid"], "scope_of_work": "neg",
        "items": [{"description": "neg", "quantity": -1, "unit_rate": 10}]},
        headers=ADMIN)
    assert r.status_code == 422, r.text


def test_sign_stamp_auth_and_lifecycle(wf):
    wo = _mkwo(wf["pid"], vendor_id=wf["va"]["id"], full=True)
    wid = wo["id"]
    # non-admin cannot sign/stamp/finalize
    for fn in ("sign", "stamp", "finalize"):
        body = {} if fn == "finalize" else (
            {"signature_data": "x"} if fn == "sign" else {"stamp_data": "y"})
        r = client.post(f"/work-orders/{wid}/{fn}", json=body, headers=wf["ha"])
        assert r.status_code == 403, (fn, r.text)
    # sign before PDF is rejected
    r = client.post(f"/work-orders/{wid}/sign", json={"signature_data": "A"},
                    headers=ADMIN)
    assert r.status_code == 409, r.text
    # full professional flow
    assert client.post(f"/work-orders/{wid}/review", headers=ADMIN).status_code == 200
    r = client.post(f"/work-orders/{wid}/pdf/generate", headers=ADMIN)
    assert r.status_code == 200 and r.json()["pdf_path"], r.text
    r = client.get(f"/work-orders/{wid}/pdf/preview", headers=ADMIN)
    assert r.status_code == 200 and "pdf" in r.headers["content-type"], r.text[:100]
    assert client.post(f"/work-orders/{wid}/sign", json={"signature_data": "V4 Admin"},
                       headers=ADMIN).status_code == 200
    assert client.post(f"/work-orders/{wid}/stamp", json={"stamp_data": "V4 SEAL"},
                       headers=ADMIN).status_code == 200
    r = client.post(f"/work-orders/{wid}/finalize", headers=ADMIN)
    assert r.status_code == 200 and r.json()["is_locked"] == 1, r.text
    # signed document immutable (no silent edits)
    r = client.put(f"/work-orders/{wid}", json={"scope_of_work": "tampered"},
                   headers=ADMIN)
    assert r.status_code == 409, r.text
    r = client.get(f"/work-orders/{wid}/versions", headers=ADMIN)
    assert r.status_code == 200 and len(r.json()) >= 3, r.text


def test_finalize_validation_blocks_incomplete(wf):
    wo = _mkwo(wf["pid"], vendor_id=wf["va"]["id"])  # no subject/terms/signer
    wid = wo["id"]
    client.post(f"/work-orders/{wid}/review", headers=ADMIN)
    client.post(f"/work-orders/{wid}/pdf/generate", headers=ADMIN)
    client.post(f"/work-orders/{wid}/sign", json={"signature_data": "x"}, headers=ADMIN)
    client.post(f"/work-orders/{wid}/stamp", json={"stamp_data": "y"}, headers=ADMIN)
    r = client.post(f"/work-orders/{wid}/finalize", headers=ADMIN)
    assert r.status_code == 422, r.text
    assert "Subject" in r.json()["detail"], r.text


def test_vendor_acceptance_gate(wf):
    wo = _mkwo(wf["pid"])
    wid = wo["id"]
    assert client.post(f"/work-orders/{wid}/send",
                       json={"vendor_ids": [wf["va"]["id"], wf["vb"]["id"]]},
                       headers=ADMIN).status_code == 200
    assert client.post(f"/work-orders/{wid}/issue", headers=ADMIN).status_code == 200
    # A accepts, B rejects with reason
    r = client.post(f"/work-orders/{wid}/vendor-response",
                    json={"vendor_id": wf["va"]["id"], "accept": True}, headers=wf["ha"])
    assert r.status_code == 200, r.text
    r = client.post(f"/work-orders/{wid}/vendor-response",
                    json={"vendor_id": wf["vb"]["id"], "accept": False,
                          "rejection_reason": "Busy"}, headers=wf["hb"])
    assert r.status_code == 200, r.text
    # reject without reason refused
    wo2 = _mkwo(wf["pid"])
    client.post(f"/work-orders/{wo2['id']}/send",
                json={"vendor_ids": [wf["vb"]["id"]]}, headers=ADMIN)
    r = client.post(f"/work-orders/{wo2['id']}/vendor-response",
                    json={"vendor_id": wf["vb"]["id"], "accept": False}, headers=wf["hb"])
    assert r.status_code == 422, r.text
    # rejected vendor cannot be assigned (backend enforced)
    r = client.post(f"/projects/{wf['pid']}/vendors",
                    params={"vendor_id": wf["vb"]["id"]}, headers=ADMIN)
    assert r.status_code == 400, r.text
    assert "not accepted" in r.json()["detail"].lower(), r.text
    # accepted vendor assigns fine
    r = client.post(f"/projects/{wf['pid']}/vendors",
                    params={"vendor_id": wf["va"]["id"]}, headers=ADMIN)
    assert r.status_code == 200, r.text


def test_vendor_isolation(wf):
    wo = _mkwo(wf["pid"], vendor_id=wf["va"]["id"])
    assert client.post(f"/work-orders/{wo['id']}/send",
                       json={"vendor_ids": [wf["va"]["id"]]}, headers=ADMIN).status_code == 200
    r = client.get("/work-orders", headers=wf["hb"])
    assert all(w["id"] != wo["id"] for w in r.json()), r.text
    # B cannot touch A's work order
    r = client.post(f"/work-orders/{wo['id']}/vendor-response",
                    json={"vendor_id": wf["vb"]["id"], "accept": True}, headers=wf["hb"])
    assert r.status_code in (403, 409), r.text


def test_supervisor_gates_and_isolation(wf):
    # pending (INVITED) supervisor rejected with clear message
    rows = client.get("/users/admin", headers=ADMIN).json()
    pending = next((u["id"] for u in rows if u["email"] == "v4pending@example.com"), None)
    r = client.post(f"/projects/{wf['pid']}/supervisors",
                    params={"supervisor_id": pending}, headers=ADMIN)
    assert r.status_code == 400, r.text
    assert "not accepted the invitation" in r.json()["detail"].lower(), r.text
    # active supervisor assigns fine
    sup_a_id = next((u["id"] for u in rows if u["email"] == "v4supA@example.com"), None)
    assert client.post(f"/projects/{wf['pid']}/supervisors",
                       params={"supervisor_id": sup_a_id}, headers=ADMIN).status_code == 200
    # assignment visible in BOTH link tables (KPI count + Supervisors tab agree)
    r = client.get(f"/projects/{wf['pid']}/assignments", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert any(a["user_id"] == sup_a_id and a["status"] == "ACTIVE" for a in r.json()), r.text
    r = client.get(f"/projects/{wf['pid']}", headers=ADMIN)
    assert any(s["id"] == sup_a_id for s in r.json()["supervisors"]), r.text
    # unassigned supervisor cannot read the project
    r = client.get(f"/projects/{wf['pid']}", headers=wf["sup_b"])
    assert r.status_code == 403, r.text


def test_machine_availability_gate(wf):
    r = client.post(f"/projects/{wf['pid']}/machines",
                    params={"machine_id": wf["mid"]}, headers=ADMIN)
    assert r.status_code == 200, r.text
    # inactive machines refused
    r = client.post("/machines", json={"machine_name": "V4-DEAD",
                                       "machine_type": "Rig"}, headers=ADMIN)
    dead = r.json()["id"]
    client.put(f"/machines/{dead}", json={"status": "maintenance"}, headers=ADMIN)
    r = client.post(f"/projects/{wf['pid']}/machines",
                    params={"machine_id": dead}, headers=ADMIN)
    assert r.status_code == 400, r.text


def test_expenditure_auth_and_audit_timeline(wf):
    r = client.post("/project-expenditures/",
                    json={"project_id": wf["pid"], "expense_date": "2026-03-01",
                          "expense_category": "MATERIAL", "description": "V4 mat",
                          "amount": 777}, headers=wf["sup_a"])
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    assert client.post(f"/project-expenditures/{eid}/submit",
                       headers=wf["sup_a"]).status_code == 200
    # supervisor cannot approve own record
    r = client.post(f"/project-expenditures/{eid}/approve", headers=wf["sup_a"])
    assert r.status_code == 403, r.text
    assert client.post(f"/project-expenditures/{eid}/approve",
                       headers=ADMIN).status_code == 200
    # audit timeline covers the workflow
    r = client.get(f"/projects/{wf['pid']}/timeline", headers=ADMIN)
    assert r.status_code == 200, r.text
    actions = {a["action"] for a in r.json()}
    for expected in ("PROJECT_CREATED", "WORK_ORDER_CREATED", "WORK_ORDER_SENT",
                     "WORK_ORDER_ACCEPTED", "WORK_ORDER_REJECTED", "VENDOR_ASSIGNED",
                     "SUPERVISOR_ASSIGNED", "MACHINE_ASSIGNED"):
        assert expected in actions, (expected, sorted(actions))
