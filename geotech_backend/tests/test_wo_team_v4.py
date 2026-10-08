"""V6 WO team + cost ledger: validation, accept auto-sync, ledger math, RBAC."""
import pytest
from tests.conftest import client, login, last_invite

ADMIN = login()
PW = "Strong@123"


def _mkuser(email, role="SUPERVISOR", accept=True):
    r = client.post("/users/", json={"email": email, "full_name": "T6 " + email,
                                     "role": role}, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    client.post("/users/invite", json={"email": email, "full_name": "T6",
                                       "role": role}, headers=ADMIN)
    if accept:
        _to, link, _kw = last_invite()
        r = client.post("/users/invitations/accept",
                        json={"token": link.split("token=")[1], "password": PW})
        assert r.status_code == 200, r.text
        return login(email, PW)
    return None


def _vendor(name):
    r = client.post("/vendors/", json={"vendor_company": name}, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _link(email, vendor_id):
    h = _mkuser(email, role="VENDOR")
    rows = client.get("/users/admin", headers=ADMIN).json()
    uid = next((u["id"] for u in rows if u["email"] == email), None)
    r = client.post(f"/vendors/{vendor_id}/users",
                    json={"user_id": uid, "org_role": "OWNER"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return h


@pytest.fixture(scope="module")
def tw():
    va = _vendor("T6 Vendor A")
    ha = _link("t6vendA@example.com", va["id"])
    sup = _mkuser("t6sup@example.com")
    _mkuser("t6pending@example.com", accept=False)
    r = client.post("/projects/", json={
        "project_code": "T6-GEO-001", "date": "2026-09-21", "name": "T6 Project",
        "client_name": "C", "engineer_in_charge": "E", "location": "L",
        "project_budget": 1000000}, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    r = client.post("/machines", json={"machine_name": "T6-RIG",
                                       "machine_type": "Rotary",
                                       "rate_per_day": 5000}, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    assert r.json()["rate_per_day"] == 5000, r.text
    rows = client.get("/users/admin", headers=ADMIN).json()
    sup_id = next((u["id"] for u in rows if u["email"] == "t6sup@example.com"), None)
    pend_id = next((u["id"] for u in rows if u["email"] == "t6pending@example.com"), None)
    return {"va": va, "ha": ha, "sup": sup, "sup_id": sup_id, "pend_id": pend_id,
            "pid": pid, "mid": r.json()["id"]}


def _wobase(pid, **kw):
    payload = {"project_id": pid, "scope_of_work": "T6 scope",
               "subject": "T6 subject",
               "payment_terms_list": ["t"], "general_terms": ["t"],
               "signer_name": "T6", "items": [
                   {"description": "T6 item", "quantity": 1, "unit_rate": 10}]}
    payload.update(kw)
    return payload


def test_team_validation(tw):
    # pending supervisor refused with clear message
    r = client.post("/work-orders", json=_wobase(
        tw["pid"], team_supervisors=[tw["pend_id"]]), headers=ADMIN)
    assert r.status_code == 400, r.text
    assert "not accepted the invitation" in r.json()["detail"].lower(), r.text
    # unknown machine refused
    r = client.post("/work-orders", json=_wobase(
        tw["pid"], team_machines=[{"machine_id": 999999}]), headers=ADMIN)
    assert r.status_code == 404, r.text
    # negative rate refused
    r = client.post("/work-orders", json=_wobase(
        tw["pid"], team_machines=[{"machine_id": tw["mid"], "rate_per_day": -5}]),
        headers=ADMIN)
    assert r.status_code == 422, r.text


def test_duplicate_as_new(tw):
    src = client.post("/work-orders", json=_wobase(
        tw["pid"], vendor_id=tw["va"]["id"],
        team_supervisors=[tw["sup_id"]],
        team_machines=[{"machine_id": tw["mid"], "rate_per_day": 6000}]), headers=ADMIN)
    assert src.status_code == 201, src.text
    src = src.json()
    assert src["team_supervisors"] == [tw["sup_id"]], src
    assert src["team_machines"][0]["rate_per_day"] == 6000, src
    assert src["team_machines"][0]["machine_name"] == "T6-RIG", src
    r = client.post(f"/work-orders/{src['id']}/duplicate", headers=ADMIN)
    assert r.status_code == 201, r.text
    dup = r.json()
    assert dup["id"] != src["id"] and dup["status"] == "DRAFT", dup
    assert dup["version"] == 1, dup
    assert dup["work_order_number"] and dup["work_order_number"] != src["work_order_number"], dup
    assert dup["team_supervisors"] == [tw["sup_id"]], dup
    assert dup["payment_terms_list"] and dup["items"], dup
    # duplicate with taken number refused
    r = client.post(f"/work-orders/{src['id']}/duplicate",
                    params={"work_order_number": dup["work_order_number"]}, headers=ADMIN)
    assert r.status_code == 409, r.text


def test_accept_syncs_team_and_ledger(tw):
    r = client.post("/work-orders", json=_wobase(
        tw["pid"], vendor_id=tw["va"]["id"],
        team_supervisors=[tw["sup_id"]],
        team_machines=[{"machine_id": tw["mid"], "rate_per_day": 6000}]), headers=ADMIN)
    wid = r.json()["id"]
    assert client.post(f"/work-orders/{wid}/send",
                       json={"vendor_ids": [tw["va"]["id"]]}, headers=ADMIN).status_code == 200
    assert client.post(f"/work-orders/{wid}/issue", headers=ADMIN).status_code == 200
    assert client.post(f"/work-orders/{wid}/vendor-response",
                       json={"vendor_id": tw["va"]["id"], "accept": True},
                       headers=tw["ha"]).status_code == 200
    # auto-reflected: supervisor assignment + machine link exist
    a = client.get(f"/projects/{tw['pid']}/assignments", headers=ADMIN).json()
    assert any(x["user_id"] == tw["sup_id"] and x["status"] == "ACTIVE" for x in a), a
    p = client.get(f"/projects/{tw['pid']}", headers=ADMIN).json()
    assert any(m["id"] == tw["mid"] for m in p["machinery"]), p
    # DER using the machine on two days
    for day in ("2026-04-01", "2026-04-02"):
        r = client.post("/daily-execution/", json={
            "project_id": tw["pid"], "vendor_id": tw["va"]["id"],
            "machine_id": tw["mid"], "borehole_started": "BH-1",
            "borehole_ended": "BH-1", "site_location": "S", "borehole_no": "BH-1",
            "rig_no": "R1", "type_of_rig": "Rotary", "chainage": "0",
            "client": "C", "client_person_name": "P", "client_person_designation": "E",
            "report_date": day}, headers=tw["sup"])
        assert r.status_code in (200, 201), r.text
    # expenditure extra
    r = client.post("/project-expenditures/",
                    json={"project_id": tw["pid"], "expense_date": "2026-04-03",
                          "expense_category": "FUEL", "description": "T6 fuel",
                          "amount": 7000}, headers=tw["sup"])
    assert r.status_code in (200, 201), r.text
    # ledger math: 2 days x 6000 (WO rate wins over master 5000) + 7000 fuel
    r = client.get(f"/projects/{tw['pid']}/cost-ledger", headers=ADMIN)
    assert r.status_code == 200, r.text
    led = r.json()
    assert led["machinery_total"] == 12000.0, led["machinery"]
    assert led["machinery"][0]["rate_source"].startswith("WO "), led["machinery"]
    assert led["expenditures"]["total"] == 7000.0, led["expenditures"]
    assert led["totals"]["grand_total"] == 19000.0, led["totals"]
    assert led["totals"]["balance"] == 1000000 - 19000.0, led["totals"]
    assert len(led["weekly"]) >= 1 and len(led["history"]) == 3, led
    # supervisor read allowed, vendor refused
    assert client.get(f"/projects/{tw['pid']}/cost-ledger", headers=tw["sup"]).status_code == 200
    vb = _vendor("T6 Vendor B")
    hb = _link("t6vendB@example.com", vb["id"])
    r = client.get(f"/projects/{tw['pid']}/cost-ledger", headers=hb)
    assert r.status_code == 403, r.text
