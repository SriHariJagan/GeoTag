"""Procurement router — RFQs, quotations, evaluations, awards, work orders."""
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.utils.dependencies import get_current_user, require_roles
from app.utils.pagination import page_param, limit_param, set_total
from app.core.rbac import normalize_role
from app.modules.procurement import schemas, service
from app.modules.procurement import models as pm

router = APIRouter(tags=["Procurement"])
ADMIN_ROLES = ("SUPERADMIN", "ADMIN")
_admin_only = require_roles(*ADMIN_ROLES)
_vendor_or_admin = require_roles("SUPERADMIN", "ADMIN", "VENDOR")


# ---------- RFQs ----------

@router.post("/rfqs", response_model=schemas.RFQResponse, status_code=201,
             dependencies=[Depends(_admin_only)])
def create_rfq(data: schemas.RFQCreate, db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    return service.create_rfq(db, data, current_user)


@router.get("/rfqs")
def list_rfqs(project_id: Optional[int] = None, q: Optional[str] = None,
              page: int = page_param(), limit: int = limit_param(),
              db: Session = Depends(get_db),
              current_user=Depends(get_current_user),
              response: Response = None):
    rows, total = service.list_rfqs(db, current_user, project_id=project_id,
                                    q=q, page=page, limit=limit)
    if response is not None:
        set_total(response, total)
    return rows


@router.get("/rfqs/{rfq_id}", response_model=schemas.RFQResponse)
def get_rfq(rfq_id: int, db: Session = Depends(get_db),
            current_user=Depends(get_current_user)):
    return service.get_rfq(db, rfq_id, current_user)


@router.put("/rfqs/{rfq_id}", response_model=schemas.RFQResponse,
            dependencies=[Depends(_admin_only)])
def update_rfq(rfq_id: int, data: schemas.RFQUpdate, db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    return service.update_rfq(db, rfq_id, data, current_user)


@router.post("/rfqs/{rfq_id}/send", dependencies=[Depends(_admin_only)])
def send_rfq(rfq_id: int, data: schemas.RFQSend, db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    return service.send_rfq(db, rfq_id, data.vendor_ids, current_user)


@router.get("/rfqs/{rfq_id}/vendors", response_model=list[schemas.RFQVendorResponse])
def rfq_vendors(rfq_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    rfq = service._rfq_or_404(db, rfq_id)
    if not service._can_see_rfq(db, current_user, rfq):
        raise HTTPException(status_code=403, detail="Not permitted for this RFQ")
    rows = db.query(pm.RFQVendor).filter(pm.RFQVendor.rfq_id == rfq_id).all()
    if normalize_role(current_user.role) == "VENDOR":
        # Vendors see only their own invitation rows (never competitors)
        orgs = set(service._vendor_orgs(db, current_user))
        rows = [r for r in rows if r.vendor_id in orgs]
        out = []
        for r in rows:
            out.append({"id": r.id, "rfq_id": r.rfq_id, "vendor_id": r.vendor_id,
                        "vendor_name": None, "status": r.status, "sent_at": r.sent_at})
        return out
    out = []
    for r in rows:
        out.append({"id": r.id, "rfq_id": r.rfq_id, "vendor_id": r.vendor_id,
                    "vendor_name": service._vendor_name(db, r.vendor_id),
                    "status": r.status, "sent_at": r.sent_at})
    return out


@router.post("/rfqs/{rfq_id}/viewed")
def rfq_viewed(rfq_id: int, vendor_id: int, db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    return service.mark_rfq_viewed(db, rfq_id, vendor_id, current_user)


@router.post("/rfqs/{rfq_id}/decline")
def rfq_decline(rfq_id: int, vendor_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.decline_rfq(db, rfq_id, vendor_id, current_user)


@router.post("/rfqs/{rfq_id}/close", dependencies=[Depends(_admin_only)])
def rfq_close(rfq_id: int, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    return service.close_rfq(db, rfq_id, current_user, action="CLOSED")


@router.post("/rfqs/{rfq_id}/cancel", dependencies=[Depends(_admin_only)])
def rfq_cancel(rfq_id: int, db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    return service.close_rfq(db, rfq_id, current_user, action="CANCELLED")


@router.post("/rfqs/{rfq_id}/items", response_model=schemas.RFQItemResponse,
             status_code=201, dependencies=[Depends(_admin_only)])
def add_rfq_item(rfq_id: int, data: schemas.RFQItemCreate,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    return service.add_rfq_item(db, rfq_id, data, current_user)


# ---------- Quotations ----------

@router.post("/quotations", response_model=schemas.QuotationResponse, status_code=201)
def submit_quotation(data: schemas.QuotationCreate, db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    if normalize_role(current_user.role) not in ("VENDOR", "SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    return service.submit_quotation(db, data, current_user)


@router.get("/rfqs/{rfq_id}/quotations")
def rfq_quotations(rfq_id: int, db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    return service.list_quotations(db, rfq_id, current_user)


@router.get("/quotations/{quotation_id}", response_model=schemas.QuotationResponse)
def get_quotation(quotation_id: int, db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    return service.get_quotation(db, quotation_id, current_user)


@router.get("/rfqs/{rfq_id}/compare")
def compare_rfq(rfq_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.compare_quotations(db, rfq_id, current_user)


@router.post("/quotations/{quotation_id}/documents",
             response_model=schemas.QuotationDocumentResponse, status_code=201)
def add_quotation_doc(quotation_id: int, data: schemas.QuotationDocumentCreate,
                      db: Session = Depends(get_db),
                      current_user=Depends(get_current_user)):
    q = db.query(pm.Quotation).filter(pm.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if normalize_role(current_user.role) == "VENDOR":
        service._require_vendor_link(db, current_user, q.vendor_id)
    elif not service._is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not permitted")
    rec = pm.QuotationDocument(quotation_id=quotation_id, storage_status="PENDING",
                               **data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


# ---------- Evaluation + award ----------

@router.post("/quotations/{quotation_id}/evaluate",
             response_model=schemas.EvaluationResponse,
             dependencies=[Depends(_admin_only)])
def evaluate(quotation_id: int, data: schemas.EvaluationCreate,
             db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    return service.evaluate_quotation(db, quotation_id, data, current_user)


@router.post("/rfqs/{rfq_id}/award", response_model=schemas.AwardResponse,
             status_code=201, dependencies=[Depends(_admin_only)])
def award(rfq_id: int, data: schemas.AwardCreate, db: Session = Depends(get_db),
          current_user=Depends(get_current_user)):
    return service.award_quotation(db, rfq_id, data, current_user)


@router.get("/rfqs/{rfq_id}/award", response_model=schemas.AwardResponse)
def get_award(rfq_id: int, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    if not service._is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not permitted")
    a = db.query(pm.Award).filter(pm.Award.rfq_id == rfq_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="No award for this RFQ")
    d = {c.name: getattr(a, c.name) for c in a.__table__.columns}
    d["vendor_name"] = service._vendor_name(db, a.vendor_id)
    return d


# ---------- Work orders ----------

@router.post("/work-orders", response_model=schemas.WorkOrderResponse, status_code=201,
             dependencies=[Depends(_admin_only)])
def create_wo(data: schemas.WorkOrderCreate, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    return service.create_work_order(db, data, current_user)


@router.put("/work-orders/{wo_id}", response_model=schemas.WorkOrderResponse,
            dependencies=[Depends(_admin_only)])
def update_wo(wo_id: int, data: schemas.WorkOrderUpdate, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    return service.update_work_order(db, wo_id, data, current_user)


@router.post("/work-orders/{wo_id}/send")
def send_wo(wo_id: int, data: schemas.WorkOrderSend, db: Session = Depends(get_db),
            current_user=Depends(get_current_user)):
    return service.send_work_order(db, wo_id, data.vendor_ids, current_user)


@router.get("/work-orders/{wo_id}/vendors",
            response_model=list[schemas.WorkOrderVendorResponse])
def wo_vendors(wo_id: int, db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    return service.list_wo_vendors(db, wo_id, current_user)


@router.post("/work-orders/{wo_id}/vendor-response")
def wo_vendor_response(wo_id: int, data: schemas.WorkOrderVendorRespond,
                       db: Session = Depends(get_db),
                       current_user=Depends(get_current_user)):
    from fastapi import Request as _Request  # local import to avoid cycle
    return service.vendor_respond_wo(db, wo_id, data.vendor_id, data.accept,
                                     current_user,
                                     reason=data.rejection_reason, ip=None)


@router.post("/work-orders/{wo_id}/viewed-vendor")
def wo_vendor_viewed(wo_id: int, vendor_id: int, db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    return service.mark_wo_viewed(db, wo_id, vendor_id, current_user)


@router.post("/work-orders/{wo_id}/review")
def review_wo(wo_id: int, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "IN_REVIEW", current_user,
                                         actor="admin")


@router.post("/work-orders/{wo_id}/pdf/generate")
def wo_pdf_generate(wo_id: int, db: Session = Depends(get_db),
                    current_user=Depends(get_current_user)):
    return service.generate_wo_pdf(db, wo_id, current_user)


@router.get("/work-orders/{wo_id}/pdf/preview")
def wo_pdf_preview(wo_id: int, db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    import os as _os
    from fastapi.responses import FileResponse as _FR
    wo = service.get_work_order(db, wo_id, current_user)
    rel = wo.get("pdf_path")
    if not rel:
        raise HTTPException(status_code=404, detail="PDF not generated yet")
    base = _os.path.join(_os.path.dirname(
        _os.path.dirname(_os.path.dirname(_os.path.dirname(__file__)))),
        "generated_pdfs")
    abs_path = _os.path.join(base, _os.path.basename(rel))
    if not _os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="PDF file missing; regenerate")
    # preview must render in the browser tab, not download
    return _FR(abs_path, media_type="application/pdf",
               filename=_os.path.basename(abs_path),
               content_disposition_type="inline")


@router.get("/work-orders/{wo_id}/pdf/download")
def wo_pdf_download(wo_id: int, db: Session = Depends(get_db),
                    current_user=Depends(get_current_user)):
    import os as _os
    from fastapi.responses import FileResponse as _FR
    wo = service.get_work_order(db, wo_id, current_user)
    rel = wo.get("pdf_path")
    if not rel:
        raise HTTPException(status_code=404, detail="PDF not generated yet")
    base = _os.path.join(_os.path.dirname(
        _os.path.dirname(_os.path.dirname(_os.path.dirname(__file__)))),
        "generated_pdfs")
    abs_path = _os.path.join(base, _os.path.basename(rel))
    if not _os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="PDF file missing; regenerate")
    from app.modules.users.audit import log_action
    log_action(db, action="WORK_ORDER_DOWNLOADED", actor_id=current_user.id,
               target_type="work_order", target_id=int(wo_id),
               metadata={"file": _os.path.basename(abs_path)})
    db.commit()
    return _FR(abs_path, media_type="application/pdf",
               filename=_os.path.basename(abs_path),
               headers={"Content-Disposition":
                        f"attachment; filename={_os.path.basename(abs_path)}"})


@router.post("/work-orders/{wo_id}/sign")
def wo_sign(wo_id: int, data: schemas.WorkOrderSign,
            db: Session = Depends(get_db),
            current_user=Depends(get_current_user)):
    return service.sign_work_order(db, wo_id, data.signature_data, current_user)


@router.post("/work-orders/{wo_id}/stamp")
def wo_stamp(wo_id: int, data: schemas.WorkOrderStamp,
             db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    return service.stamp_work_order(db, wo_id, data.stamp_data, current_user)


@router.post("/work-orders/{wo_id}/finalize")
def wo_finalize(wo_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.finalize_work_order(db, wo_id, current_user)


@router.post("/work-orders/{wo_id}/new-version",
            response_model=schemas.WorkOrderResponse, status_code=201)
def wo_new_version(wo_id: int, db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    return service.clone_new_version(db, wo_id, current_user)


@router.post("/work-orders/{wo_id}/duplicate",
             response_model=schemas.WorkOrderResponse, status_code=201)
def wo_duplicate(wo_id: int, project_id: Optional[int] = None,
                 work_order_number: Optional[str] = None,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    """Reuse a previous WO as a template for a brand-new DRAFT (fresh number)."""
    return service.duplicate_as_new(db, wo_id, current_user,
                                    project_id=project_id,
                                    work_order_number=work_order_number)


@router.get("/work-orders/numbering/next")
def wo_next_number(project_id: int, db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    return service.next_wo_number(db, project_id, current_user)


@router.get("/work-orders/{wo_id}/document")
def wo_document(wo_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    """Structured document payload for the live A4 preview (snapshot-first)."""
    return service.get_wo_document(db, wo_id, current_user)


@router.get("/work-orders/{wo_id}/documents",
            response_model=list[schemas.WorkOrderDocumentResponse])
def wo_documents(wo_id: int, db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    return service.list_documents(db, wo_id, current_user)


@router.post("/work-orders/{wo_id}/documents",
             response_model=schemas.WorkOrderResponse, status_code=201)
def wo_upload_document(wo_id: int, document_type: str = "SIGNED",
                       file: UploadFile = File(...),
                       db: Session = Depends(get_db),
                       current_user=Depends(get_current_user)):
    return service.upload_signed_document(
        db, wo_id, file, document_type, current_user, ip=None)


@router.get("/work-order-documents/{doc_id}/download")
def wo_document_download(doc_id: int, db: Session = Depends(get_db),
                         current_user=Depends(get_current_user)):
    from fastapi.responses import FileResponse as _FR
    import os as _os
    rec = service._doc_or_404(db, doc_id)
    wo = service._wo_or_404(db, rec.work_order_id)
    if not service._can_see_wo(db, current_user, wo):
        raise HTTPException(status_code=403, detail="Not permitted for this work order")
    p = service._doc_abs(rec)
    if not _os.path.exists(p):
        raise HTTPException(status_code=404, detail="Document file missing from storage")
    from app.modules.users.audit import log_action
    log_action(db, action="WORK_ORDER_DOWNLOADED", actor_id=current_user.id,
               target_type="work_order", target_id=wo.id,
               metadata={"document_id": rec.id, "type": rec.document_type})
    db.commit()
    return _FR(p, media_type=rec.mime_type or "application/pdf",
               filename=rec.file_name or f"WO-{wo.id}-{rec.document_type}",
               headers={"Content-Disposition":
                        f"attachment; filename={rec.file_name or 'document'}"})


@router.get("/work-order-documents/{doc_id}/verify",
            response_model=schemas.DocumentVerifyResponse)
def wo_document_verify(doc_id: int, db: Session = Depends(get_db),
                       current_user=Depends(get_current_user)):
    return service.verify_document(db, doc_id, current_user)


@router.get("/work-orders/{wo_id}/versions")
def wo_versions(wo_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.list_wo_versions(db, wo_id, current_user)


@router.get("/work-orders/vendors/eligible")
def eligible_vendors(search: Optional[str] = None, capability: Optional[str] = None,
                     limit: int = 50, db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    return service.eligible_vendors(db, current_user, search=search,
                                    capability=capability, limit=limit)


@router.get("/standard-terms", response_model=list[schemas.StandardTermResponse])
def list_terms(db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    return service.list_standard_terms(db)


@router.post("/standard-terms", response_model=schemas.StandardTermResponse,
             status_code=201, dependencies=[Depends(_admin_only)])
def create_term(data: schemas.StandardTermCreate, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.create_standard_term(db, data, current_user)


@router.get("/work-orders")
def list_wos(project_id: Optional[int] = None, vendor_id: Optional[int] = None,
             q: Optional[str] = None,
             page: int = page_param(), limit: int = limit_param(),
             db: Session = Depends(get_db),
             current_user=Depends(get_current_user),
             response: Response = None):
    rows, total = service.list_work_orders(db, current_user, project_id=project_id,
                                           vendor_id=vendor_id, q=q,
                                           page=page, limit=limit)
    if response is not None:
        set_total(response, total)
    return rows


@router.get("/work-orders/{wo_id}", response_model=schemas.WorkOrderResponse)
def get_wo(wo_id: int, db: Session = Depends(get_db),
           current_user=Depends(get_current_user)):
    return service.get_work_order(db, wo_id, current_user)


@router.post("/work-orders/{wo_id}/issue", dependencies=[Depends(_admin_only)])
def issue_wo(wo_id: int, db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "ISSUED", current_user, actor="admin")


@router.post("/work-orders/{wo_id}/viewed")
def viewed_wo(wo_id: int, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "VIEWED", current_user, actor="vendor")


@router.post("/work-orders/{wo_id}/accept")
def accept_wo(wo_id: int, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "ACCEPTED", current_user, actor="vendor")


@router.post("/work-orders/{wo_id}/reject")
def reject_wo(wo_id: int, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "REJECTED", current_user, actor="vendor")


@router.post("/work-orders/{wo_id}/progress", dependencies=[Depends(_admin_only)])
def progress_wo(wo_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "IN_PROGRESS", current_user,
                                         actor="admin")


@router.post("/work-orders/{wo_id}/complete", dependencies=[Depends(_admin_only)])
def complete_wo(wo_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "COMPLETED", current_user,
                                         actor="admin")


@router.post("/work-orders/{wo_id}/close", dependencies=[Depends(_admin_only)])
def close_wo(wo_id: int, db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "CLOSED", current_user, actor="admin")


@router.post("/work-orders/{wo_id}/cancel", dependencies=[Depends(_admin_only)])
def cancel_wo(wo_id: int, db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    return service.transition_work_order(db, wo_id, "CANCELLED", current_user,
                                         actor="admin")


# ---------- Vendor assignments (read-only; acceptance is the only writer) ----------

@router.get("/project-vendor-assignments")
def list_assignments(project_id: Optional[int] = None, db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    return service.list_vendor_assignments(db, current_user, project_id=project_id)


@router.post("/project-vendor-assignments/{assignment_id}/end",
             dependencies=[Depends(_admin_only)])
def end_assignment(assignment_id: int, status: str = "REMOVED", reason: str = "",
                   db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    return service.end_vendor_assignment(db, assignment_id, current_user,
                                         status=status, reason=reason)
