"""Seed the complete V4 business workflow test data (idempotent).

Creates (skipping what already exists by unique email/code/number):
  users: admin (existing superadmin), supervisor1, supervisor2 (INVITED -> accept -> ACTIVE)
  vendors: Vendor A/B/C (auto VN- codes)
  project: GEO-2026-001
  work order: wizard payload + BOQ items, PDF, admin sign/stamp/finalize,
              sent to A/B/C; A accepts, B rejects, C stays sent
  assignments: supervisor1 + machine RIG-01 to project
  DER: supervisor1 daily report (+ manpower/equipment/vendor-activity rows)
  expenditures: 2 supervisor records, 1 approved + 1 left submitted

Usage (dev DB):
  .\\venv\\Scripts\\python.exe scripts\\seed_workflow_test_data.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ENV", "dev")

from fastapi.testclient import TestClient  # noqa: E402

import app.core.email as email_mod  # noqa: E402
from app.main import app  # noqa: E402

MAILBOX: dict = {}


class _FakeMail:
    def __call__(self, to_email, invite_link, **kwargs):
        MAILBOX["last"] = (to_email, invite_link, kwargs)


email_mod.send_invite_email = _FakeMail()
try:
    email_mod._deliver = lambda msg: None
except AttributeError:
    pass

client = None  # set in main() via lifespan context (runs startup: create_all + sync)

SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "admin@geotech.com")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "Admin@123")


def login(email, password):
    r = client.post("/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        r = client.post("/users/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def ensure_user(admin, email, full_name, role, password, extra=None):
    uid = None
    r = client.post("/users/", json={"email": email, "full_name": full_name,
                                     "role": role, **(extra or {})}, headers=admin)
    if r.status_code in (200, 201):
        uid = r.json().get("id")
    else:
        print(f"user {email}: {r.status_code} {r.text[:120]} (probably exists)")
        try:
            rows = client.get("/users/admin", headers=admin).json()
            uid = next((u["id"] for u in rows if u["email"] == email), None)
        except Exception:
            pass
    # invite -> accept (proper lifecycle)
    r = client.post("/users/invite", json={"email": email, "full_name": full_name,
                                           "role": role}, headers=admin)
    if r.status_code == 200 and MAILBOX.get("last"):
        _to, link, _kw = MAILBOX["last"]
        token = link.split("token=")[1] if "token=" in link else ""
        r2 = client.post("/users/invitations/accept",
                         json={"token": token, "password": password})
        print(f"invite-accept {email}: {r2.status_code}")
    else:
        print(f"invite {email}: {r.status_code} {r.text[:120]}")
    return login(email, password), uid


def ensure_vendor(admin, company, **kw):
    # idempotent: reuse exact company match first (company is not unique-keyed)
    try:
        r2 = client.get("/vendors/", params={"search": company}, headers=admin)
        for row in (r2.json() if r2.status_code == 200 else []):
            if (row.get("vendor_company") or row.get("legal_business_name") or "") == company \
                    or (row.get("legal_business_name") or "") == company + " Pvt Ltd":
                print(f"vendor {company}: reuse {row.get('vendor_code')} id={row.get('id')}")
                return row
    except Exception:
        pass
    r = client.post("/vendors/", json={"vendor_company": company,
                                       "legal_business_name": company + " Pvt Ltd",
                                       "contact_person": company + " Contact",
                                       "phone": "9000000001",
                                       "service_categories": "DRILLING",
                                       **kw}, headers=admin)
    if r.status_code in (200, 201):
        print(f"vendor {company}: {r.json().get('vendor_code')} id={r.json().get('id')}")
        return r.json()
    print(f"vendor {company} exists? {r.status_code} {r.text[:150]}")
    return None


def main():
    global client
    with TestClient(app, raise_server_exceptions=False) as c:
        client = c
        run()
    print("SEED DONE")


def run():
    admin = login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    print("admin login ok")

    sup1, _sup1_id = ensure_user(admin, "supervisor1@geotech.com", "Supervisor One", "SUPERVISOR",
                       "Sup1@12345", {"employee_id": "EMP-001", "designation": "Site Supervisor",
                                      "department": "Geotech", "primary_phone": "9000000011"})
    sup2, _sup2_id = ensure_user(admin, "supervisor2@geotech.com", "Supervisor Two", "SUPERVISOR",
                       "Sup2@12345", {"employee_id": "EMP-002", "designation": "Site Supervisor",
                                      "department": "Geotech", "primary_phone": "9000000012"})

    va = ensure_vendor(admin, "Vendor A")
    vb = ensure_vendor(admin, "Vendor B")
    vc = ensure_vendor(admin, "Vendor C")

    # vendor portal users
    for email, name, vrec in [("vendora@geotech.com", "Vendor A User", va),
                             ("vendorb@geotech.com", "Vendor B User", vb)]:
        if not vrec:
            continue
        _vh, vu_id = ensure_user(admin, email, name, "VENDOR", "Vend@12345")
        r = client.post(f"/vendors/{vrec['id']}/users",
                        json={"user_id": vu_id, "org_role": "OWNER"}, headers=admin)
        print(f"link {email} -> vendor {vrec['id']}: {r.status_code} {r.text[:120]}")

    # project
    r = client.post("/projects/", json={
        "project_code": "GEO-2026-001", "date": "2026-01-05", "name": "Seed Demo Project",
        "client_name": "Seed Client", "engineer_in_charge": "Seed Engineer",
        "location": "Seed Site, Hyderabad", "project_budget": 5000000}, headers=admin)
    if r.status_code in (200, 201):
        pid = r.json()["id"]
        print(f"project GEO-2026-001 id={pid}")
    else:
        print(f"project: {r.status_code} {r.text[:150]}")
        pid = client.get("/projects/search", params={"q": "GEO-2026-001"},
                         headers=admin).json()[0]["id"]
        print(f"project exists id={pid}")

    # machine (idempotent)
    mid = None
    try:
        rows = client.get("/machines/", headers=admin).json()
        mid = next((m["id"] for m in rows if m.get("machine_name") == "RIG-01"), None)
    except Exception:
        pass
    if mid is None:
        r = client.post("/machines", json={"machine_name": "RIG-01",
                                           "machine_type": "Rotary Rig"}, headers=admin)
        mid = r.json()["id"] if r.status_code in (200, 201) else None
    print(f"machine RIG-01 id={mid}")

    # work order wizard payload
    wo_payload = {
        "project_id": pid,
        "work_type": "Borehole drilling",
        "project_name": "Seed Demo Project", "client_name": "Seed Client",
        "site": "Seed Site", "location": "Seed Site, Hyderabad",
        "scope_of_work": "Drill 10 boreholes with sampling",
        "currency": "INR", "discount": 5000, "tax_amount": 18000, "other_charges": 2000,
        "payment_terms": "30 days after invoice", "validity_days": 30,
        "completion_period": "45 days", "retention_percent": 5,
        "tax_terms": "GST extra as applicable",
        "standard_terms": "Standard safety terms apply.",
        "custom_terms": "Site access 8am-6pm.",
        "items": [
            {"item_number": "1", "description": "Borehole drilling", "unit": "m",
             "quantity": 500, "unit_rate": 1200},
            {"item_number": "2", "description": "Mobilization", "unit": "lot",
             "quantity": 1, "unit_rate": 50000},
        ],
    }
    r = client.post("/work-orders", json=wo_payload, headers=admin)
    assert r.status_code == 201, f"WO create: {r.status_code} {r.text[:300]}"
    wo = r.json()
    wid = wo["id"]
    print(f"WO {wo['work_order_number']} id={wid} grand={wo['grand_total']} (expect 665000.0)")
    assert wo["grand_total"] == 500 * 1200 + 50000 - 5000 + 18000 + 2000 == 665000.0

    for label, fn in [("review", lambda: client.post(f"/work-orders/{wid}/review", headers=admin)),
                      ("pdf", lambda: client.post(f"/work-orders/{wid}/pdf/generate", headers=admin))]:
        rr = fn()
        print(f"WO {label}: {rr.status_code} {rr.text[:120]}")
    wo = client.get(f"/work-orders/{wid}", headers=admin).json()
    print("WO status:", wo["status"], "pdf:", wo.get("pdf_path"))
    for label, fn in [("sign", lambda: client.post(f"/work-orders/{wid}/sign",
                                                  json={"signature_data": "Seed Admin"}, headers=admin)),
                      ("stamp", lambda: client.post(f"/work-orders/{wid}/stamp",
                                                   json={"stamp_data": "SEED SEAL"}, headers=admin)),
                      ("finalize", lambda: client.post(f"/work-orders/{wid}/finalize", headers=admin))]:
        rr = fn()
        print(f"WO {label}: {rr.status_code} {rr.text[:120]}")

    # send to vendors
    vids = [v["id"] for v in (va, vb, vc) if v]
    r = client.post(f"/work-orders/{wid}/send", json={"vendor_ids": vids}, headers=admin)
    print(f"WO send: {r.status_code} {r.text[:150]}")
    r = client.post(f"/work-orders/{wid}/issue", headers=admin)
    print(f"WO issue: {r.status_code} {r.text[:150]}")

    # vendor A accepts, vendor B rejects (use the seeded vendor ids, verified linked)
    for email, pwd, accept, reason, vrec in [("vendora@geotech.com", "Vend@12345", True, None, va),
                                            ("vendorb@geotech.com", "Vend@12345", False, "Schedule conflict", vb)]:
        if not vrec:
            continue
        try:
            vh = login(email, pwd)
        except AssertionError as e:
            print(f"skip {email}: {e}")
            continue
        me = client.get("/vendors/me/organizations", headers=vh).json()
        org_ids = me.get("vendor_ids") or []
        my_vid = vrec["id"] if vrec["id"] in org_ids else (org_ids[0] if org_ids else None)
        rr = client.post(f"/work-orders/{wid}/vendor-response",
                         json={"vendor_id": my_vid, "accept": accept,
                               "rejection_reason": reason}, headers=vh)
        print(f"{email} {'accept' if accept else 'reject'} (vendor {my_vid}): {rr.status_code} {rr.text[:150]}")

    # rejected vendor must be refused assignment
    if vb:
        r = client.post(f"/projects/{pid}/vendors", params={"vendor_id": vb["id"]},
                        headers=admin)
        print(f"assign rejected vendor B (expect 400): {r.status_code} {r.text[:150]}")
    if va:
        r = client.post(f"/projects/{pid}/vendors", params={"vendor_id": va["id"]},
                        headers=admin)
        print(f"assign accepted vendor A (expect 200): {r.status_code} {r.text[:150]}")

    # supervisor assignment (pending-user guard demo uses sup2 deactivated? keep both ACTIVE)
    me1 = client.get("/users/admin", headers=admin).json()
    sup1_id = next((u["id"] for u in me1 if u["email"] == "supervisor1@geotech.com"), None)
    if sup1_id:
        r = client.post(f"/projects/{pid}/supervisors",
                        params={"supervisor_id": sup1_id}, headers=admin)
        print(f"assign supervisor1 (expect 200): {r.status_code} {r.text[:150]}")
    if mid:
        r = client.post(f"/projects/{pid}/machines", params={"machine_id": mid},
                        headers=admin)
        print(f"assign machine (expect 200): {r.status_code} {r.text[:150]}")

    # DER as supervisor1
    try:
        s1h = login("supervisor1@geotech.com", "Sup1@12345")
        der = {"project_id": pid, "borehole_started": "BH-01", "borehole_ended": "BH-02",
               "site_location": "Seed Site", "borehole_no": "BH-01", "rig_no": "RIG-01",
               "type_of_rig": "Rotary", "chainage": "0+100", "client": "Seed Client",
               "client_person_name": "CP", "client_person_designation": "Eng",
               "report_date": "2026-02-01", "total_depth": 50}
        if va:
            der["vendor_id"] = va["id"]
        r = client.post("/daily-execution/", json=der, headers=s1h)
        print(f"DER submit: {r.status_code} {r.text[:200]}")
        # expenditures x2
        for cat, amt in [("FUEL", 15000), ("LABOR", 25000)]:
            rr = client.post("/project-expenditures/",
                             json={"project_id": pid, "expense_date": "2026-02-02",
                                   "expense_category": cat, "description": f"Seed {cat}",
                                   "amount": amt}, headers=s1h)
            print(f"expenditure {cat}: {rr.status_code} {(rr.text or '')[:150]}")
            if rr.status_code in (200, 201):
                eid = rr.json()["id"]
                rs = client.post(f"/project-expenditures/{eid}/submit", headers=s1h)
                print(f"  submit: {rs.status_code}")
                if cat == "FUEL":
                    ra = client.post(f"/project-expenditures/{eid}/approve", headers=admin)
                    print(f"  approve FUEL: {ra.status_code} {(ra.text or '')[:120]}")
    except AssertionError as e:
        print(f"supervisor flow skipped: {e}")

    # timeline + search sanity
    r = client.get(f"/projects/{pid}/timeline", headers=admin)
    print(f"timeline events: {len(r.json()) if r.status_code == 200 else r.text[:100]}")
    r = client.get("/projects/search", params={"q": "GEO-2026"}, headers=admin)
    print(f"search GEO-2026: {[p['project_code'] for p in r.json()]}")

    # ---- V5 corporate document seed: company settings + WO-2026-0001 ----
    r = client.get("/company-settings", headers=admin)
    print(f"company: {r.status_code} {(r.json().get('company_name') if r.status_code == 200 else '')}")
    if r.status_code == 200 and not r.json().get("phone"):
        client.put("/company-settings", json={
            "company_name": "GeoTech Engineering Pvt Ltd",
            "tagline": "Geotechnical Investigation & Field Engineering",
            "address_line1": "Plot 12, Industrial Estate",
            "city": "Hyderabad", "state": "Telangana", "pin": "500001",
            "phone": "+91-40-0000-0000", "email": "projects@geotech.example.com",
            "website": "www.geotech.example.com",
            "wo_number_prefix": "GEOTECH/WO",
            "wo_number_format": "{prefix}/{project}/{seq:02d}",
            "footer_head_office": "Head Office: Plot 12, Industrial Estate, Hyderabad 500001",
        }, headers=admin)
        print("company settings seeded")
    r = client.post("/work-orders", json={
        "project_id": pid, "work_order_number": "WO-2026-0001",
        "work_type": "Geotechnical Investigation",
        "subject": "Work Order for Geotechnical Investigation works at Seed Site",
        "reference": "Seed ref QT-001",
        "intro_text": "Dear Sir,\n\nWe are pleased to award the above said work to you. "
                      "The scope, rates and terms & conditions are mentioned below.",
        "acceptance_text": "You may please return a copy of this Work Order duly sealed "
                           "and signed by your authorized representative towards unconditional "
                           "acceptance of the above conditions which shall constitute a valid "
                           "contract between us.",
        "scope_of_work": "Drill 10 boreholes with sampling and SPT.",
        "payment_terms_list": [
            "Mobilization shall be paid after rigs reach site.",
            "20% payment after completion of all site work.",
            "GST shall be paid extra on above mentioned price."],
        "general_terms": [
            "The quoted rates shall remain unchanged for the entire contract period.",
            "Payment shall be made as per actual quantities certified by the site team.",
            "The vendor shall not sublet the work without written permission."],
        "signer_name": "Seed Admin", "signer_designation": "Director",
        "items": [
            {"item_number": "1", "description": "Mobilization of hydraulic drilling rig, "
             "accessories and personnel to site", "unit": "LS", "quantity": 1,
             "unit_rate": 25000},
            {"item_number": "2", "description": "Drilling of bore hole with triple tube "
             "and double tube as applicable", "sub_description": "Note - Shifting from BH "
             "to BH is included in this rate.", "unit": "MTR", "quantity": 50,
             "unit_rate": 1900}],
        "discount": 0, "tax_amount": 0, "other_charges": 0}, headers=admin)
    print(f"WO-2026-0001: {r.status_code} "
          f"{(r.json().get('grand_total') if r.status_code == 201 else r.text[:100])}")


if __name__ == "__main__":
    main()
