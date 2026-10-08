"""Procurement service — RFQ → quotation → evaluation → award → work order."""
from __future__ import annotations

from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from app.core.rbac import normalize_role
from app.modules.procurement import models as m
from app.modules.users.audit import log_action


# ---------- helpers ----------

def _is_admin(user) -> bool:
    return normalize_role(getattr(user, "role", "")) in ("SUPERADMIN", "ADMIN")


def _require_admin(user) -> None:
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Not permitted")


def _vendor_orgs(db: Session, user) -> list[int]:
    from app.modules.vendors import models as vm
    return [r.vendor_id for r in db.query(vm.VendorUser).filter(
        vm.VendorUser.user_id == user.id).all()]


def _require_vendor_link(db: Session, user, vendor_id: int) -> None:
    if vendor_id not in _vendor_orgs(db, user):
        raise HTTPException(status_code=403, detail="Not permitted for this vendor")


def _vendor_name(db: Session, vendor_id: int) -> str | None:
    from app.modules.vendors import models as vm
    v = db.query(vm.Vendor).filter(vm.Vendor.id == vendor_id).first()
    if not v:
        return None
    return v.legal_business_name or v.vendor_company


# ---------- structured JSON helpers (lists stay queryable arrays, never HTML) ----------

def _jloads(text: str | None, default):
    if not text:
        return default
    try:
        import json as _json
        val = _json.loads(text)
        return val if val is not None else default
    except (ValueError, TypeError):
        return default


def _jdumps(value) -> str | None:
    if value is None:
        return None
    import json as _json
    if isinstance(value, str):
        value = [value]
    cleaned = []
    for v in (value or []):
        if isinstance(v, str):
            v = v.strip()
            if v:
                cleaned.append(v)
        elif v is not None:
            cleaned.append(v)
    return _json.dumps(cleaned)


def _jloads_dict(text: str | None) -> dict | None:
    val = _jloads(text, None)
    return val if isinstance(val, dict) else None


def _jdumps_dict(value) -> str | None:
    if value is None:
        return None
    import json as _json
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail="vendor_override must be an object")
    cleaned = {str(k): v for k, v in value.items() if v is not None and v != ""}
    return _json.dumps(cleaned) if cleaned else None


def _normalize_team_supervisors(db: Session, supervisor_ids) -> list[int]:
    """Backend-enforced: only ACTIVE SUPERVISOR users (never pending/invited)."""
    from app.modules.users.models import User
    from app.core.rbac import normalize_role as _norm
    ids = []
    for sid in (supervisor_ids or []):
        try:
            sid = int(sid)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="team_supervisors must be user ids")
        if sid in ids:
            continue
        u = db.query(User).filter(User.id == sid).first()
        if not u:
            raise HTTPException(status_code=404, detail=f"Supervisor {sid} not found")
        if _norm(getattr(u, "role", "")) != "SUPERVISOR":
            raise HTTPException(status_code=400, detail=f"User {sid} is not a supervisor")
        if not u.is_active or (getattr(u, "account_status", "ACTIVE") or "ACTIVE") != "ACTIVE":
            raise HTTPException(status_code=400,
                                detail="User has not accepted the invitation and cannot be assigned.")
        ids.append(sid)
    return ids


def _normalize_team_machines(db: Session, machines) -> list[dict]:
    """[{machine_id, rate_per_day}] — machine must exist & be assignable;
    rate defaults to the machine master rate."""
    from app.modules.machinery.models import Machine
    out = []
    seen = set()
    for entry in (machines or []):
        if not isinstance(entry, dict) or entry.get("machine_id") is None:
            raise HTTPException(status_code=422,
                                detail="team_machines entries need {machine_id, rate_per_day?}")
        try:
            mid = int(entry["machine_id"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="machine_id must be an integer")
        if mid in seen:
            continue
        seen.add(mid)
        m = db.query(Machine).filter(Machine.id == mid).first()
        if not m:
            raise HTTPException(status_code=404, detail=f"Machine {mid} not found")
        if (m.status or "active").lower() in ("inactive", "maintenance"):
            raise HTTPException(status_code=400,
                                detail=f"Machine {mid} is {m.status} and cannot be used")
        rate = entry.get("rate_per_day")
        if rate is None or rate == "":
            rate = m.rate_per_day or 0
        try:
            rate = float(rate)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="rate_per_day must be a number")
        if rate < 0:
            raise HTTPException(status_code=422, detail="rate_per_day cannot be negative")
        out.append({"machine_id": mid,
                    "machine_name": m.machine_name,
                    "rate_per_day": round(rate, 2)})
    return out


def _jdumps_team_supervisors(db: Session, ids) -> str | None:
    import json as _json
    clean = _normalize_team_supervisors(db, ids)
    return _json.dumps(clean) if clean else None


def _jdumps_team_machines(db: Session, machines) -> str | None:
    import json as _json
    clean = _normalize_team_machines(db, machines)
    return _json.dumps(clean) if clean else None


def _rfq_or_404(db: Session, rfq_id: int) -> m.RFQ:
    rfq = db.query(m.RFQ).filter(m.RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return rfq


def _can_see_rfq(db: Session, user, rfq: m.RFQ) -> bool:
    if _is_admin(user):
        return True
    if normalize_role(getattr(user, "role", "")) == "VENDOR":
        return db.query(m.RFQVendor).filter(
            m.RFQVendor.rfq_id == rfq.id,
            m.RFQVendor.vendor_id.in_(_vendor_orgs(db, user))).first() is not None
    return False


def _serialize_rfq(db: Session, rfq: m.RFQ) -> dict:
    invites = db.query(m.RFQVendor).filter(m.RFQVendor.rfq_id == rfq.id).all()
    qcount = db.query(m.Quotation).filter(
        m.Quotation.rfq_id == rfq.id,
        m.Quotation.status.in_(["SUBMITTED", "EVALUATED", "AWARDED"])).count()
    d = {c.name: getattr(rfq, c.name) for c in rfq.__table__.columns}
    d["items"] = [{"id": i.id, "rfq_id": i.rfq_id, "description": i.description,
                   "category": i.category, "quantity": i.quantity, "unit": i.unit,
                   "technical_specification": i.technical_specification,
                   "estimated_rate": i.estimated_rate} for i in rfq.items]
    d["invited_vendors"] = [v.vendor_id for v in invites]
    d["quotation_count"] = qcount
    return d


def _serialize_quotation(db: Session, q: m.Quotation, include_internal: bool) -> dict:
    d = {c.name: getattr(q, c.name) for c in q.__table__.columns}
    d["vendor_name"] = _vendor_name(db, q.vendor_id)
    d["items"] = [{c.name: getattr(i, c.name) for c in i.__table__.columns}
                  for i in q.items]
    ev = db.query(m.Evaluation).filter(m.Evaluation.quotation_id == q.id).first()
    if ev:
        ed = {c.name: getattr(ev, c.name) for c in ev.__table__.columns}
        if not include_internal:
            ed.pop("evaluation_notes", None)
            ed.pop("is_internal", None)
        d["evaluation"] = ed
    else:
        d["evaluation"] = None
    return d


def _compute_quotation_totals(data_items, header) -> tuple[list[dict], float, float, float, float]:
    lines = []
    subtotal = 0.0
    line_tax = 0.0
    line_disc = 0.0
    for it in data_items:
        qty = it.quantity or 0
        line = qty * (it.unit_rate or 0) - (it.discount or 0) + (it.tax or 0)
        line = round(line, 2)
        subtotal += line
        line_tax += it.tax or 0
        line_disc += it.discount or 0
        lines.append({"item": it, "line_total": line})
    total = round(subtotal + (header.mobilization_cost or 0) + (header.delivery_cost or 0)
                  - 0 + 0, 2)
    # NOTE: header-level tax/discount are informational; total derives from lines
    # + mobilization + delivery. Frontend-submitted totals are ignored entirely.
    return lines, round(subtotal, 2), round(line_tax, 2), round(line_disc, 2), total


# ---------- RFQ ----------

def create_rfq(db: Session, data, user) -> dict:
    _require_admin(user)
    from app.modules.projects.models import Project
    if not db.query(Project).filter(Project.id == data.project_id).first():
        raise HTTPException(status_code=404, detail="Project not found")
    n = db.query(m.RFQ).filter(m.RFQ.project_id == data.project_id).count() + 1
    number = f"RFQ-{data.project_id}-{n:03d}"
    while db.query(m.RFQ).filter(m.RFQ.rfq_number == number).first():
        n += 1
        number = f"RFQ-{data.project_id}-{n:03d}"
    payload = data.model_dump(exclude={"items"})
    items = data.items
    rfq = m.RFQ(rfq_number=number, status="DRAFT", created_by=user.id, **payload)
    db.add(rfq)
    db.flush()
    for it in items:
        db.add(m.RFQItem(rfq_id=rfq.id, **it.model_dump()))
    log_action(db, action="RFQ_CREATED", actor_id=user.id, target_type="rfq",
               target_id=rfq.id, metadata={"number": number, "project_id": data.project_id})
    db.commit()
    db.refresh(rfq)
    return _serialize_rfq(db, rfq)


def update_rfq(db: Session, rfq_id: int, data, user) -> dict:
    _require_admin(user)
    rfq = _rfq_or_404(db, rfq_id)
    payload = data.model_dump(exclude_unset=True)
    if rfq.status != "DRAFT":
        # Locked after send except deadline + terms
        allowed = {"submission_deadline", "commercial_terms", "technical_terms"}
        extra = set(payload) - allowed
        if extra:
            raise HTTPException(status_code=409,
                                detail=f"RFQ is {rfq.status}; only deadline/terms editable")
    for k, v in payload.items():
        setattr(rfq, k, v)
    log_action(db, action="RFQ_UPDATED", actor_id=user.id, target_type="rfq",
               target_id=rfq.id, metadata={"fields": sorted(payload.keys())})
    db.commit()
    db.refresh(rfq)
    return _serialize_rfq(db, rfq)


def send_rfq(db: Session, rfq_id: int, vendor_ids: list[int], user) -> dict:
    _require_admin(user)
    from app.modules.vendors import models as vm
    rfq = _rfq_or_404(db, rfq_id)
    if rfq.status not in ("DRAFT", "SENT"):
        raise HTTPException(status_code=409, detail=f"Cannot send RFQ in {rfq.status}")
    if not vendor_ids:
        raise HTTPException(status_code=422, detail="At least one vendor required")
    sent = 0
    for vid in vendor_ids:
        vendor = db.query(vm.Vendor).filter(vm.Vendor.id == vid).first()
        if not vendor:
            raise HTTPException(status_code=404, detail=f"Vendor {vid} not found")
        if (vendor.status or "ACTIVE") != "ACTIVE":
            raise HTTPException(status_code=400,
                                detail=f"Vendor {vid} is {vendor.status}, not eligible")
        existing = db.query(m.RFQVendor).filter(
            m.RFQVendor.rfq_id == rfq_id, m.RFQVendor.vendor_id == vid).first()
        if existing:
            continue
        db.add(m.RFQVendor(rfq_id=rfq_id, vendor_id=vid, status="SENT"))
        sent += 1
    rfq.status = "SENT"
    log_action(db, action="RFQ_SENT", actor_id=user.id, target_type="rfq",
               target_id=rfq.id, metadata={"vendors": vendor_ids, "new": sent})
    db.commit()
    db.refresh(rfq)
    return _serialize_rfq(db, rfq)


def close_rfq(db: Session, rfq_id: int, user, action: str = "CLOSED") -> dict:
    _require_admin(user)
    rfq = _rfq_or_404(db, rfq_id)
    if action == "CANCELLED" and rfq.status in ("AWARDED", "CLOSED", "CANCELLED"):
        raise HTTPException(status_code=409, detail=f"Cannot cancel RFQ in {rfq.status}")
    if action == "CLOSED" and rfq.status not in ("AWARDED", "EVALUATING", "SENT"):
        raise HTTPException(status_code=409, detail=f"Cannot close RFQ in {rfq.status}")
    rfq.status = action
    log_action(db, action="RFQ_" + action, actor_id=user.id, target_type="rfq",
               target_id=rfq.id, metadata={})
    db.commit()
    db.refresh(rfq)
    return _serialize_rfq(db, rfq)


def add_rfq_item(db: Session, rfq_id: int, data, user) -> dict:
    _require_admin(user)
    rfq = _rfq_or_404(db, rfq_id)
    if rfq.status != "DRAFT":
        raise HTTPException(status_code=409,
                            detail=f"Cannot add items to RFQ in {rfq.status}")
    rec = m.RFQItem(rfq_id=rfq_id, **data.model_dump())
    db.add(rec)
    log_action(db, action="RFQ_UPDATED", actor_id=user.id, target_type="rfq",
               target_id=rfq_id, metadata={"op": "add_item"})
    db.commit()
    db.refresh(rec)
    return {c.name: getattr(rec, c.name) for c in rec.__table__.columns}


def list_rfqs(db: Session, user, project_id: int | None = None,
              q: str | None = None,
              page: int = 1, limit: int = 20) -> tuple[list[dict], int]:
    from app.utils.pagination import paginate_query
    query = db.query(m.RFQ)
    if project_id:
        query = query.filter(m.RFQ.project_id == project_id)
    if (q or "").strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            m.RFQ.rfq_number.ilike(like) | m.RFQ.title.ilike(like))
    if _is_admin(user) or normalize_role(getattr(user, "role", "")) == "MONITOR":
        rows, total = paginate_query(
            query.order_by(m.RFQ.id.desc()), page, limit)
        return [_serialize_rfq(db, r) for r in rows], total
    if normalize_role(getattr(user, "role", "")) == "VENDOR":
        orgs = _vendor_orgs(db, user)
        invited = db.query(m.RFQVendor.rfq_id).filter(
            m.RFQVendor.vendor_id.in_(orgs)).all() if orgs else []
        ids = {r[0] for r in invited}
        rows, total = paginate_query(
            query.filter(m.RFQ.id.in_(ids)).order_by(m.RFQ.id.desc()),
            page, limit) if ids else ([], 0)
        out = []
        for r in rows:
            d = _serialize_rfq(db, r)
            d.pop("quotation_count", None)
            out.append(d)
        return out, total
    raise HTTPException(status_code=403, detail="Not permitted")


def get_rfq(db: Session, rfq_id: int, user) -> dict:
    rfq = _rfq_or_404(db, rfq_id)
    if not _can_see_rfq(db, user, rfq):
        raise HTTPException(status_code=403, detail="Not permitted for this RFQ")
    d = _serialize_rfq(db, rfq)
    if normalize_role(getattr(user, "role", "")) == "VENDOR":
        d.pop("quotation_count", None)
    return d


def mark_rfq_viewed(db: Session, rfq_id: int, vendor_id: int, user) -> dict:
    # Admins record responses on behalf of vendors (vendors never log in).
    if not _is_admin(user):
        _require_vendor_link(db, user, vendor_id)
    inv = db.query(m.RFQVendor).filter(
        m.RFQVendor.rfq_id == rfq_id, m.RFQVendor.vendor_id == vendor_id).first()
    if not inv:
        raise HTTPException(status_code=403, detail="RFQ not sent to this vendor")
    if inv.status == "SENT":
        inv.status = "VIEWED"
        inv.viewed_at = datetime.utcnow()
        db.commit()
    return {"id": inv.id, "status": inv.status}


def decline_rfq(db: Session, rfq_id: int, vendor_id: int, user) -> dict:
    # Admins record responses on behalf of vendors (vendors never log in).
    if not _is_admin(user):
        _require_vendor_link(db, user, vendor_id)
    inv = db.query(m.RFQVendor).filter(
        m.RFQVendor.rfq_id == rfq_id, m.RFQVendor.vendor_id == vendor_id).first()
    if not inv:
        raise HTTPException(status_code=403, detail="RFQ not sent to this vendor")
    if inv.status == "QUOTATION_SUBMITTED":
        raise HTTPException(status_code=409, detail="Quotation already submitted")
    inv.status = "DECLINED"
    inv.responded_at = datetime.utcnow()
    log_action(db, action="RFQ_DECLINED", actor_id=user.id, target_type="rfq",
               target_id=rfq_id, metadata={"vendor_id": vendor_id})
    db.commit()
    return {"id": inv.id, "status": inv.status}


# ---------- Quotations ----------

def submit_quotation(db: Session, data, user) -> dict:
    if not _is_admin(user):
        _require_vendor_link(db, user, data.vendor_id)
    else:
        from app.modules.vendors import models as vm
        if not db.query(vm.Vendor).filter(vm.Vendor.id == data.vendor_id).first():
            raise HTTPException(status_code=404, detail="Vendor not found")
    rfq = _rfq_or_404(db, data.rfq_id)
    inv = db.query(m.RFQVendor).filter(
        m.RFQVendor.rfq_id == data.rfq_id, m.RFQVendor.vendor_id == data.vendor_id).first()
    if not inv:
        raise HTTPException(status_code=403, detail="RFQ not sent to this vendor")
    if inv.status == "DECLINED":
        raise HTTPException(status_code=409, detail="RFQ was declined by vendor")
    if rfq.status != "SENT":
        raise HTTPException(status_code=422,
                            detail=f"RFQ is {rfq.status}; submissions closed")
    if rfq.submission_deadline and datetime.utcnow() > rfq.submission_deadline:
        inv.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=422, detail="Submission deadline passed")
    # Snapshot RFQ item descriptions/units; validate rfq_item linkage
    rfq_items = {i.id: i for i in
                 db.query(m.RFQItem).filter(m.RFQItem.rfq_id == rfq.id).all()}
    for it in data.items:
        if it.rfq_item_id is not None and it.rfq_item_id not in rfq_items:
            raise HTTPException(status_code=422,
                                detail=f"RFQ item {it.rfq_item_id} not part of RFQ")
        if not it.description and it.rfq_item_id is not None:
            src = rfq_items[it.rfq_item_id]
            it.description = src.description
            it.unit = it.unit or src.unit
        if not it.description:
            raise HTTPException(status_code=422, detail="Item description required")
    lines, subtotal, tax, discount, total = _compute_quotation_totals(data.items, data)
    n = db.query(m.Quotation).filter(
        m.Quotation.rfq_id == data.rfq_id, m.Quotation.vendor_id == data.vendor_id).count() + 1
    number = f"Q-{data.rfq_id}-{data.vendor_id}-{n:02d}"
    # Supersede previous active quotation (history kept)
    prev = db.query(m.Quotation).filter(
        m.Quotation.rfq_id == data.rfq_id, m.Quotation.vendor_id == data.vendor_id,
        m.Quotation.status.in_(["DRAFT", "SUBMITTED"])).order_by(m.Quotation.id.desc()).first()
    payload = data.model_dump(exclude={"items"})
    q = m.Quotation(quotation_number=number, status="SUBMITTED", submitted_by=user.id,
                    submitted_at=datetime.utcnow(), subtotal=subtotal, tax=tax,
                    discount=discount, total=total,
                    supersedes_id=prev.id if prev else None, **payload)
    db.add(q)
    db.flush()
    for entry in lines:
        it = entry["item"]
        db.add(m.QuotationItem(quotation_id=q.id, rfq_item_id=it.rfq_item_id,
                               description=it.description, unit=it.unit,
                               quantity=it.quantity, unit_rate=it.unit_rate,
                               tax=it.tax, discount=it.discount,
                               line_total=entry["line_total"], remarks=it.remarks))
    if prev:
        prev.status = "SUPERSEDED"
    inv.status = "QUOTATION_SUBMITTED"
    inv.responded_at = datetime.utcnow()
    log_action(db, action="QUOTATION_SUBMITTED", actor_id=user.id, target_type="quotation",
               target_id=q.id, metadata={"number": number, "total": total,
                                         "supersedes": prev.id if prev else None})
    db.commit()
    db.refresh(q)
    return _serialize_quotation(db, q, include_internal=False)


def list_quotations(db: Session, rfq_id: int, user) -> list[dict]:
    rfq = _rfq_or_404(db, rfq_id)
    if not _can_see_rfq(db, user, rfq):
        raise HTTPException(status_code=403, detail="Not permitted for this RFQ")
    query = db.query(m.Quotation).filter(m.Quotation.rfq_id == rfq_id)
    if normalize_role(getattr(user, "role", "")) == "VENDOR":
        query = query.filter(m.Quotation.vendor_id.in_(_vendor_orgs(db, user)))
    rows = query.order_by(m.Quotation.id.desc()).all()
    internal = _is_admin(user)
    return [_serialize_quotation(db, q, include_internal=internal) for q in rows]


def get_quotation(db: Session, quotation_id: int, user) -> dict:
    q = db.query(m.Quotation).filter(m.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    rfq = _rfq_or_404(db, q.rfq_id)
    if not _can_see_rfq(db, user, rfq):
        raise HTTPException(status_code=403, detail="Not permitted")
    if normalize_role(getattr(user, "role", "")) == "VENDOR":
        _require_vendor_link(db, user, q.vendor_id)
    return _serialize_quotation(db, q, include_internal=_is_admin(user))


def compare_quotations(db: Session, rfq_id: int, user) -> dict:
    _require_admin(user)
    rfq = _rfq_or_404(db, rfq_id)
    rows = db.query(m.Quotation).filter(
        m.Quotation.rfq_id == rfq_id,
        m.Quotation.status.in_(["SUBMITTED", "EVALUATED", "AWARDED", "REJECTED"])
    ).order_by(m.Quotation.total.asc()).all()
    return {"rfq_id": rfq_id, "rfq_number": rfq.rfq_number,
            "quotations": [_serialize_quotation(db, q, include_internal=True)
                           for q in rows]}


# ---------- Evaluation + award ----------

def evaluate_quotation(db: Session, quotation_id: int, data, user) -> dict:
    _require_admin(user)
    q = db.query(m.Quotation).filter(m.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.status not in ("SUBMITTED", "EVALUATED"):
        raise HTTPException(status_code=409,
                            detail=f"Cannot evaluate quotation in {q.status}")
    scores = [s for s in (data.technical_score, data.commercial_score,
                          data.experience_score, data.capacity_score,
                          data.compliance_score) if s is not None]
    overall = round(sum(scores) / len(scores), 2)
    ev = db.query(m.Evaluation).filter(m.Evaluation.quotation_id == q.id).first()
    if ev:
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(ev, k, v)
        ev.overall_score = overall
        ev.evaluated_by = user.id
        ev.evaluated_at = datetime.utcnow()
    else:
        ev = m.Evaluation(quotation_id=q.id, overall_score=overall,
                          evaluated_by=user.id, **data.model_dump())
        db.add(ev)
    q.status = "EVALUATED"
    rfq = _rfq_or_404(db, q.rfq_id)
    if rfq.status == "SENT":
        rfq.status = "EVALUATING"
    log_action(db, action="QUOTATION_EVALUATED", actor_id=user.id,
               target_type="quotation", target_id=q.id,
               metadata={"overall": overall})
    db.commit()
    db.refresh(ev)
    return {c.name: getattr(ev, c.name) for c in ev.__table__.columns}


def award_quotation(db: Session, rfq_id: int, data, user) -> dict:
    _require_admin(user)
    rfq = _rfq_or_404(db, rfq_id)
    if db.query(m.Award).filter(m.Award.rfq_id == rfq_id).first():
        raise HTTPException(status_code=409, detail="RFQ already awarded")
    q = db.query(m.Quotation).filter(
        m.Quotation.id == data.quotation_id, m.Quotation.rfq_id == rfq_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found for this RFQ")
    if q.status not in ("SUBMITTED", "EVALUATED"):
        raise HTTPException(status_code=409,
                            detail=f"Cannot award quotation in {q.status}")
    award = m.Award(rfq_id=rfq_id, quotation_id=q.id, vendor_id=q.vendor_id,
                    selected_by=user.id, award_reason=data.award_reason,
                    internal_notes=data.internal_notes,
                    lowest_compliant=data.lowest_compliant)
    db.add(award)
    q.status = "AWARDED"
    db.query(m.Quotation).filter(
        m.Quotation.rfq_id == rfq_id, m.Quotation.id != q.id,
        m.Quotation.status.in_(["SUBMITTED", "EVALUATED"])).update(
        {"status": "REJECTED"}, synchronize_session=False)
    rfq.status = "AWARDED"
    log_action(db, action="VENDOR_AWARDED", actor_id=user.id, target_type="rfq",
               target_id=rfq_id, metadata={"vendor_id": q.vendor_id,
                                           "quotation_id": q.id,
                                           "reason": data.award_reason or ""})
    db.commit()
    db.refresh(award)
    d = {c.name: getattr(award, c.name) for c in award.__table__.columns}
    d["vendor_name"] = _vendor_name(db, award.vendor_id)
    return d


# ---------- Work orders (wizard + direct + award-linked) ----------

def _compute_wo_totals(items: list, discount: float = 0.0,
                       tax: float = 0.0, other: float = 0.0):
    """Server-side BOQ math. Never trust frontend totals."""
    lines = []
    subtotal = 0.0
    for idx, it in enumerate(items or [], start=1):
        qty = float(it.get("quantity") or 0) if isinstance(it, dict) else float(it.quantity or 0)
        rate = float(it.get("unit_rate") or 0) if isinstance(it, dict) else float(it.unit_rate or 0)
        if qty < 0 or rate < 0:
            raise HTTPException(status_code=422, detail="quantity/rate cannot be negative")
        line = round(qty * rate, 2)
        subtotal += line
        desc = it.get("description") if isinstance(it, dict) else it.description
        if not desc:
            raise HTTPException(status_code=422, detail="BOQ item description required")
        lines.append({"item": it, "line_total": line, "seq": idx})
    subtotal = round(subtotal, 2)
    discount = round(float(discount or 0), 2)
    tax = round(float(tax or 0), 2)
    other = round(float(other or 0), 2)
    if discount < 0 or tax < 0 or other < 0:
        raise HTTPException(status_code=422, detail="discount/tax/charges cannot be negative")
    if discount > subtotal:
        raise HTTPException(status_code=422, detail="discount cannot exceed subtotal")
    grand = round(subtotal - discount + tax + other, 2)
    return lines, subtotal, discount, tax, other, grand


def _next_wo_number(db: Session, project_id: int) -> str:
    n = db.query(m.WorkOrder).filter(m.WorkOrder.project_id == project_id).count() + 1
    number = f"WO-{project_id}-{n:03d}"
    while db.query(m.WorkOrder).filter(m.WorkOrder.work_order_number == number).first():
        n += 1
        number = f"WO-{project_id}-{n:03d}"
    return number


def _assert_wo_editable(wo: m.WorkOrder) -> None:
    if getattr(wo, "is_locked", 0) == 1 or wo.status in ("FINALIZED", "SIGNED", "STAMPED"):
        raise HTTPException(status_code=409,
                            detail="Signed/finalized work order is locked. Create a new version.")
    if wo.status not in ("DRAFT", "IN_REVIEW", "PDF_GENERATED"):
        raise HTTPException(status_code=409,
                            detail=f"Cannot edit work order in {wo.status}")


def create_work_order(db: Session, data, user) -> dict:
    _require_admin(user)
    from app.modules.projects.models import Project
    from app.modules.vendors import models as vm
    project = db.query(Project).filter(Project.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    vendor = None
    if data.vendor_id is not None:
        vendor = db.query(vm.Vendor).filter(vm.Vendor.id == data.vendor_id).first()
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        if (vendor.status or "ACTIVE") != "ACTIVE":
            raise HTTPException(status_code=400,
                                detail=f"Vendor is {vendor.status}, not eligible")
    quotation = None
    if data.quotation_id is not None:
        quotation = db.query(m.Quotation).filter(
            m.Quotation.id == data.quotation_id).first()
        if not quotation:
            raise HTTPException(status_code=404, detail="Quotation not found")
        if quotation.status != "AWARDED":
            raise HTTPException(status_code=409,
                                detail="Work order requires an AWARDED quotation")
        if data.vendor_id is not None and quotation.vendor_id != data.vendor_id:
            raise HTTPException(status_code=422, detail="Vendor/quotation mismatch")
        award = db.query(m.Award).filter(m.Award.quotation_id == quotation.id).first()
        if not award:
            raise HTTPException(status_code=409, detail="Quotation has no award record")
        if data.rfq_id is not None and data.rfq_id != quotation.rfq_id:
            raise HTTPException(status_code=422, detail="RFQ/quotation mismatch")
        data = data.model_copy(update={"rfq_id": quotation.rfq_id,
                                       "vendor_id": quotation.vendor_id})
        vendor = db.query(vm.Vendor).filter(vm.Vendor.id == quotation.vendor_id).first()
    # Work order number: custom (wizard) or auto. Duplicates -> 409.
    number = (data.work_order_number or "").strip() if data.work_order_number else ""
    if number:
        if db.query(m.WorkOrder).filter(m.WorkOrder.work_order_number == number).first():
            raise HTTPException(status_code=409, detail="Work order number already exists")
    else:
        number = _next_wo_number(db, data.project_id)
    payload = data.model_dump(exclude={"items", "work_order_number",
                                         "payment_terms_list", "general_terms",
                                         "vendor_override", "team_supervisors",
                                         "team_machines"})
    payload["payment_terms_json"] = _jdumps(data.payment_terms_list)
    payload["general_terms_json"] = _jdumps(data.general_terms)
    payload["vendor_override_json"] = _jdumps_dict(data.vendor_override)
    payload["team_supervisors_json"] = _jdumps_team_supervisors(db, data.team_supervisors)
    payload["team_machines_json"] = _jdumps_team_machines(db, data.team_machines)
    raw_items = [i.model_dump() for i in (data.items or [])]
    if not raw_items and quotation is not None:
        # Snapshot awarded quotation lines by default
        qitems = db.query(m.QuotationItem).filter(
            m.QuotationItem.quotation_id == quotation.id).all()
        raw_items = [{"description": qi.description, "quantity": qi.quantity,
                      "unit": qi.unit, "unit_rate": qi.unit_rate} for qi in qitems]
    lines, subtotal, discount, tax, other, grand = _compute_wo_totals(
        raw_items, payload.get("discount"), payload.get("tax_amount"),
        payload.get("other_charges"))
    # Snapshot project header if wizard left blanks
    if not payload.get("project_name"):
        payload["project_name"] = project.name
    if not payload.get("client_name"):
        payload["client_name"] = project.client_name
    if not payload.get("location"):
        payload["location"] = project.location
    if not payload.get("work_order_date"):
        from datetime import date as _date
        payload["work_order_date"] = _date.today()
    payload["subtotal"] = subtotal
    payload["discount"] = discount
    payload["tax_amount"] = tax
    payload["other_charges"] = other
    payload["grand_total"] = grand
    wo = m.WorkOrder(work_order_number=number, status="DRAFT",
                     contract_value=0.0, version=1, is_locked=0, **payload)
    # vendor_id may be None for multi-vendor direct WO (set at send time)
    db.add(wo)
    db.flush()
    for seq, entry in enumerate(lines, start=1):
        it = entry["item"]
        db.add(m.WorkOrderItem(
            work_order_id=wo.id,
            item_number=it.get("item_number") or f"{seq}",
            description=it.get("description"),
            sub_description=it.get("sub_description"),
            quantity=it.get("quantity"), unit=it.get("unit"),
            unit_rate=it.get("unit_rate"), line_total=entry["line_total"]))
    log_action(db, action="WORK_ORDER_CREATED", actor_id=user.id,
               target_type="work_order", target_id=wo.id,
               metadata={"number": number, "vendor_id": data.vendor_id,
                         "project_id": data.project_id, "grand_total": grand})
    db.commit()
    db.refresh(wo)
    return _serialize_wo(db, wo)


def update_work_order(db: Session, wo_id: int, data, user) -> dict:
    _require_admin(user)
    wo = _wo_or_404(db, wo_id)
    _assert_wo_editable(wo)
    payload = data.model_dump(exclude_unset=True, exclude={"items", "payment_terms_list",
                                                           "general_terms",
                                                           "vendor_override",
                                                           "team_supervisors",
                                                           "team_machines"})
    if data.payment_terms_list is not None:
        wo.payment_terms_json = _jdumps(data.payment_terms_list)
    if data.general_terms is not None:
        wo.general_terms_json = _jdumps(data.general_terms)
    if data.vendor_override is not None:
        wo.vendor_override_json = _jdumps_dict(data.vendor_override)
    if data.team_supervisors is not None:
        wo.team_supervisors_json = _jdumps_team_supervisors(db, data.team_supervisors)
    if data.team_machines is not None:
        wo.team_machines_json = _jdumps_team_machines(db, data.team_machines)
    items = data.items  # may be None (no change) or list (replace)
    for k, v in payload.items():
        if hasattr(wo, k):
            setattr(wo, k, v)
    if items is not None:
        raw = [i.model_dump() for i in items]
        lines, subtotal, discount, tax, other, grand = _compute_wo_totals(
            raw, payload.get("discount", wo.discount),
            payload.get("tax_amount", wo.tax_amount),
            payload.get("other_charges", wo.other_charges))
        wo.subtotal, wo.discount, wo.tax_amount = subtotal, discount, tax
        wo.other_charges, wo.grand_total = other, grand
        db.query(m.WorkOrderItem).filter(
            m.WorkOrderItem.work_order_id == wo.id).delete(synchronize_session=False)
        for seq, entry in enumerate(lines, start=1):
            it = entry["item"]
            db.add(m.WorkOrderItem(
                work_order_id=wo.id,
                item_number=it.get("item_number") or f"{seq}",
                description=it.get("description"),
                sub_description=it.get("sub_description"),
                quantity=it.get("quantity"), unit=it.get("unit"),
                unit_rate=it.get("unit_rate"), line_total=entry["line_total"]))
    log_action(db, action="WORK_ORDER_UPDATED", actor_id=user.id,
               target_type="work_order", target_id=wo.id,
               metadata={"fields": sorted(payload.keys()),
                         "items_replaced": items is not None})
    db.commit()
    db.refresh(wo)
    return _serialize_wo(db, wo)


def _serialize_wo(db: Session, wo: m.WorkOrder) -> dict:
    skip = {"payment_terms_json", "general_terms_json", "vendor_override_json",
            "team_supervisors_json", "team_machines_json",
            "vendor_snapshot", "project_snapshot", "company_snapshot"}
    d = {c.name: getattr(wo, c.name) for c in wo.__table__.columns if c.name not in skip}
    d["vendor_name"] = _vendor_name(db, wo.vendor_id) if wo.vendor_id else None
    d["payment_terms_list"] = _jloads(wo.payment_terms_json, [])
    d["general_terms"] = _jloads(wo.general_terms_json, [])
    d["vendor_override"] = _jloads_dict(wo.vendor_override_json)
    d["team_supervisors"] = _jloads(wo.team_supervisors_json, [])
    d["team_machines"] = _jloads(wo.team_machines_json, [])
    d["vendor_snapshot"] = _jloads(wo.vendor_snapshot, None)
    d["project_snapshot"] = _jloads(wo.project_snapshot, None)
    d["company_snapshot"] = _jloads(wo.company_snapshot, None)
    d["items"] = [{c.name: getattr(i, c.name) for c in i.__table__.columns}
                  for i in wo.items]
    try:
        docs = db.query(m.WorkOrderDocument).filter(
            m.WorkOrderDocument.work_order_id == wo.id).order_by(
            m.WorkOrderDocument.id.desc()).all()
        d["documents"] = [{c.name: getattr(x, c.name) for c in x.__table__.columns
                           if c.name != "storage_path"} for x in docs]
    except Exception:
        d["documents"] = []
    try:
        invites = db.query(m.WorkOrderVendor).filter(
            m.WorkOrderVendor.work_order_id == wo.id).all()
        d["vendor_invites"] = [
            {"id": r.id, "work_order_id": r.work_order_id, "vendor_id": r.vendor_id,
             "vendor_name": _vendor_name(db, r.vendor_id), "status": r.status,
             "sent_at": r.sent_at, "viewed_at": r.viewed_at,
             "accepted_at": r.accepted_at, "rejected_at": r.rejected_at,
             "rejection_reason": r.rejection_reason} for r in invites]
    except Exception:
        d["vendor_invites"] = []
    return d


def _wo_or_404(db: Session, wo_id: int) -> m.WorkOrder:
    wo = db.query(m.WorkOrder).filter(m.WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


def _can_see_wo(db: Session, user, wo: m.WorkOrder) -> bool:
    if _is_admin(user):
        return True
    if normalize_role(getattr(user, "role", "")) == "MONITOR":
        return True  # read-only oversight sees every work order
    role = normalize_role(getattr(user, "role", ""))
    if role == "VENDOR":
        orgs = set(_vendor_orgs(db, user))
        if wo.vendor_id is not None and wo.vendor_id in orgs:
            return True
        inv = db.query(m.WorkOrderVendor).filter(
            m.WorkOrderVendor.work_order_id == wo.id,
            m.WorkOrderVendor.vendor_id.in_(orgs)).first() if orgs else None
        return inv is not None
    if role == "SUPERVISOR":
        # Read-only visibility for WOs of assigned projects (never mutate here).
        from app.modules.projects.service import is_supervisor_assigned
        try:
            return bool(is_supervisor_assigned(db, wo.project_id, user.id))
        except Exception:
            return False
    return False


def get_work_order(db: Session, wo_id: int, user) -> dict:
    wo = _wo_or_404(db, wo_id)
    if not _can_see_wo(db, user, wo):
        raise HTTPException(status_code=403, detail="Not permitted for this work order")
    return _serialize_wo(db, wo)


def list_work_orders(db: Session, user, project_id: int | None = None,
                      vendor_id: int | None = None, q: str | None = None,
                      page: int = 1, limit: int = 20) -> tuple[list[dict], int]:
    from app.utils.pagination import paginate_query
    query = db.query(m.WorkOrder)
    if project_id:
        query = query.filter(m.WorkOrder.project_id == project_id)
    if (q or "").strip():
        like = f"%{q.strip()}%"
        query = query.filter(m.WorkOrder.work_order_number.ilike(like))
    if _is_admin(user) or normalize_role(getattr(user, "role", "")) == "MONITOR":
        if vendor_id:
            query = query.filter(m.WorkOrder.vendor_id == vendor_id)
        rows, total = paginate_query(
            query.order_by(m.WorkOrder.id.desc()), page, limit)
        return [_serialize_wo(db, w) for w in rows], total
    if normalize_role(getattr(user, "role", "")) == "VENDOR":
        orgs = _vendor_orgs(db, user)
        if not orgs:
            return [], 0
        invited_ids = [r[0] for r in db.query(m.WorkOrderVendor.work_order_id).filter(
            m.WorkOrderVendor.vendor_id.in_(orgs)).all()]
        from sqlalchemy import or_ as _or
        query = query.filter(_or(m.WorkOrder.vendor_id.in_(orgs),
                                 m.WorkOrder.id.in_(invited_ids)) if invited_ids
                             else m.WorkOrder.vendor_id.in_(orgs))
        rows, total = paginate_query(
            query.order_by(m.WorkOrder.id.desc()), page, limit)
        return [_serialize_wo(db, w) for w in rows], total
    if normalize_role(getattr(user, "role", "")) == "SUPERVISOR":
        from app.modules.projects.service import get_projects_for_supervisor
        try:
            pids = [p.id for p in get_projects_for_supervisor(db, user.id)]
        except Exception:
            pids = []
        if not pids:
            return [], 0
        query = query.filter(m.WorkOrder.project_id.in_(pids))
        rows, total = paginate_query(
            query.order_by(m.WorkOrder.id.desc()), page, limit)
        return [_serialize_wo(db, w) for w in rows], total
    raise HTTPException(status_code=403, detail="Not permitted")


def transition_work_order(db: Session, wo_id: int, to_status: str, user,
                          actor: str = "admin") -> dict:
    from app.core.rbac import WO_TRANSITIONS
    wo = _wo_or_404(db, wo_id)
    if to_status not in WO_TRANSITIONS:
        raise HTTPException(status_code=422, detail="Unknown work order status")
    if to_status not in WO_TRANSITIONS.get(wo.status, set()):
        raise HTTPException(status_code=409,
                            detail=f"Invalid transition {wo.status} -> {to_status}")
    if actor == "vendor":
        if wo.vendor_id is None:
            raise HTTPException(status_code=409,
                                detail="Multi-vendor WO: respond via vendor-response endpoint")
        _require_vendor_link(db, user, wo.vendor_id)
        if to_status not in ("VIEWED", "ACCEPTED", "REJECTED"):
            raise HTTPException(status_code=403, detail="Vendors cannot set " + to_status)
    else:
        _require_admin(user)
    if wo.status in ("SIGNED", "STAMPED", "FINALIZED") and to_status not in (
            "STAMPED", "FINALIZED", "ISSUED", "CANCELLED"):
        raise HTTPException(status_code=409, detail="Signed work order is locked")
    wo.status = to_status
    now = datetime.utcnow()
    action = "WORK_ORDER_" + to_status
    if to_status == "IN_REVIEW":
        wo.reviewed_at = now
        wo.reviewed_by = user.id
    elif to_status == "ISSUED":
        # Freeze contract value (= grand_total, or awarded quotation total if linked)
        if wo.quotation_id:
            q = db.query(m.Quotation).filter(m.Quotation.id == wo.quotation_id).first()
            wo.contract_value = (q.total if q else 0.0) or (wo.grand_total or 0.0)
        else:
            wo.contract_value = wo.grand_total or 0.0
        wo.issued_at = now
        wo.issued_by = user.id if actor == "admin" else wo.issued_by
    elif to_status == "VIEWED":
        wo.viewed_at = now
    elif to_status == "ACCEPTED":
        wo.accepted_at = now
        wo.accepted_by = user.id
        if wo.vendor_id is None:
            raise HTTPException(status_code=409,
                                detail="Multi-vendor WO: respond via vendor-response endpoint")
        activate_vendor_assignment(db, wo, actor_id=user.id)
        action = "WORK_ORDER_ACCEPTED"
    elif to_status == "REJECTED":
        wo.rejected_at = now
        wo.rejected_by = user.id
        action = "WORK_ORDER_REJECTED"
    elif to_status == "COMPLETED":
        wo.completed_at = now
    log_action(db, action=action, actor_id=user.id, target_type="work_order",
               target_id=wo.id, metadata={"vendor_id": wo.vendor_id})
    db.commit()
    db.refresh(wo)
    return _serialize_wo(db, wo)


def activate_vendor_assignment(db: Session, wo: m.WorkOrder, actor_id: int | None) -> dict:
    """Single writer of project_vendor_assignments. Called only on acceptance."""
    existing = db.query(m.ProjectVendorAssignment).filter(
        m.ProjectVendorAssignment.work_order_id == wo.id,
        m.ProjectVendorAssignment.status == "ACTIVE").first()
    if existing:
        raise HTTPException(status_code=409, detail="Vendor already assigned for this work order")
    rec = m.ProjectVendorAssignment(
        project_id=wo.project_id, vendor_id=wo.vendor_id, work_order_id=wo.id,
        status="ACTIVE", assigned_by=actor_id, scope=wo.scope_of_work,
        start_date=wo.start_date, end_date=wo.end_date)
    db.add(rec)
    # Legacy sync for old DER/vendor views
    from app.modules.projects.models import ProjectVendor
    if not db.query(ProjectVendor).filter(
            ProjectVendor.project_id == wo.project_id,
            ProjectVendor.vendor_id == wo.vendor_id).first():
        db.add(ProjectVendor(project_id=wo.project_id, vendor_id=wo.vendor_id))
    log_action(db, action="VENDOR_ASSIGNED", actor_id=actor_id,
               target_type="project", target_id=wo.project_id,
               metadata={"vendor_id": wo.vendor_id, "work_order_id": wo.id})
    db.flush()
    # Team chosen inside the WO auto-reflects to the project on acceptance.
    sync_wo_team_to_project(db, wo, actor_id)
    return {"id": rec.id, "status": rec.status}


def sync_wo_team_to_project(db: Session, wo: m.WorkOrder, actor_id: int | None) -> dict:
    """Reflect WO team (supervisors + machinery) onto the project.

    Projects may be created with an empty team; the accepted work order is
    the source of truth. Eligibility re-validated here (never trusted blindly).
    Machines are force-linked with an audit note (WO instruction wins).
    """
    from app.modules.projects import service as _psvc
    synced = {"supervisors": [], "machines": []}
    for sid in (_jloads(wo.team_supervisors_json, []) or []):
        try:
            _psvc.assign_supervisor_to_project(db, wo.project_id, int(sid),
                                               actor_id=actor_id)
            synced["supervisors"].append(int(sid))
        except HTTPException:
            continue
    for entry in (_jloads(wo.team_machines_json, []) or []):
        try:
            mid = int((entry or {}).get("machine_id"))
        except (TypeError, ValueError):
            continue
        try:
            _psvc.assign_machine_to_project(db, wo.project_id, mid,
                                            actor_id=actor_id, force=True)
            synced["machines"].append(mid)
        except HTTPException:
            continue
    if synced["supervisors"] or synced["machines"]:
        log_action(db, action="WO_TEAM_SYNCED", actor_id=actor_id,
                   target_type="work_order", target_id=wo.id, metadata=synced)
        db.flush()
    return synced


def end_vendor_assignment(db: Session, assignment_id: int, user,
                          status: str = "REMOVED", reason: str = "") -> dict:
    _require_admin(user)
    if status not in ("COMPLETED", "CANCELLED", "REMOVED"):
        raise HTTPException(status_code=422, detail="Invalid end status")
    rec = db.query(m.ProjectVendorAssignment).filter(
        m.ProjectVendorAssignment.id == assignment_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if rec.status != "ACTIVE":
        raise HTTPException(status_code=409, detail=f"Assignment is {rec.status}")
    rec.status = status
    rec.removed_at = datetime.utcnow()
    rec.removed_by = user.id
    rec.removal_reason = reason
    log_action(db, action="VENDOR_REMOVED", actor_id=user.id,
               target_type="project", target_id=rec.project_id,
               metadata={"vendor_id": rec.vendor_id, "reason": reason})
    db.commit()
    return {"id": rec.id, "status": rec.status}


def list_vendor_assignments(db: Session, user, project_id: int | None = None) -> list[dict]:
    query = db.query(m.ProjectVendorAssignment)
    if project_id:
        query = query.filter(m.ProjectVendorAssignment.project_id == project_id)
    role = normalize_role(getattr(user, "role", ""))
    if _is_admin(user):
        rows = query.order_by(m.ProjectVendorAssignment.id.desc()).all()
    elif role == "VENDOR":
        rows = query.filter(m.ProjectVendorAssignment.vendor_id.in_(
            _vendor_orgs(db, user))).all()
    elif role == "SUPERVISOR":
        from app.modules.projects.service import get_projects_for_supervisor
        pids = [p.id for p in get_projects_for_supervisor(db, user.id)]
        rows = query.filter(m.ProjectVendorAssignment.project_id.in_(pids)).all() \
            if pids else []
    else:
        raise HTTPException(status_code=403, detail="Not permitted")
    out = []
    for r in rows:
        d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
        d["vendor_name"] = _vendor_name(db, r.vendor_id)
        out.append(d)
    return out


# ---------- Direct WO multi-vendor send / respond ----------

def _eligible_vendor_or_400(db: Session, vendor_id: int):
    from app.modules.vendors import models as vm
    vendor = db.query(vm.Vendor).filter(vm.Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    if (vendor.status or "ACTIVE") != "ACTIVE":
        raise HTTPException(status_code=400,
                            detail="Vendor has not accepted the Work Order and cannot be assigned "
                            "to this project." if False else
                            f"Vendor {vendor_id} is {vendor.status}, not eligible")
    return vendor


def send_work_order(db: Session, wo_id: int, vendor_ids: list[int], user) -> dict:
    """Send (issue-invite) a work order to one or more eligible vendors."""
    _require_admin(user)
    wo = _wo_or_404(db, wo_id)
    # Sending = inviting vendors (allowed from draft through issued; sending a
    # finalized/locked WO only adds invite rows — never edits the document).
    if wo.status in ("CANCELLED", "CLOSED", "REJECTED", "COMPLETED"):
        raise HTTPException(status_code=409, detail=f"Cannot send WO in {wo.status}")
    if not vendor_ids:
        raise HTTPException(status_code=422, detail="At least one vendor required")
    sent = 0
    for vid in vendor_ids:
        _eligible_vendor_or_400(db, vid)
        existing = db.query(m.WorkOrderVendor).filter(
            m.WorkOrderVendor.work_order_id == wo_id,
            m.WorkOrderVendor.vendor_id == vid).first()
        if existing:
            continue
        db.add(m.WorkOrderVendor(work_order_id=wo_id, vendor_id=vid,
                                 status="SENT", sent_by=user.id))
        sent += 1
    # Single-vendor WO convenience: pin vendor_id when exactly one vendor targeted
    # and WO has no vendor yet.
    if wo.vendor_id is None and len(vendor_ids) == 1:
        wo.vendor_id = vendor_ids[0]
    log_action(db, action="WORK_ORDER_SENT", actor_id=user.id,
               target_type="work_order", target_id=wo.id,
               metadata={"vendors": vendor_ids, "new": sent})
    db.commit()
    db.refresh(wo)
    return _serialize_wo(db, wo)


def list_wo_vendors(db: Session, wo_id: int, user) -> list[dict]:
    wo = _wo_or_404(db, wo_id)
    if not _can_see_wo(db, user, wo) and not _is_admin(user):
        # enlisted vendors may see their own row only
        pass
    rows = db.query(m.WorkOrderVendor).filter(
        m.WorkOrderVendor.work_order_id == wo_id).all()
    if normalize_role(getattr(user, "role", "")) == "VENDOR":
        orgs = set(_vendor_orgs(db, user))
        rows = [r for r in rows if r.vendor_id in orgs]
        return [{"id": r.id, "work_order_id": r.work_order_id, "vendor_id": r.vendor_id,
                 "vendor_name": None, "status": r.status, "sent_at": r.sent_at,
                 "viewed_at": r.viewed_at, "accepted_at": r.accepted_at,
                 "rejected_at": r.rejected_at,
                 "rejection_reason": r.rejection_reason} for r in rows]
    return [{"id": r.id, "work_order_id": r.work_order_id, "vendor_id": r.vendor_id,
             "vendor_name": _vendor_name(db, r.vendor_id), "status": r.status,
             "sent_at": r.sent_at, "viewed_at": r.viewed_at,
             "accepted_at": r.accepted_at, "rejected_at": r.rejected_at,
             "rejection_reason": r.rejection_reason} for r in rows]


def vendor_respond_wo(db: Session, wo_id: int, vendor_id: int, accept: bool,
                      user, reason: str | None = None, ip: str | None = None) -> dict:
    """Vendor ACCEPT/REJECT with timestamps, reason, actor + audit."""
    from app.modules.vendors import models as vm
    # Admins record responses on behalf of vendors (vendors never log in).
    if not _is_admin(user):
        _require_vendor_link(db, user, vendor_id)
    wo = _wo_or_404(db, wo_id)
    inv = db.query(m.WorkOrderVendor).filter(
        m.WorkOrderVendor.work_order_id == wo_id,
        m.WorkOrderVendor.vendor_id == vendor_id).first()
    now = datetime.utcnow()
    if inv is None:
        # Legacy single-vendor WO path (wo.vendor_id pinned, no invite row)
        if wo.vendor_id != vendor_id:
            raise HTTPException(status_code=403, detail="Work order not sent to this vendor")
        if accept:
            if wo.status in ("ISSUED", "VIEWED"):
                return transition_work_order(db, wo_id, "ACCEPTED", user, actor="vendor")
            raise HTTPException(status_code=409, detail=f"Cannot accept WO in {wo.status}")
        wo.status = "REJECTED" if wo.status in ("ISSUED", "VIEWED") else wo.status
        wo.rejected_at = now
        wo.rejected_by = user.id
        wo.rejection_reason = reason or ""
        wo.reject_ip = ip
        log_action(db, action="WORK_ORDER_REJECTED", actor_id=user.id,
                   target_type="work_order", target_id=wo.id,
                   metadata={"vendor_id": vendor_id, "reason": reason or "", "ip": ip or ""})
        db.commit()
        db.refresh(wo)
        return _serialize_wo(db, wo)
    if inv.status in ("ACCEPTED", "REJECTED"):
        raise HTTPException(status_code=409, detail=f"Vendor already {inv.status}")
    if accept:
        inv.status = "ACCEPTED"
        inv.accepted_at = now
        inv.accepted_by = user.id
        inv.accept_ip = ip
        log_action(db, action="WORK_ORDER_ACCEPTED", actor_id=user.id,
                   target_type="work_order", target_id=wo.id,
                   metadata={"vendor_id": vendor_id, "ip": ip or ""})
        # Pin single vendor + activate project assignment on first acceptance
        # (additional acceptances keep history; assignment is per work order).
        if wo.vendor_id is None:
            wo.vendor_id = vendor_id
        if wo.vendor_id == vendor_id and wo.status in ("FINALIZED", "ISSUED", "VIEWED",
                                                       "DRAFT", "IN_REVIEW",
                                                       "PDF_GENERATED", "SIGNED", "STAMPED"):
            try:
                activate_vendor_assignment(db, wo, actor_id=user.id)
            except HTTPException:
                pass  # already assigned -> keep idempotent for multi-vendor
        wo.accepted_at = now
        wo.accepted_by = user.id
        wo.accept_ip = ip
    else:
        if not reason:
            raise HTTPException(status_code=422, detail="rejection_reason required")
        inv.status = "REJECTED"
        inv.rejected_at = now
        inv.rejected_by = user.id
        inv.rejection_reason = reason
        inv.reject_ip = ip
        log_action(db, action="WORK_ORDER_REJECTED", actor_id=user.id,
                   target_type="work_order", target_id=wo.id,
                   metadata={"vendor_id": vendor_id, "reason": reason, "ip": ip or ""})
    db.commit()
    db.refresh(wo)
    return _serialize_wo(db, wo)


def mark_wo_viewed(db: Session, wo_id: int, vendor_id: int, user) -> dict:
    # Admins record responses on behalf of vendors (vendors never log in).
    if not _is_admin(user):
        _require_vendor_link(db, user, vendor_id)
    wo = _wo_or_404(db, wo_id)
    inv = db.query(m.WorkOrderVendor).filter(
        m.WorkOrderVendor.work_order_id == wo_id,
        m.WorkOrderVendor.vendor_id == vendor_id).first()
    now = datetime.utcnow()
    if inv is None:
        if wo.vendor_id == vendor_id and wo.status == "ISSUED":
            wo.status = "VIEWED"
            wo.viewed_at = now
            log_action(db, action="WORK_ORDER_VIEWED", actor_id=user.id,
                       target_type="work_order", target_id=wo.id,
                       metadata={"vendor_id": vendor_id})
            db.commit()
            db.refresh(wo)
        return _serialize_wo(db, wo)
    if inv.status == "SENT":
        inv.status = "VIEWED"
        inv.viewed_at = now
        log_action(db, action="WORK_ORDER_VIEWED", actor_id=user.id,
                   target_type="work_order", target_id=wo.id,
                   metadata={"vendor_id": vendor_id})
        db.commit()
        db.refresh(wo)
    return _serialize_wo(db, wo)


# ---------- PDF / sign / stamp / finalize ----------

def _snapshot_wo(db: Session, wo: m.WorkOrder) -> str:
    import json
    d = _serialize_wo(db, wo)
    d.pop("vendor_invites", None)
    return json.dumps(d, default=str)


def _store_version(db: Session, wo: m.WorkOrder, user_id: int | None, pdf_path: str | None):
    wo.version = (wo.version or 1)
    rec = m.WorkOrderVersion(work_order_id=wo.id, version=wo.version,
                             snapshot=_snapshot_wo(db, wo), pdf_path=pdf_path,
                             created_by=user_id)
    db.add(rec)
    db.flush()
    return rec


def generate_wo_pdf(db: Session, wo_id: int, user) -> dict:
    _require_admin(user)
    wo = _wo_or_404(db, wo_id)
    if wo.status not in ("DRAFT", "IN_REVIEW", "PDF_GENERATED", "SIGNED"):
        raise HTTPException(status_code=409, detail=f"Cannot generate PDF in {wo.status}")
    from app.modules.procurement.pdf import render_work_order_pdf
    import os as _os
    pdf_path, _ = render_work_order_pdf(db, wo)
    wo.pdf_path = pdf_path
    wo.pdf_version = (wo.pdf_version or 0) + 1
    wo.pdf_generated_at = datetime.utcnow()
    if wo.status in ("DRAFT", "IN_REVIEW"):
        wo.status = "PDF_GENERATED"
    _store_version(db, wo, user.id, pdf_path)
    base = _os.path.dirname(_os.path.dirname(_os.path.dirname(
        _os.path.dirname(__file__))))
    gen_abs = _os.path.join(base, pdf_path)
    if _os.path.exists(gen_abs):
        _register_document(db, wo, "GENERATED", gen_abs,
                           _os.path.basename(gen_abs), "application/pdf",
                           user.id)
    log_action(db, action="WORK_ORDER_PDF_GENERATED", actor_id=user.id,
               target_type="work_order", target_id=wo.id,
               metadata={"pdf_version": wo.pdf_version, "path": pdf_path})
    db.commit()
    db.refresh(wo)
    return _serialize_wo(db, wo)


def sign_work_order(db: Session, wo_id: int, signature: str | None, user) -> dict:
    from app.core.rbac import has_permission
    if not (has_permission(getattr(user, "role", ""), "WORK_ORDER_SIGN")
            or _is_admin(user)):
        raise HTTPException(status_code=403, detail="Only admin can sign")
    wo = _wo_or_404(db, wo_id)
    if wo.status not in ("PDF_GENERATED", "IN_REVIEW", "DRAFT"):
        raise HTTPException(status_code=409, detail=f"Cannot sign WO in {wo.status}")
    if not wo.pdf_path:
        raise HTTPException(status_code=409, detail="Generate PDF before signing")
    wo.signed_by = user.id
    wo.signed_at = datetime.utcnow()
    wo.signature_data = signature or getattr(user, "email", "ADMIN")
    wo.status = "SIGNED"
    _store_version(db, wo, user.id, wo.pdf_path)
    log_action(db, action="WORK_ORDER_SIGNED", actor_id=user.id,
               target_type="work_order", target_id=wo.id, metadata={})
    db.commit()
    db.refresh(wo)
    # Re-render PDF with signature block
    try:
        from app.modules.procurement.pdf import render_work_order_pdf
        pdf_path, _ = render_work_order_pdf(db, wo)
        wo.pdf_path = pdf_path
        wo.pdf_version = (wo.pdf_version or 0) + 1
        db.commit()
        db.refresh(wo)
    except Exception:
        pass
    return _serialize_wo(db, wo)


def stamp_work_order(db: Session, wo_id: int, stamp: str | None, user) -> dict:
    from app.core.rbac import has_permission
    if not (has_permission(getattr(user, "role", ""), "WORK_ORDER_STAMP")
            or _is_admin(user)):
        raise HTTPException(status_code=403, detail="Only admin can stamp")
    wo = _wo_or_404(db, wo_id)
    if wo.status != "SIGNED":
        raise HTTPException(status_code=409, detail="Work order must be SIGNED before stamping")
    wo.stamped_by = user.id
    wo.stamped_at = datetime.utcnow()
    wo.stamp_data = stamp or "COMPANY SEAL"
    wo.status = "STAMPED"
    _store_version(db, wo, user.id, wo.pdf_path)
    log_action(db, action="WORK_ORDER_STAMPED", actor_id=user.id,
               target_type="work_order", target_id=wo.id, metadata={})
    db.commit()
    db.refresh(wo)
    try:
        from app.modules.procurement.pdf import render_work_order_pdf
        pdf_path, _ = render_work_order_pdf(db, wo)
        wo.pdf_path = pdf_path
        wo.pdf_version = (wo.pdf_version or 0) + 1
        db.commit()
        db.refresh(wo)
    except Exception:
        pass
    return _serialize_wo(db, wo)


def finalize_work_order(db: Session, wo_id: int, user) -> dict:
    from app.core.rbac import has_permission
    if not (has_permission(getattr(user, "role", ""), "WORK_ORDER_FINALIZE")
            or _is_admin(user)):
        raise HTTPException(status_code=403, detail="Only admin can finalize")
    wo = _wo_or_404(db, wo_id)
    if wo.status != "STAMPED":
        raise HTTPException(status_code=409, detail="Work order must be STAMPED before finalize")
    missing = _finalize_checks(wo, db)
    if missing:
        raise HTTPException(status_code=422,
                            detail="Cannot finalize: missing " + ", ".join(missing))
    _take_snapshots(db, wo)
    wo.status = "FINALIZED"
    wo.is_locked = 1
    wo.finalized_by = user.id
    wo.finalized_at = datetime.utcnow()
    wo.version = (wo.version or 1) + 1
    _store_version(db, wo, user.id, wo.pdf_path)
    log_action(db, action="WORK_ORDER_FINALIZED", actor_id=user.id,
               target_type="work_order", target_id=wo.id,
               metadata={"version": wo.version})
    db.commit()
    db.refresh(wo)
    return _serialize_wo(db, wo)


def list_wo_versions(db: Session, wo_id: int, user) -> list[dict]:
    wo = _wo_or_404(db, wo_id)
    if not _can_see_wo(db, user, wo):
        raise HTTPException(status_code=403, detail="Not permitted for this work order")
    rows = db.query(m.WorkOrderVersion).filter(
        m.WorkOrderVersion.work_order_id == wo_id).order_by(
        m.WorkOrderVersion.version.desc()).all()
    return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]


# ---------- Corporate document data (snapshot-first, live fallback) ----------

def _vendor_doc_data(db: Session, wo: m.WorkOrder) -> dict:
    """Master vendor data merged with doc-specific overrides (master untouched)."""
    from app.modules.vendors import models as vm
    v = db.query(vm.Vendor).filter(vm.Vendor.id == wo.vendor_id).first() \
        if wo.vendor_id else None
    base = {
        "company": (v.legal_business_name or v.vendor_company) if v else "",
        "vendor_code": (v.vendor_code or "") if v else "",
        "address": ((v.registered_address or v.address) or "") if v else "",
        "city": (v.city or "") if v else "",
        "state": (v.state or "") if v else "",
        "pin": (v.postal_code or "") if v else "",
        "contact_person": (v.contact_person or "") if v else "",
        "mobile": ((v.phone or v.alternate_phone) or "") if v else "",
        "email": (v.email or "") if v else "",
        "gstin": (v.tax_identifier or "") if v else "",
        "pan": "",
    }
    snap = _jloads(wo.vendor_snapshot, None)
    if isinstance(snap, dict):
        base.update(snap)
    ov = _jloads_dict(wo.vendor_override_json) or {}
    base.update({k: v2 for k, v2 in ov.items()})
    return base


def _project_doc_data(db: Session, wo: m.WorkOrder) -> dict:
    from app.modules.projects.models import Project
    p = db.query(Project).filter(Project.id == wo.project_id).first()
    base = {
        "project_code": (p.project_code or "") if p else "",
        "name": (wo.project_name or (p.name if p else "")),
        "client_name": (wo.client_name or (p.client_name if p else "")),
        "location": (wo.location or (p.location if p else "")),
        "site": wo.site or "",
        "status": (p.status or "") if p else "",
    }
    snap = _jloads(wo.project_snapshot, None)
    if isinstance(snap, dict):
        base.update(snap)
    return base


def _company_doc_data(db: Session, wo: m.WorkOrder) -> dict:
    from app.modules.company.service import get_settings, serialize
    snap = _jloads(wo.company_snapshot, None)
    if isinstance(snap, dict) and snap.get("company_name"):
        return snap
    live = serialize(get_settings(db))
    live.pop("logo_url", None)
    return live


def get_wo_document(db: Session, wo_id: int, user) -> dict:
    """Full structured document for preview/PDF: header + parties + content."""
    wo = _wo_or_404(db, wo_id)
    if not _can_see_wo(db, user, wo):
        raise HTTPException(status_code=403, detail="Not permitted for this work order")
    data = _serialize_wo(db, wo)
    data["doc_vendor"] = _vendor_doc_data(db, wo)
    data["doc_project"] = _project_doc_data(db, wo)
    data["doc_company"] = _company_doc_data(db, wo)
    return data


def next_wo_number(db: Session, project_id: int, user) -> dict:
    from app.modules.company.service import build_wo_number
    _require_admin(user)
    return {"work_order_number": build_wo_number(db, project_id),
            "project_id": project_id}


# ---------- Finalization validation + snapshots ----------

def _finalize_checks(wo: m.WorkOrder, db: Session) -> list[str]:
    missing = []
    if not (wo.work_order_number or "").strip():
        missing.append("Work Order Number")
    if not wo.work_order_date:
        missing.append("Date")
    if not wo.project_id:
        missing.append("Project")
    has_vendor = bool(wo.vendor_id) or db.query(m.WorkOrderVendor).filter(
        m.WorkOrderVendor.work_order_id == wo.id).count() > 0
    if not has_vendor:
        missing.append("Vendor")
    if not (wo.subject or "").strip():
        missing.append("Subject")
    if not (wo.scope_of_work or "").strip():
        missing.append("Scope")
    if not wo.items:
        missing.append("At least one BOQ item")
    if not _jloads(wo.payment_terms_json, []):
        missing.append("Payment Terms")
    if not _jloads(wo.general_terms_json, []):
        missing.append("General Terms & Conditions")
    if not (wo.signer_name or "").strip():
        missing.append("Authorized signatory (name)")
    return missing


def _take_snapshots(db: Session, wo: m.WorkOrder) -> None:
    import json as _json
    from app.modules.company.service import get_settings, serialize
    from app.modules.vendors import models as vm
    from app.modules.projects.models import Project
    v = db.query(vm.Vendor).filter(vm.Vendor.id == wo.vendor_id).first() \
        if wo.vendor_id else None
    p = db.query(Project).filter(Project.id == wo.project_id).first()
    wo.vendor_snapshot = _json.dumps(_vendor_doc_data(db, wo), default=str)
    wo.project_snapshot = _json.dumps({
        "project_code": p.project_code if p else None,
        "name": p.name if p else None,
        "client_name": p.client_name if p else None,
        "location": p.location if p else None,
        "status": p.status if p else None,
    }, default=str)
    live = serialize(get_settings(db))
    live.pop("logo_url", None)
    wo.company_snapshot = _json.dumps(live, default=str)


# ---------- Version clone (immutable history; same number, version+1) ----------

def clone_new_version(db: Session, wo_id: int, user) -> dict:
    _require_admin(user)
    src = _wo_or_404(db, wo_id)
    if src.status in ("DRAFT", "IN_REVIEW", "PDF_GENERATED"):
        raise HTTPException(status_code=409,
                            detail="Edit the current draft instead of versioning it")
    import json as _json
    clone = m.WorkOrder(
        work_order_number=src.work_order_number, parent_id=src.id,
        version=(src.version or 1) + 1, status="DRAFT", is_locked=0,
        project_id=src.project_id, vendor_id=src.vendor_id,
        rfq_id=src.rfq_id, quotation_id=src.quotation_id,
        work_order_date=src.work_order_date, project_name=src.project_name,
        client_name=src.client_name, site=src.site, location=src.location,
        work_type=src.work_type, subject=src.subject, reference=src.reference,
        intro_text=src.intro_text, acceptance_text=src.acceptance_text,
        payment_terms_json=src.payment_terms_json,
        general_terms_json=src.general_terms_json,
        vendor_override_json=src.vendor_override_json,
        scope_of_work=src.scope_of_work, currency=src.currency,
        subtotal=src.subtotal, discount=src.discount, tax_amount=src.tax_amount,
        other_charges=src.other_charges, grand_total=src.grand_total,
        start_date=src.start_date, end_date=src.end_date,
        payment_terms=src.payment_terms, validity_days=src.validity_days,
        completion_period=src.completion_period,
        retention_percent=src.retention_percent, tax_terms=src.tax_terms,
        delivery_terms=src.delivery_terms, special_conditions=src.special_conditions,
        standard_terms=src.standard_terms, custom_terms=src.custom_terms,
        signer_name=src.signer_name, signer_designation=src.signer_designation,
        vendor_signer_name=src.vendor_signer_name,
        vendor_signer_designation=src.vendor_signer_designation)
    db.add(clone)
    db.flush()
    for it in src.items:
        db.add(m.WorkOrderItem(
            work_order_id=clone.id, item_number=it.item_number,
            description=it.description, sub_description=it.sub_description,
            quantity=it.quantity, unit=it.unit, unit_rate=it.unit_rate,
            line_total=it.line_total))
    log_action(db, action="WORK_ORDER_VERSION_CREATED", actor_id=user.id,
               target_type="work_order", target_id=clone.id,
               metadata={"number": clone.work_order_number,
                         "version": clone.version, "from": src.id})
    db.commit()
    db.refresh(clone)
    return _serialize_wo(db, clone)


# ---------- Duplicate as NEW work order (reuse a previous WO as template) ----------

def duplicate_as_new(db: Session, wo_id: int, user, project_id: int | None = None,
                     work_order_number: str | None = None) -> dict:
    """Copy all document content + items + team into a fresh DRAFT (version 1).

    Gets a fresh auto number (or the provided one, 409 on duplicate). No
    signatures, snapshots, invites or files are carried over.
    """
    _require_admin(user)
    src = _wo_or_404(db, wo_id)
    target_project = project_id or src.project_id
    from app.modules.projects.models import Project
    if not db.query(Project).filter(Project.id == target_project).first():
        raise HTTPException(status_code=404, detail="Project not found")
    number = (work_order_number or "").strip()
    if number:
        if db.query(m.WorkOrder).filter(
                m.WorkOrder.work_order_number == number,
                m.WorkOrder.version == 1).first():
            raise HTTPException(status_code=409, detail="Work order number already exists")
    else:
        from app.modules.company.service import build_wo_number
        try:
            number = build_wo_number(db, target_project)
        except HTTPException:
            number = _next_wo_number(db, target_project)
    copy = m.WorkOrder(
        work_order_number=number, status="DRAFT", version=1, is_locked=0,
        project_id=target_project, vendor_id=src.vendor_id,
        work_order_date=None, project_name=src.project_name,
        client_name=src.client_name, site=src.site, location=src.location,
        work_type=src.work_type, subject=src.subject, reference=src.reference,
        intro_text=src.intro_text, acceptance_text=src.acceptance_text,
        payment_terms_json=src.payment_terms_json,
        general_terms_json=src.general_terms_json,
        vendor_override_json=src.vendor_override_json,
        team_supervisors_json=src.team_supervisors_json,
        team_machines_json=src.team_machines_json,
        scope_of_work=src.scope_of_work, currency=src.currency,
        discount=src.discount, tax_amount=src.tax_amount,
        other_charges=src.other_charges, start_date=src.start_date,
        end_date=src.end_date, payment_terms=src.payment_terms,
        validity_days=src.validity_days, completion_period=src.completion_period,
        retention_percent=src.retention_percent, tax_terms=src.tax_terms,
        delivery_terms=src.delivery_terms, special_conditions=src.special_conditions,
        standard_terms=src.standard_terms, custom_terms=src.custom_terms,
        signer_name=src.signer_name, signer_designation=src.signer_designation,
        vendor_signer_name=src.vendor_signer_name,
        vendor_signer_designation=src.vendor_signer_designation)
    # Totals recomputed server-side from copied lines.
    db.add(copy)
    db.flush()
    subtotal = 0.0
    for it in src.items:
        line = round((it.quantity or 0) * (it.unit_rate or 0), 2)
        subtotal += line
        db.add(m.WorkOrderItem(
            work_order_id=copy.id, item_number=it.item_number,
            description=it.description, sub_description=it.sub_description,
            quantity=it.quantity, unit=it.unit, unit_rate=it.unit_rate,
            line_total=line))
    copy.subtotal = round(subtotal, 2)
    copy.grand_total = round(subtotal - (copy.discount or 0)
                             + (copy.tax_amount or 0) + (copy.other_charges or 0), 2)
    log_action(db, action="WORK_ORDER_CREATED", actor_id=user.id,
               target_type="work_order", target_id=copy.id,
               metadata={"number": number, "duplicated_from": src.id,
                         "grand_total": copy.grand_total})
    db.commit()
    db.refresh(copy)
    return _serialize_wo(db, copy)


# ---------- Document files (generated + signed), hashed, never overwritten ----------

DOC_DIR = None  # resolved lazily (backend storage/work_order_docs)
ALLOWED_DOCS = {"application/pdf": ".pdf", "image/png": ".png",
                "image/jpeg": ".jpg", "image/jpg": ".jpg"}
MAX_DOC_BYTES = 15 * 1024 * 1024


def _doc_dir() -> str:
    import os as _os
    global DOC_DIR
    if DOC_DIR is None:
        base = _os.path.dirname(_os.path.dirname(_os.path.dirname(
            _os.path.dirname(__file__))))
        DOC_DIR = _os.path.join(base, "storage", "work_order_docs")
        _os.makedirs(DOC_DIR, exist_ok=True)
    return DOC_DIR


def _sha256_file(path: str) -> str:
    import hashlib as _hl
    h = _hl.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _register_document(db: Session, wo: m.WorkOrder, document_type: str,
                       abs_path: str, file_name: str, mime: str,
                       user_id: int | None, is_final: bool = False,
                       is_signed: bool = False) -> m.WorkOrderDocument:
    import os as _os
    size = _os.path.getsize(abs_path)
    rec = m.WorkOrderDocument(
        work_order_id=wo.id, version=wo.version or 1,
        document_type=document_type, file_name=file_name, mime_type=mime,
        file_size=size,
        storage_path=_os.path.join("storage", "work_order_docs",
                                   _os.path.basename(abs_path)),
        sha256=_sha256_file(abs_path), uploaded_by=user_id,
        is_final=1 if is_final else 0, is_signed=1 if is_signed else 0)
    db.add(rec)
    db.flush()
    return rec


def upload_signed_document(db: Session, wo_id: int, file, document_type: str,
                           user, ip: str | None = None) -> dict:
    """Admin uploads the signed/stamped PDF (or scan). Original never touched."""
    _require_admin(user)
    if (document_type or "").upper() not in ("SIGNED", "STAMPED", "FINAL"):
        raise HTTPException(status_code=422,
                            detail="document_type must be SIGNED, STAMPED or FINAL")
    wo = _wo_or_404(db, wo_id)
    if wo.status in ("CANCELLED", "CLOSED"):
        raise HTTPException(status_code=409, detail=f"Cannot upload in {wo.status}")
    ext = ALLOWED_DOCS.get((file.content_type or "").lower())
    if not ext:
        raise HTTPException(status_code=415,
                            detail="Only PDF, PNG or JPG/JPEG documents are accepted")
    data = file.file.read()
    if len(data) > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="Document exceeds 15 MB")
    if len(data) == 0:
        raise HTTPException(status_code=422, detail="Empty file")
    import os as _os
    import uuid as _uuid
    fname = f"WO-{wo.id}-v{wo.version or 1}-{document_type.upper()}-{_uuid.uuid4().hex[:8]}{ext}"
    abs_path = _os.path.join(_doc_dir(), fname)
    with open(abs_path, "wb") as f:
        f.write(data)
    rec = _register_document(db, wo, document_type.upper(), abs_path,
                             file.filename or fname,
                             file.content_type, user.id,
                             is_final=(document_type.upper() == "FINAL"),
                             is_signed=True)
    # The uploaded signed document becomes the official record for the version.
    if wo.status in ("DRAFT", "IN_REVIEW", "PDF_GENERATED", "SIGNED",
                     "STAMPED", "FINALIZED"):
        wo.status = "SIGNED"
        wo.signed_by = user.id
        wo.signed_at = datetime.utcnow()
        if not wo.signature_data:
            wo.signature_data = wo.signer_name or getattr(user, "email", "ADMIN")
    _store_version(db, wo, user.id, wo.pdf_path)
    log_action(db, action="SIGNED_DOCUMENT_UPLOADED", actor_id=user.id,
               target_type="work_order", target_id=wo.id,
               metadata={"document_id": rec.id, "type": document_type.upper(),
                         "sha256": rec.sha256, "bytes": rec.file_size,
                         "ip": ip or ""})
    db.commit()
    db.refresh(wo)
    out = _serialize_wo(db, wo)
    out["uploaded_document_id"] = rec.id
    return out


def list_documents(db: Session, wo_id: int, user) -> list[dict]:
    wo = _wo_or_404(db, wo_id)
    if not _can_see_wo(db, user, wo):
        raise HTTPException(status_code=403, detail="Not permitted for this work order")
    rows = db.query(m.WorkOrderDocument).filter(
        m.WorkOrderDocument.work_order_id == wo_id).order_by(
        m.WorkOrderDocument.id.desc()).all()
    role = normalize_role(getattr(user, "role", ""))
    out = []
    for r in rows:
        d = {c.name: getattr(r, c.name) for c in r.__table__.columns
             if c.name != "storage_path"}
        if role == "VENDOR":
            d.pop("sha256", None)
        out.append(d)
    return out


def _doc_or_404(db: Session, doc_id: int) -> m.WorkOrderDocument:
    rec = db.query(m.WorkOrderDocument).filter(
        m.WorkOrderDocument.id == doc_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Document not found")
    return rec


def _doc_abs(rec: m.WorkOrderDocument) -> str:
    import os as _os
    base = _os.path.dirname(_os.path.dirname(_os.path.dirname(
        _os.path.dirname(__file__))))
    return _os.path.join(base, rec.storage_path or "")


def verify_document(db: Session, doc_id: int, user) -> dict:
    rec = _doc_or_404(db, doc_id)
    wo = _wo_or_404(db, rec.work_order_id)
    if not _can_see_wo(db, user, wo):
        raise HTTPException(status_code=403, detail="Not permitted for this work order")
    import os as _os
    p = _doc_abs(rec)
    if not _os.path.exists(p):
        raise HTTPException(status_code=404, detail="Document file missing from storage")
    computed = _sha256_file(p)
    return {"document_id": rec.id, "verified": computed == rec.sha256,
            "stored_sha256": rec.sha256, "computed_sha256": computed}


# ---------- Standard terms library ----------

def list_standard_terms(db: Session, active_only: bool = True) -> list[dict]:
    q = db.query(m.StandardTerm)
    if active_only:
        q = q.filter(m.StandardTerm.is_active == 1)
    return [{c.name: getattr(r, c.name) for c in r.__table__.columns}
            for r in q.order_by(m.StandardTerm.id.asc()).all()]


def create_standard_term(db: Session, data, user) -> dict:
    _require_admin(user)
    rec = m.StandardTerm(title=data.title, body=data.body,
                         category=data.category, is_active=1, created_by=user.id)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {c.name: getattr(rec, c.name) for c in rec.__table__.columns}


def eligible_vendors(db: Session, user, search: str | None = None,
                     capability: str | None = None, limit: int = 50) -> list[dict]:
    """Searchable eligible vendor pool: ACTIVE only, by ID/company/capability/status."""
    from app.modules.vendors import models as vm
    _require_admin(user)
    q = db.query(vm.Vendor).filter(vm.Vendor.status == "ACTIVE")
    if search:
        like = f"%{search}%"
        q = q.filter((vm.Vendor.vendor_code.ilike(like)) |
                     (vm.Vendor.legal_business_name.ilike(like)) |
                     (vm.Vendor.vendor_company.ilike(like)) |
                     (vm.Vendor.phone.ilike(like)) |
                     (vm.Vendor.alternate_phone.ilike(like)) |
                     (vm.Vendor.email.ilike(like)))
    rows = q.order_by(vm.Vendor.id.desc()).limit(limit).all()
    if capability:
        cap = capability.upper()
        rows = [v for v in rows if cap in (v.service_categories or "").upper()
                or cap in (v.specializations or "").upper()
                or cap in (v.technical_capabilities or "").upper()]
    out = []
    for v in rows:
        out.append({"id": v.id, "vendor_code": v.vendor_code,
                    "company": v.legal_business_name or v.vendor_company,
                    "status": v.status,
                    "capabilities": v.service_categories,
                    "contact_person": v.contact_person,
                    "phone": v.phone or v.alternate_phone,
                    "email": v.email,
                    "address": v.registered_address or v.address,
                    "city": v.city, "state": v.state,
                    "postal_code": v.postal_code,
                    "gstin": v.tax_identifier,
                    "pan": None})
    return out
