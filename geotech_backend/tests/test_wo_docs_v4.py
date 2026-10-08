"""V5 corporate document module: settings, numbering, docs, hash, versions, RBAC."""
import hashlib
import io

import pytest
from tests.conftest import client, login, last_invite

ADMIN = login()
PW = "Strong@123"

# Minimal valid PNG (4x4 navy) generated with Pillow.
PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000400000004080200000026930929"
    "0000001349444154789c6394b3ea62800126380b2f07002cbc00ea6000d02700"
    "00000049454e44ae426082")
PDF_MIN = b"%PDF-1.4\n1 0 obj<</>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"


def _mkuser(email, role="SUPERVISOR"):
    r = client.post("/users/", json={"email": email, "full_name": "D5 " + email,
                                     "role": role}, headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    client.post("/users/invite", json={"email": email, "full_name": "D5",
                                       "role": role}, headers=ADMIN)
    _to, link, _kw = last_invite()
    r = client.post("/users/invitations/accept",
                    json={"token": link.split("token=")[1], "password": PW})
    assert r.status_code == 200, r.text
    return login(email, PW)


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
def dw():
    va = _vendor("D5 Vendor A")
    vb = _vendor("D5 Vendor B")
    ha = _link("d5vendA@example.com", va["id"])
    hb = _link("d5vendB@example.com", vb["id"])
    sup = _mkuser("d5sup@example.com")
    r = client.post("/projects/", json={
        "project_code": "D5-GEO-001", "date": "2026-09-21", "name": "D5 Project",
        "client_name": "D5 Client", "engineer_in_charge": "E", "location": "D5 Site"},
        headers=ADMIN)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    rows = client.get("/users/admin", headers=ADMIN).json()
    sup_id = next((u["id"] for u in rows if u["email"] == "d5sup@example.com"), None)
    assert client.post(f"/projects/{pid}/supervisors",
                       params={"supervisor_id": sup_id}, headers=ADMIN).status_code == 200
    return {"va": va, "vb": vb, "ha": ha, "hb": hb, "sup": sup, "pid": pid}


def _rich_wo(pid, vendor_id=None, number=None):
    payload = {
        "project_id": pid, "scope_of_work": "D5 scope",
        "subject": "D5 subject", "reference": "D5 ref",
        "intro_text": "Dear Sir, D5 intro.",
        "acceptance_text": "D5 acceptance.",
        "payment_terms_list": ["D5 pay 1", "D5 pay 2"],
        "general_terms": ["D5 gen 1", "D5 gen 2"],
        "signer_name": "D5 Admin", "signer_designation": "Director",
        "items": [{"item_number": "1", "description": "D5 item",
                   "sub_description": "D5 note", "quantity": 5,
                   "unit": "m", "unit_rate": 1000}],
    }
    if vendor_id is not None:
        payload["vendor_id"] = vendor_id
    if number is not None:
        payload["work_order_number"] = number
    r = client.post("/work-orders", json=payload, headers=ADMIN)
    assert r.status_code == 201, r.text
    wo = r.json()
    assert wo["payment_terms_list"] == ["D5 pay 1", "D5 pay 2"], wo
    assert wo["general_terms"] == ["D5 gen 1", "D5 gen 2"], wo
    assert wo["items"][0]["sub_description"] == "D5 note", wo
    return wo


def _finalize_flow(wid):
    assert client.post(f"/work-orders/{wid}/review", headers=ADMIN).status_code == 200
    r = client.post(f"/work-orders/{wid}/pdf/generate", headers=ADMIN)
    assert r.status_code == 200 and r.json()["pdf_path"], r.text
    assert client.post(f"/work-orders/{wid}/sign",
                       json={"signature_data": "D5"}, headers=ADMIN).status_code == 200
    assert client.post(f"/work-orders/{wid}/stamp",
                       json={"stamp_data": "D5"}, headers=ADMIN).status_code == 200
    r = client.post(f"/work-orders/{wid}/finalize", headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()


def test_company_settings_and_logo(dw):
    r = client.get("/company-settings", headers=ADMIN)
    assert r.status_code == 200 and r.json()["company_name"], r.text
    # vendor cannot update
    r = client.put("/company-settings", json={"tagline": "x"}, headers=dw["ha"])
    assert r.status_code == 403, r.text
    r = client.put("/company-settings",
                   json={"company_name": "D5 Corp", "tagline": "D5 tag",
                         "phone": "+91-1", "email": "d5@d5.example",
                         "wo_number_prefix": "D5/WO",
                         "wo_number_format": "{prefix}/{project}/{seq:02d}"},
                   headers=ADMIN)
    assert r.status_code == 200 and r.json()["company_name"] == "D5 Corp", r.text
    # bad format rejected
    r = client.put("/company-settings", json={"wo_number_format": "NOSEQ"},
                   headers=ADMIN)
    assert r.status_code == 422, r.text
    # logo upload + invalid type
    r = client.post("/company-settings/logo",
                    files={"file": ("logo.png", PNG_1X1, "image/png")}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["logo_path"], r.text
    r = client.get("/company-settings/logo", headers=ADMIN)
    assert r.status_code == 200 and "image" in r.headers["content-type"], r.text[:100]
    r = client.post("/company-settings/logo",
                    files={"file": ("x.txt", b"nope", "text/plain")}, headers=ADMIN)
    assert r.status_code == 415, r.text
    # corrupt image bytes rejected even with image mime
    r = client.post("/company-settings/logo",
                    files={"file": ("bad.png", b"not-a-png", "image/png")}, headers=ADMIN)
    assert r.status_code == 422, r.text


def test_numbering_next(dw):
    r = client.get("/work-orders/numbering/next", params={"project_id": dw["pid"]},
                   headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["work_order_number"].startswith("D5/WO/D5-GEO-001/"), r.text


def test_draft_update_reload_and_multipage_pdf(dw):
    wo = _rich_wo(dw["pid"], dw["va"]["id"])
    wid = wo["id"]
    # draft update (structured, server recompute)
    r = client.put(f"/work-orders/{wid}", json={
        "subject": "D5 subject v2",
        "payment_terms_list": ["a", "b", "c"],
        "general_terms": ["g1"],
        "vendor_override": {"city": "D5 Override City", "gstin": "GSTINOVERRIDE"},
        "items": [{"item_number": "1", "description": "line one\nmultiline ok",
                   "sub_description": "note one", "quantity": 2, "unit": "lot",
                   "unit_rate": 50}]}, headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["subject"] == "D5 subject v2", r.text
    assert r.json()["vendor_override"] == {"city": "D5 Override City",
                                           "gstin": "GSTINOVERRIDE"}, r.text
    # reload draft keeps structured content
    r = client.get(f"/work-orders/{wid}", headers=ADMIN)
    assert r.json()["payment_terms_list"] == ["a", "b", "c"], r.text
    # long BOQ -> multi-page PDF still generates
    big = [{"item_number": str(i), "description": f"Item {i} with a fairly long "
            f"description to exercise wrapping across pages ({i})",
            "sub_description": f"Note {i}", "quantity": i, "unit": "m",
            "unit_rate": 100 + i} for i in range(1, 61)]
    r = client.put(f"/work-orders/{wid}", json={"items": big}, headers=ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["subtotal"] == sum(i * (100 + i) for i in range(1, 61)), r.text
    r = client.post(f"/work-orders/{wid}/pdf/generate", headers=ADMIN)
    assert r.status_code == 200 and r.json()["pdf_path"], r.text
    docs = [d for d in r.json()["documents"] if d["document_type"] == "GENERATED"]
    assert docs and docs[0]["sha256"], r.text


def test_signed_upload_hash_and_rbac(dw):
    wo = _rich_wo(dw["pid"], dw["va"]["id"])
    fin = _finalize_flow(wo["id"])
    assert fin["vendor_snapshot"] and fin["project_snapshot"] \
        and fin["company_snapshot"], fin.keys()
    # vendor + supervisor cannot upload
    for h in (dw["ha"], dw["sup"]):
        r = client.post(f"/work-orders/{wo['id']}/documents",
                        params={"document_type": "SIGNED"},
                        files={"file": ("s.pdf", PDF_MIN, "application/pdf")}, headers=h)
        assert r.status_code == 403, (h, r.text)
    # invalid type + empty rejected
    r = client.post(f"/work-orders/{wo['id']}/documents",
                    params={"document_type": "SIGNED"},
                    files={"file": ("s.txt", b"x", "text/plain")}, headers=ADMIN)
    assert r.status_code == 415, r.text
    r = client.post(f"/work-orders/{wo['id']}/documents",
                    params={"document_type": "SIGNED"},
                    files={"file": ("s.pdf", b"", "application/pdf")}, headers=ADMIN)
    assert r.status_code == 422, r.text
    # valid upload: hash + metadata + verify
    content = PDF_MIN + b"\n%D5-signed"
    r = client.post(f"/work-orders/{wo['id']}/documents",
                    params={"document_type": "SIGNED"},
                    files={"file": ("WO-D5-SIGNED.pdf", content, "application/pdf")},
                    headers=ADMIN)
    assert r.status_code == 201, r.text
    docs = [d for d in r.json()["documents"] if d["document_type"] == "SIGNED"]
    assert len(docs) == 1 and docs[0]["is_signed"] == 1, r.text
    assert docs[0]["sha256"] == hashlib.sha256(content).hexdigest(), docs
    assert r.json()["status"] == "SIGNED", r.text
    r = client.get(f"/work-order-documents/{docs[0]['id']}/verify", headers=ADMIN)
    assert r.status_code == 200 and r.json()["verified"] is True, r.text
    # download works + logged; isolation: vendor B refused
    r = client.get(f"/work-order-documents/{docs[0]['id']}/download", headers=ADMIN)
    assert r.status_code == 200 and r.content == content, r.text[:100]
    r = client.get(f"/work-order-documents/{docs[0]['id']}/download", headers=dw["hb"])
    assert r.status_code == 403, r.text


def test_versioning_immutable_history(dw):
    wo = _rich_wo(dw["pid"], dw["va"]["id"], number="D5-WO-V-001")
    fin = _finalize_flow(wo["id"])
    assert fin["version"] == 2, fin  # finalize bumps display version
    # locked: edits blocked
    r = client.put(f"/work-orders/{wo['id']}", json={"subject": "tamper"},
                   headers=ADMIN)
    assert r.status_code == 409, r.text
    # new version keeps number, editable, v1 untouched
    r = client.post(f"/work-orders/{wo['id']}/new-version", headers=ADMIN)
    assert r.status_code == 201, r.text
    v2 = r.json()
    assert v2["work_order_number"] == "D5-WO-V-001" and v2["version"] == 3, v2
    assert v2["status"] == "DRAFT" and v2["is_locked"] == 0, v2
    assert len(v2["items"]) == 1 and v2["payment_terms_list"], v2
    r = client.put(f"/work-orders/{v2['id']}", json={"subject": "D5 subject v2-edit"},
                   headers=ADMIN)
    assert r.status_code == 200, r.text
    r = client.get(f"/work-orders/{wo['id']}", headers=ADMIN)
    assert r.json()["subject"] == "D5 subject" and r.json()["status"] == "FINALIZED", r.text


def test_supervisor_read_only_and_audit(dw):
    wo = _rich_wo(dw["pid"], dw["va"]["id"])
    # assigned supervisor can read, but cannot sign/upload
    r = client.get(f"/work-orders/{wo['id']}", headers=dw["sup"])
    assert r.status_code == 200, r.text
    r = client.post(f"/work-orders/{wo['id']}/sign", json={"signature_data": "x"},
                    headers=dw["sup"])
    assert r.status_code == 403, r.text
    _finalize_flow(wo["id"])
    r = client.get(f"/work-orders/{wo['id']}/pdf/download", headers=dw["sup"])
    assert r.status_code == 200, r.text[:100]
    # audit covers the document lifecycle
    r = client.get(f"/projects/{dw['pid']}/timeline", headers=ADMIN)
    actions = {a["action"] for a in r.json()}
    for expected in ("WORK_ORDER_CREATED", "WORK_ORDER_PDF_GENERATED",
                     "SIGNED_DOCUMENT_UPLOADED", "WORK_ORDER_VERSION_CREATED",
                     "WORK_ORDER_DOWNLOADED", "WORK_ORDER_FINALIZED"):
        assert expected in actions, (expected, sorted(actions))
