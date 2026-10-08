"""DER edit-request flow: supervisor asks, admin approves/rejects, report unlocks."""
from tests.conftest import (
    client, TestingSession, User, login, last_invite,
)


ADMIN = login()


def _supervisor(email):
    r = client.post("/users/", json={"email": email, "full_name": "ER " + email,
                                     "role": "SUPERVISOR"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    client.post("/users/invite", json={"email": email, "full_name": "ER",
                                       "role": "SUPERVISOR"}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": "Strong@123"})
    assert r.status_code == 200, r.text
    return uid, login(email, "Strong@123")


def _project(code):
    r = client.post("/projects/", json={
        "project_code": code, "date": "2026-09-21", "name": "ER " + code,
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


def test_request_approve_unlocks_edit():
    uid, sh = _supervisor("dereq1@example.com")
    pid = _project("DEREQ-001")
    client.post("/users/assignments", json={"project_id": pid, "user_id": uid},
                headers=ADMIN)
    rid = client.post("/daily-execution/", json=_payload(pid), headers=sh).json()["id"]

    # supervisor cannot edit submitted directly
    r = client.put(f"/daily-execution/{rid}", json={"remarks": "x"}, headers=sh)
    assert r.status_code == 409, r.text

    # request unlock
    r = client.post(f"/daily-execution/{rid}/edit-requests",
                    json={"message": "Rig hours were 6.5 not 8"}, headers=sh)
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "PENDING"
    qid = r.json()["id"]

    # duplicate pending blocked
    r = client.post(f"/daily-execution/{rid}/edit-requests",
                    json={"message": "again"}, headers=sh)
    assert r.status_code == 409, r.text

    # admin sees it in the queue
    r = client.get("/daily-execution/edit-requests", params={"status": "PENDING"},
                   headers=ADMIN)
    assert r.status_code == 200 and any(x["id"] == qid for x in r.json()), r.text

    # approve -> report flips to DRAFT
    r = client.post(f"/daily-execution/edit-requests/{qid}/review",
                    json={"approve": True, "note": "ok, fix it"}, headers=sh)
    assert r.status_code == 403, r.text  # supervisors cannot review
    r = client.post(f"/daily-execution/edit-requests/{qid}/review",
                    json={"approve": True, "note": "ok, fix it"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPROVED"

    r = client.get(f"/daily-execution/{rid}", headers=ADMIN)
    assert r.json()["status"] == "DRAFT", r.text

    # supervisor can now edit + resubmit
    r = client.put(f"/daily-execution/{rid}", json={"remarks": "fixed hours"},
                   headers=sh)
    assert r.status_code == 200, r.text
    r = client.post(f"/daily-execution/{rid}/submit", headers=sh)
    assert r.status_code == 200, r.text

    # second review of same request blocked
    r = client.post(f"/daily-execution/edit-requests/{qid}/review",
                    json={"approve": True}, headers=ADMIN)
    assert r.status_code == 409, r.text

    # full loop: resubmitted report locks again, fresh request allowed
    r = client.post(f"/daily-execution/{rid}/edit-requests",
                    json={"message": "found another mistake"}, headers=sh)
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "PENDING"
    qid2 = r.json()["id"]
    r = client.post(f"/daily-execution/edit-requests/{qid2}/review",
                    json={"approve": True, "note": "go ahead"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    r = client.get(f"/daily-execution/{rid}", headers=ADMIN)
    assert r.json()["status"] == "DRAFT", r.text


def test_request_reject_keeps_locked():
    uid, sh = _supervisor("dereq2@example.com")
    pid = _project("DEREQ-002")
    client.post("/users/assignments", json={"project_id": pid, "user_id": uid},
                headers=ADMIN)
    rid = client.post("/daily-execution/",
                      json=_payload(pid, report_date="2026-09-19", borehole_no="2"),
                      headers=sh).json()["id"]

    qid = client.post(f"/daily-execution/{rid}/edit-requests",
                      json={"message": "please allow change"}, headers=sh).json()["id"]
    r = client.post(f"/daily-execution/edit-requests/{qid}/review",
                    json={"approve": False, "note": "figures verified correct"},
                    headers=ADMIN)
    assert r.status_code == 200 and r.json()["status"] == "REJECTED", r.text

    # still locked
    r = client.put(f"/daily-execution/{rid}", json={"remarks": "x"}, headers=sh)
    assert r.status_code == 409, r.text
    # supervisor sees the rejection + note in their own queue
    r = client.get("/daily-execution/edit-requests", headers=sh)
    assert r.status_code == 200
    mine = [x for x in r.json() if x["id"] == qid]
    assert mine and mine[0]["review_note"] == "figures verified correct", r.text


def test_request_guards():
    uid, sh = _supervisor("dereq3@example.com")
    pid = _project("DEREQ-003")
    client.post("/users/assignments", json={"project_id": pid, "user_id": uid},
                headers=ADMIN)
    # draft needs no approval
    rid = client.post("/daily-execution/",
                      json=_payload(pid, report_date="2026-09-18", status="DRAFT"),
                      headers=sh).json()["id"]
    r = client.post(f"/daily-execution/{rid}/edit-requests",
                    json={"message": "not needed"}, headers=sh)
    assert r.status_code == 422, r.text

    # stranger's report is invisible to another supervisor
    _uid2, sh2 = _supervisor("dereq4@example.com")
    r = client.post("/daily-execution/1/edit-requests",
                    json={"message": "let me in please"}, headers=sh2)
    assert r.status_code in (403, 404), r.text
    # strangers see none of my requests
    r = client.get("/daily-execution/edit-requests", headers=sh2)
    assert r.status_code == 200 and r.json() == [], r.text
