from datetime import date, datetime

from app.modules.daily_execution.models import DailyExecutionReport
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.modules.projects.models import Project, ProjectSupervisor, ProjectMachine, ProjectVendor
from app.modules.users.models import User
from app.modules.machinery.models import Machine
from app.modules.vendors.models import Vendor
from app.modules.projects import schemas
from app.utils.dependencies import normalize_role

# -------------------- PROGRESS --------------------
def calculate_progress(total: int, completed: int) -> float:
    if total == 0:
        return 0
    return round((completed / total) * 100, 2)

# -------------------- SUPERVISOR LINK SYNC --------------------
def _sync_supervisor_links(db: Session, project_id: int, supervisor_id: int,
                           actor_id: int | None = None) -> None:
    """Write BOTH supervisor link tables (legacy + canonical) so every view —
    KPI counts, Supervisors tab, DER/supervisor scoping — sees the assignment."""
    from datetime import date as _date
    from app.modules.projects.models import ProjectAssignment
    if db.query(ProjectSupervisor).filter_by(
            project_id=project_id, supervisor_id=supervisor_id,
            is_active=True).first() is None:
        db.add(ProjectSupervisor(project_id=project_id, supervisor_id=supervisor_id,
                                 assigned_at=_date.today(), is_active=True))
    if db.query(ProjectAssignment).filter_by(
            project_id=project_id, user_id=supervisor_id,
            status="ACTIVE").first() is None:
        db.add(ProjectAssignment(project_id=project_id, user_id=supervisor_id,
                                 assignment_role="SUPERVISOR", status="ACTIVE",
                                 assigned_by=actor_id))


# -------------------- CREATE PROJECT --------------------
def create_project(db: Session, data: schemas.ProjectCreate):
    from sqlalchemy.exc import IntegrityError
    if db.query(Project).filter(Project.project_code == data.project_code).first():
        raise HTTPException(409, "Project ID already exists")
    try:
        payload = data.dict()
        payload["progress"] = calculate_progress(
            payload.get("total_boreholes", 0),
            payload.get("completed_boreholes", 0)
        )

        supervisor_ids = payload.pop("supervisor_ids", [])
        machine_ids = payload.pop("machine_ids", [])
        vendor_ids = payload.pop("vendor_ids", [])

        # Create project
        project = Project(**payload)
        db.add(project)
        db.flush()  # Get project.id before commit

        # ---------------- SUPERVISORS ----------------
        # Eligibility: ACTIVE account + SUPERVISOR role (User Management V2).
        # Legacy supervisor_ids[] path kept for compat; canonical path is
        # POST /users/assignments (ProjectAssignment with history).
        for sup_id in supervisor_ids:
            supervisor = db.query(User).filter(
                User.id == sup_id,
                User.is_active == True
            ).first()

            if not supervisor:
                raise HTTPException(400, f"Invalid supervisor ID: {sup_id}")

            if normalize_role(supervisor.role) != "SUPERVISOR":
                raise HTTPException(400, f"User {sup_id} is not a supervisor")

            if (getattr(supervisor, "account_status", "ACTIVE") or "ACTIVE") != "ACTIVE":
                raise HTTPException(
                    400, f"User {sup_id} is not eligible: account is "
                    f"{getattr(supervisor, 'account_status', 'UNKNOWN')}")

            _sync_supervisor_links(db, project.id, sup_id)

        # ---------------- MACHINES ----------------
        for machine_id in machine_ids:
            machine = db.query(Machine).filter(
                Machine.id == machine_id
            ).first()

            if not machine:
                raise HTTPException(400, f"Invalid machine ID: {machine_id}")

            _require_machine_available(db, machine_id, project.id)
            machine.status = "working"

            db.add(ProjectMachine(
                project_id=project.id,
                machine_id=machine_id
            ))

        # ---------------- VENDORS ----------------
        # Only ACTIVE vendors; if the project already has work orders, the
        # vendor must have an ACCEPTED WO (or ACTIVE assignment) — enforced
        # here and in assign_vendor_to_project (never frontend-only).
        for vendor_id in vendor_ids:
            vendor = db.query(Vendor).filter(
                Vendor.id == vendor_id
            ).first()

            if not vendor:
                raise HTTPException(400, f"Invalid vendor ID: {vendor_id}")

            if (getattr(vendor, "status", "ACTIVE") or "ACTIVE") != "ACTIVE":
                raise HTTPException(
                    400, f"Vendor {vendor_id} is {getattr(vendor, 'status', '')}, "
                    "not eligible for assignment")

            db.add(ProjectVendor(
                project_id=project.id,
                vendor_id=vendor_id
            ))

        db.commit()
        db.refresh(project)

        return get_project_with_relations(db, project.id)

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Project ID already exists")
    except Exception:
        db.rollback()
        raise

# -------------------- GET PROJECTS --------------------
def get_projects(db: Session):
    return db.query(Project).options(
        joinedload(Project.supervisors).joinedload(ProjectSupervisor.supervisor),
        joinedload(Project.machinery).joinedload(ProjectMachine.machine),
        joinedload(Project.vendors).joinedload(ProjectVendor.vendor),
    ).all()

def get_project_by_id(db: Session, project_id: int):
    return db.query(Project).filter(Project.id == project_id).first()

# -------------------- UPDATE PROJECT --------------------
def update_project(db: Session, project_id: int, data: schemas.ProjectUpdate):
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    try:
        payload = data.dict(exclude_unset=True)

        supervisor_ids = payload.pop("supervisor_ids", None)
        machine_ids = payload.pop("machine_ids", None)
        vendor_ids = payload.pop("vendor_ids", None)

        if payload.get("project_code") and payload["project_code"] != project.project_code:
            if db.query(Project).filter(
                    Project.project_code == payload["project_code"]).first():
                raise HTTPException(409, "Project ID already exists")

        # ---------------- UPDATE NORMAL FIELDS ----------------
        for key, value in payload.items():
            setattr(project, key, value)

        if "total_boreholes" in payload or "completed_boreholes" in payload:
            project.progress = calculate_progress(
                project.total_boreholes,
                project.completed_boreholes
            )

        # ---------------- SUPERVISORS ----------------
        # NOTE: legacy path deletes + recreates links. Canonical assignment
        # history lives in project_assignments (POST /users/assignments).
        # Only ACTIVE SUPERVISORs accepted here.
        if supervisor_ids is not None:
            db.query(ProjectSupervisor).filter_by(
                project_id=project_id
            ).delete()

            for sup_id in supervisor_ids:
                supervisor = db.query(User).filter(
                    User.id == sup_id,
                    User.is_active == True
                ).first()

                if not supervisor:
                    raise HTTPException(400, f"Invalid supervisor ID: {sup_id}")

                if normalize_role(supervisor.role) != "SUPERVISOR":
                    raise HTTPException(400, f"User {sup_id} is not a supervisor")

                if (getattr(supervisor, "account_status", "ACTIVE") or "ACTIVE") != "ACTIVE":
                    raise HTTPException(
                        400, f"User {sup_id} is not eligible: account is "
                        f"{getattr(supervisor, 'account_status', 'UNKNOWN')}")

                _sync_supervisor_links(db, project.id, sup_id)

        # ---------------- MACHINES ----------------
        if machine_ids is not None:

            # Reset old machines
            old_machine_links = db.query(ProjectMachine).filter_by(
                project_id=project_id
            ).all()

            for link in old_machine_links:
                try:
                    if link.machine and link.machine.status == "working":
                        link.machine.status = "active"
                except Exception:
                    pass

            db.query(ProjectMachine).filter_by(
                project_id=project_id
            ).delete()

            # Assign new machines (availability enforced)
            for machine_id in machine_ids:
                machine = db.query(Machine).filter(
                    Machine.id == machine_id
                ).first()

                if not machine:
                    raise HTTPException(400, f"Invalid machine ID: {machine_id}")

                _require_machine_available(db, machine_id, project_id)
                machine.status = "working"

                db.add(ProjectMachine(
                    project_id=project_id,
                    machine_id=machine_id
                ))

        # ---------------- VENDORS ----------------
        if vendor_ids is not None:

            db.query(ProjectVendor).filter_by(
                project_id=project_id
            ).delete()

            # Assign new vendors (ACTIVE only; acceptance enforced per-vendor)
            for vendor_id in vendor_ids:
                vendor = db.query(Vendor).filter(
                    Vendor.id == vendor_id
                ).first()

                if not vendor:
                    raise HTTPException(400, f"Invalid vendor ID: {vendor_id}")

                if (getattr(vendor, "status", "ACTIVE") or "ACTIVE") != "ACTIVE":
                    raise HTTPException(
                        400, f"Vendor {vendor_id} is {getattr(vendor, 'status', '')}, "
                        "not eligible for assignment")

                db.add(ProjectVendor(
                    project_id=project_id,
                    vendor_id=vendor_id
                ))

        db.commit()
        db.refresh(project)

        return get_project_with_relations(db, project_id)

    except Exception:
        db.rollback()
        raise


# -------------------- DELETE PROJECT --------------------
def delete_project(db: Session, project_id: int):
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    # Explicit procurement cleanup in dependency order (SQLite does not
    # enforce ON DELETE CASCADE; ORM cascades handle RFQ children/WO items).
    try:
        from app.modules.procurement.models import (
            ProjectVendorAssignment, WorkOrder,
        )
        db.query(ProjectVendorAssignment).filter(
            ProjectVendorAssignment.project_id == project_id).delete(
            synchronize_session=False)
        for wo in db.query(WorkOrder).filter(
                WorkOrder.project_id == project_id).all():
            db.delete(wo)
    except ImportError:
        pass
    db.delete(project)
    db.commit()
    return project


# -------------------- PROJECT STATUS LIFECYCLE --------------------
# Legacy stored values ("Not Started", free text) are treated as DRAFT for
# transition purposes but never rewritten silently.
def _lifecycle_state(stored: str | None) -> str:
    from app.core.rbac import VALID_PROJECT_STATUSES, PROJECT_DRAFT
    if (stored or "") in VALID_PROJECT_STATUSES:
        return stored
    return PROJECT_DRAFT


def change_project_status(db: Session, project_id: int, new_status: str | None,
                          actor_id: int | None = None, reason: str | None = None):
    from app.core.rbac import VALID_PROJECT_STATUSES, PROJECT_TRANSITIONS
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if not new_status or new_status not in VALID_PROJECT_STATUSES:
        raise HTTPException(422, f"status must be one of {sorted(VALID_PROJECT_STATUSES)}")
    current = _lifecycle_state(project.status)
    allowed = PROJECT_TRANSITIONS.get(current, set())
    if new_status not in allowed and new_status != current:
        raise HTTPException(
            409, f"Invalid transition {current} -> {new_status}. "
            f"Allowed: {sorted(allowed) or ['(terminal)']}")
    from app.modules.users.audit import log_action
    old = project.status
    project.status = new_status
    log_action(db, action="PROJECT_STATUS_CHANGED", actor_id=actor_id,
               target_type="project", target_id=project.id,
               metadata={"from": old, "to": new_status, "reason": reason or ""})
    db.commit()
    db.refresh(project)
    return transform_project(get_project_with_relations(db, project_id))

# -------------------- GET PROJECT WITH RELATIONS --------------------
def get_project_with_relations(db: Session, project_id: int):
    return db.query(Project).options(
        joinedload(Project.supervisors).joinedload(ProjectSupervisor.supervisor),
        joinedload(Project.machinery).joinedload(ProjectMachine.machine),
        joinedload(Project.vendors).joinedload(ProjectVendor.vendor),
    ).filter(Project.id == project_id).first()


# -------------------- GET Full PROJECT --------------------
def get_project_with_full_details(db: Session, project_id: int):
    return db.query(Project).options(
        joinedload(Project.supervisors).joinedload(ProjectSupervisor.supervisor),
        joinedload(Project.machinery).joinedload(ProjectMachine.machine),
        joinedload(Project.vendors).joinedload(ProjectVendor.vendor),
        joinedload(Project.daily_execution_reports)
            .joinedload(DailyExecutionReport.vendor),
        joinedload(Project.daily_execution_reports)
            .joinedload(DailyExecutionReport.creator),
    ).filter(Project.id == project_id).first()



# -------------------- SUPERVISOR UTILITIES --------------------
# Reads BOTH legacy project_supervisors and canonical project_assignments
# (status=ACTIVE) so supervisors see assigned projects regardless of path.
def get_projects_for_supervisor(db: Session, supervisor_id: int):
    from app.modules.projects.models import ProjectAssignment
    legacy_ids = {
        r.project_id for r in
        db.query(ProjectSupervisor).filter(
            ProjectSupervisor.supervisor_id == supervisor_id,
            ProjectSupervisor.is_active == True).all()
    }
    canonical_ids = {
        r.project_id for r in
        db.query(ProjectAssignment).filter(
            ProjectAssignment.user_id == supervisor_id,
            ProjectAssignment.status == "ACTIVE").all()
    }
    ids = legacy_ids | canonical_ids
    if not ids:
        return []
    return db.query(Project).filter(Project.id.in_(ids)).all()

def is_supervisor_assigned(db: Session, project_id: int, supervisor_id: int) -> bool:
    from app.modules.projects.models import ProjectAssignment
    # Legacy links count only while active; canonical while ACTIVE.
    if db.query(ProjectSupervisor).filter_by(
            project_id=project_id, supervisor_id=supervisor_id,
            is_active=True).first() is not None:
        return True
    return db.query(ProjectAssignment).filter_by(
        project_id=project_id, user_id=supervisor_id, status="ACTIVE").first() is not None


def get_projects_for_vendor(db: Session, user_id: int):
    """Projects with an ACTIVE vendor assignment for any of the user's orgs."""
    from app.modules.vendors.models import VendorUser
    try:
        from app.modules.procurement.models import ProjectVendorAssignment
        has_pva = True
    except ImportError:
        has_pva = False
    org_ids = [r.vendor_id for r in db.query(VendorUser).filter(
        VendorUser.user_id == user_id).all()]
    if not org_ids:
        return []
    pids: set[int] = set()
    if has_pva:
        pids |= {r.project_id for r in db.query(ProjectVendorAssignment).filter(
            ProjectVendorAssignment.vendor_id.in_(org_ids),
            ProjectVendorAssignment.status == "ACTIVE").all()}
    # Legacy links also grant visibility (pre-procurement assignments)
    pids |= {r.project_id for r in db.query(ProjectVendor).filter(
        ProjectVendor.vendor_id.in_(org_ids)).all()}
    if not pids:
        return []
    return db.query(Project).filter(Project.id.in_(pids)).all()


def is_vendor_assigned(db: Session, project_id: int, user_id: int) -> bool:
    from app.modules.vendors.models import VendorUser
    org_ids = [r.vendor_id for r in db.query(VendorUser).filter(
        VendorUser.user_id == user_id).all()]
    if not org_ids:
        return False
    try:
        from app.modules.procurement.models import ProjectVendorAssignment
        if db.query(ProjectVendorAssignment).filter(
                ProjectVendorAssignment.project_id == project_id,
                ProjectVendorAssignment.vendor_id.in_(org_ids),
                ProjectVendorAssignment.status == "ACTIVE").first() is not None:
            return True
    except ImportError:
        pass
    return db.query(ProjectVendor).filter(
        ProjectVendor.project_id == project_id,
        ProjectVendor.vendor_id.in_(org_ids)).first() is not None

# -------------------- TRANSFORM PROJECT --------------------
def transform_project(project: Project):
    return {
        "id": project.id,
        "project_code": project.project_code,
        "date": project.date,
        "name": project.name,
        "client_name": project.client_name,
        "engineer_in_charge": project.engineer_in_charge,
        "location": project.location,
        "planned_start_date": project.planned_start_date,
        "planned_end_date": project.planned_end_date,
        "actual_start_date": project.actual_start_date,
        "actual_end_date": project.actual_end_date,
        "project_budget": project.project_budget,
        "estimated_total_depth": project.estimated_total_depth,
        "target_depth_per_day": project.target_depth_per_day,
        "target_boreholes_per_day": project.target_boreholes_per_day,
        "status": project.status,
        "progress": project.progress,
        "total_boreholes": project.total_boreholes,
        "completed_boreholes": project.completed_boreholes,
        "description": project.description,
        "project_type": project.project_type,
        "priority": project.priority,
        "currency": project.currency or "INR",
        "supervisors": [
            {"id": s.supervisor.id, "full_name": s.supervisor.full_name,
             "email": s.supervisor.email} for s in project.supervisors
        ],
        "machinery": [
            {"id": m.machine.id, "machine_name": m.machine.machine_name} for m in project.machinery
        ],
        "vendors": [
            {"id": v.vendor.id, "vendor_name": (
                v.vendor.legal_business_name
                or v.vendor.vendor_company
                or v.vendor.contact_person
            )} for v in project.vendors
        ],
    }



def transform_Full_project_Details(project: Project):

    supervisors_data = []

    for ps in project.supervisors:
        supervisor = ps.supervisor

        # Count DER created by this supervisor
        working_days = len([
            der for der in project.daily_execution_reports
            if der.created_by == supervisor.id
        ])

        supervisors_data.append({
            "id": supervisor.id,
            "full_name": supervisor.full_name,
            "assigned_at": ps.assigned_at,
            "is_active": ps.is_active,
            "working_days": working_days
        })

    return {
        "id": project.id,
        "project_code": project.project_code,
        "name": project.name,
        "status": project.status,
        "progress": project.progress,

        "vendors": [
            {
                "id": pv.vendor.id,
                "vendor_name": (
                    pv.vendor.legal_business_name
                    or pv.vendor.vendor_company
                    or pv.vendor.contact_person
                )
            }
            for pv in project.vendors
        ],

        "supervisors": supervisors_data,

        "daily_execution_reports": [
            {
                "id": der.id,
                "report_date": der.report_date,
                "borehole_no": der.borehole_no,
                "total_depth": der.total_depth,
                "vendor": (
                    der.vendor.legal_business_name
                    or der.vendor.vendor_company
                    or der.vendor.contact_person
                ) if der.vendor else None,
                "created_by": der.creator.full_name
            }
            for der in project.daily_execution_reports
        ]
    }


# -------------------- COST LEDGER --------------------
def get_cost_ledger(db: Session, project_id: int):
    """Full spend history for a project in detail.

    Machinery: per-day rate (accepted-WO rate wins, else machine master rate)
    x distinct days the machine appears in daily execution (report machine or
    equipment rows). Extras: project expenditures grouped by category with
    weekly buckets. Never trusts frontend numbers — all server-computed.
    """
    from datetime import date as _date
    from app.modules.daily_execution.models import (
        DailyExecutionReport, DEREquipment)
    from app.modules.machinery.models import Machine
    from app.modules.project_expenditures.models import ProjectExpenditure
    from app.modules.procurement.models import WorkOrder
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # ---- accepted WO machine rates (latest WO wins per machine) ----
    wo_rates: dict[int, dict] = {}
    wo_list = db.query(WorkOrder).filter(
        WorkOrder.project_id == project_id).order_by(WorkOrder.id.asc()).all()
    for wo in wo_list:
        import json as _json
        try:
            team = _json.loads(wo.team_machines_json or "[]") or []
        except (ValueError, TypeError):
            team = []
        for entry in team:
            try:
                mid = int((entry or {}).get("machine_id"))
            except (TypeError, ValueError):
                continue
            wo_rates[mid] = {"rate": float((entry or {}).get("rate_per_day") or 0),
                             "wo_number": wo.work_order_number,
                             "wo_id": wo.id}

    # ---- distinct usage days per machine from daily execution ----
    usage: dict[int, set] = {}
    for rep in db.query(DailyExecutionReport).filter(
            DailyExecutionReport.project_id == project_id).all():
        if rep.machine_id:
            usage.setdefault(rep.machine_id, set()).add(str(rep.report_date))
        for eq in (rep.equipment or []):
            if eq.machine_id:
                usage.setdefault(eq.machine_id, set()).add(str(rep.report_date))

    machinery_rows = []
    for mid in sorted(usage):
        m = db.query(Machine).filter(Machine.id == mid).first()
        rate_info = wo_rates.get(mid, {})
        rate = rate_info.get("rate") or (float(m.rate_per_day or 0) if m else 0)
        days = sorted(usage[mid])
        machinery_rows.append({
            "machine_id": mid,
            "machine_name": m.machine_name if m else f"Machine #{mid}",
            "rate_per_day": round(rate, 2),
            "rate_missing": rate <= 0,
            "rate_source": ("WO " + rate_info["wo_number"]) if rate_info.get("rate")
            else ("master" if m and m.rate_per_day else "unset"),
            "days": len(days),
            "dates": days,
            "amount": round(rate * len(days), 2),
        })
    machinery_total = round(sum(r["amount"] for r in machinery_rows), 2)

    # ---- expenditures (extras) ----
    exps = db.query(ProjectExpenditure).filter(
        ProjectExpenditure.project_id == project_id).order_by(
        ProjectExpenditure.expense_date.asc()).all()
    by_cat: dict[str, dict] = {}
    exp_records = []
    for x in exps:
        cat = x.expense_category or "MISCELLANEOUS"
        by_cat.setdefault(cat, {"category": cat, "count": 0, "total": 0.0,
                                "approved_total": 0.0})
        by_cat[cat]["count"] += 1
        by_cat[cat]["total"] = round(by_cat[cat]["total"] + (x.amount or 0), 2)
        if x.status == "APPROVED":
            by_cat[cat]["approved_total"] = round(
                by_cat[cat]["approved_total"] + (x.amount or 0), 2)
        exp_records.append({"id": x.id, "date": str(x.expense_date),
                            "category": cat, "description": x.description,
                            "amount": x.amount or 0, "status": x.status,
                            "vendor_id": x.vendor_id, "work_order_id": x.work_order_id})
    exp_total = round(sum(r["amount"] for r in exp_records), 2)

    # ---- weekly buckets + unified history ----
    from collections import defaultdict
    weekly = defaultdict(lambda: {"machinery": 0.0, "expenditures": 0.0})
    history = []
    for r in machinery_rows:
        for d in r["dates"]:
            try:
                y, mth, day = [int(p) for p in d.split("-")]
                iso = _date(y, mth, day).isocalendar()
                wk = f"{iso.year}-W{iso.week:02d}"
            except (ValueError, TypeError):
                wk = "unknown"
            weekly[wk]["machinery"] = round(weekly[wk]["machinery"] + r["rate_per_day"], 2)
            history.append({"date": d, "kind": "MACHINERY",
                            "label": f"{r['machine_name']} @ {r['rate_per_day']}/day",
                            "amount": r["rate_per_day"], "status": "UTILIZED",
                            "ref": None})
    for e in exp_records:
        try:
            y, mth, day = [int(p) for p in e["date"].split("-")]
            iso = _date(y, mth, day).isocalendar()
            wk = f"{iso.year}-W{iso.week:02d}"
        except (ValueError, TypeError, AttributeError):
            wk = "unknown"
        weekly[wk]["expenditures"] = round(weekly[wk]["expenditures"] + e["amount"], 2)
        history.append({"date": e["date"], "kind": "EXPENDITURE",
                        "label": f"{e['category']} — {e['description'] or ''}".strip(),
                        "amount": e["amount"], "status": e["status"],
                        "ref": e["id"]})
    weekly_rows = [{"week": wk,
                    "machinery": round(v["machinery"], 2),
                    "expenditures": round(v["expenditures"], 2),
                    "total": round(v["machinery"] + v["expenditures"], 2)}
                   for wk, v in sorted(weekly.items())]
    history.sort(key=lambda h: (h["date"] or "", h["kind"]), reverse=True)

    awarded = [w for w in wo_list if w.status in (
        "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CLOSED")]
    grand = round(machinery_total + exp_total, 2)
    budget = float(project.project_budget or 0)
    return {
        "project_id": project.id,
        "project_code": project.project_code,
        "budget": budget,
        "currency": project.currency or "INR",
        "contract": {
            "awarded_total": round(sum(w.grand_total or 0 for w in awarded), 2),
            "work_orders": [{"id": w.id, "number": w.work_order_number,
                             "vendor_id": w.vendor_id, "status": w.status,
                             "grand_total": w.grand_total or 0} for w in wo_list],
        },
        "machinery": machinery_rows,
        "machinery_total": machinery_total,
        "expenditures": {"by_category": list(by_cat.values()), "total": exp_total,
                         "records": exp_records},
        "weekly": weekly_rows,
        "history": history,
        "totals": {"machinery_total": machinery_total,
                   "expenditure_total": exp_total,
                   "grand_total": grand,
                   "budget": budget,
                   "balance": round(budget - grand, 2)},
    }


# -------------------- PROJECT SEARCH (autocomplete GEO-2026-001) --------------------
def search_projects(db: Session, q: str, user, limit: int = 20):
    """Scoped autocomplete: match project_code/name/client/location."""
    from app.modules.projects.models import Project
    like = f"%{(q or '').strip()}%"
    base = db.query(Project)
    role = normalize_role(getattr(user, "role", ""))
    if role == "SUPERVISOR":
        mine = {p.id for p in get_projects_for_supervisor(db, user.id)}
        if not mine:
            return []
        base = base.filter(Project.id.in_(mine))
    elif role == "VENDOR":
        mine = {p.id for p in get_projects_for_vendor(db, user.id)}
        if not mine:
            return []
        base = base.filter(Project.id.in_(mine))
    elif role not in ("SUPERADMIN", "ADMIN", "MONITOR"):
        raise HTTPException(403, "Access denied")
    if (q or "").strip():
        base = base.filter(
            (Project.project_code.ilike(like)) |
            (Project.name.ilike(like)) |
            (Project.client_name.ilike(like)) |
            (Project.location.ilike(like)))
    rows = base.order_by(Project.id.desc()).limit(min(limit, 50)).all()
    return [{"id": p.id, "project_code": p.project_code, "name": p.name,
             "client_name": p.client_name, "location": p.location,
             "status": p.status} for p in rows]


# -------------------- ASSIGNMENT ENFORCEMENT --------------------
def _require_vendor_accepted(db: Session, project_id: int, vendor_id: int) -> None:
    """Vendor must have an ACCEPTED work order (or ACTIVE assignment) for the
    project before team assignment. Rejected-only vendors are refused."""
    try:
        from app.modules.procurement.models import (
            WorkOrder, WorkOrderVendor, ProjectVendorAssignment)
        has_wo_table = True
    except ImportError:
        has_wo_table = False
    if not has_wo_table:
        return
    wos = db.query(WorkOrder).filter(WorkOrder.project_id == project_id).all()
    if not wos:
        return  # no WOs yet (legacy/backward-compat path)
    wo_ids = [w.id for w in wos]
    accepted = False
    # Single-vendor WO accepted path
    if db.query(WorkOrder).filter(
            WorkOrder.project_id == project_id,
            WorkOrder.vendor_id == vendor_id,
            WorkOrder.status.in_(["ACCEPTED", "IN_PROGRESS", "COMPLETED",
                                  "CLOSED"])).first() is not None:
        accepted = True
    # Multi-vendor invite accepted path
    if not accepted and db.query(WorkOrderVendor).filter(
            WorkOrderVendor.work_order_id.in_(wo_ids),
            WorkOrderVendor.vendor_id == vendor_id,
            WorkOrderVendor.status == "ACCEPTED").first() is not None:
        accepted = True
    # Canonical assignment path
    if not accepted and db.query(ProjectVendorAssignment).filter(
            ProjectVendorAssignment.project_id == project_id,
            ProjectVendorAssignment.vendor_id == vendor_id,
            ProjectVendorAssignment.status == "ACTIVE").first() is not None:
        accepted = True
    if not accepted:
        raise HTTPException(
            status_code=400,
            detail="Vendor has not accepted the Work Order and cannot be "
            "assigned to this project.")


def _require_machine_available(db: Session, machine_id: int,
                               project_id: int, force: bool = False) -> None:
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(400, f"Invalid machine ID: {machine_id}")
    status = (machine.status or "active").lower()
    if status in ("inactive", "maintenance"):
        raise HTTPException(
            status_code=400,
            detail=f"Machine {machine_id} is {machine.status} and cannot be assigned")
    if not force:
        conflict = db.query(ProjectMachine).filter(
            ProjectMachine.machine_id == machine_id,
            ProjectMachine.project_id != project_id).first()
        if conflict is not None:
            other = db.query(Project).filter(Project.id == conflict.project_id).first()
            other_status = (getattr(other, "status", "") or "").upper()
            if other_status in ("ACTIVE", "PLANNED", "ON_HOLD", "Not Started", ""):
                raise HTTPException(
                    status_code=409,
                    detail=f"Machine {machine_id} is already assigned to project "
                    f"{conflict.project_id}. Reassign with force=true.")


def assign_supervisor_to_project(db: Session, project_id: int, supervisor_id: int,
                                 actor_id: int | None = None):
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    supervisor = db.query(User).filter(User.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(404, "User not found")
    if normalize_role(supervisor.role) != "SUPERVISOR":
        raise HTTPException(400, f"User {supervisor_id} is not a supervisor")
    if not supervisor.is_active or \
            (getattr(supervisor, "account_status", "ACTIVE") or "ACTIVE") != "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail="User has not accepted the invitation and cannot be assigned.")
    _sync_supervisor_links(db, project_id, supervisor_id, actor_id=actor_id)
    from app.modules.users.audit import log_action
    log_action(db, action="SUPERVISOR_ASSIGNED", actor_id=actor_id,
               target_type="project", target_id=project_id,
               metadata={"supervisor_id": supervisor_id})
    db.commit()
    return get_project_with_relations(db, project_id)


def assign_vendor_to_project(db: Session, project_id: int, vendor_id: int,
                             actor_id: int | None = None):
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if (getattr(vendor, "status", "ACTIVE") or "ACTIVE") != "ACTIVE":
        raise HTTPException(
            status_code=400, detail=f"Vendor is {vendor.status}, not eligible")
    _require_vendor_accepted(db, project_id, vendor_id)
    if db.query(ProjectVendor).filter_by(
            project_id=project_id, vendor_id=vendor_id).first() is None:
        db.add(ProjectVendor(project_id=project_id, vendor_id=vendor_id))
    from app.modules.users.audit import log_action
    log_action(db, action="VENDOR_ASSIGNED", actor_id=actor_id,
               target_type="project", target_id=project_id,
               metadata={"vendor_id": vendor_id})
    db.commit()
    return get_project_with_relations(db, project_id)


def assign_machine_to_project(db: Session, project_id: int, machine_id: int,
                              actor_id: int | None = None, force: bool = False):
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    _require_machine_available(db, machine_id, project_id, force=force)
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if db.query(ProjectMachine).filter_by(
            project_id=project_id, machine_id=machine_id).first() is None:
        db.add(ProjectMachine(project_id=project_id, machine_id=machine_id))
    machine.status = "working"
    from app.modules.users.audit import log_action
    log_action(db, action="MACHINE_ASSIGNED", actor_id=actor_id,
               target_type="project", target_id=project_id,
               metadata={"machine_id": machine_id, "force": force})
    db.commit()
    return get_project_with_relations(db, project_id)


def get_project_timeline(db: Session, project_id: int):
    """Audit timeline: project events + related WO/RFQ/DER/expenditure logs."""
    from app.modules.users.models import AuditLog
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    try:
        from app.modules.procurement.models import WorkOrder, RFQ
        wo_ids = [w.id for w in db.query(WorkOrder).filter(
            WorkOrder.project_id == project_id).all()]
        rfq_ids = [r.id for r in db.query(RFQ).filter(
            RFQ.project_id == project_id).all()]
    except ImportError:
        wo_ids, rfq_ids = [], []
    rows = db.query(AuditLog).filter(
        (AuditLog.target_type == "project") & (AuditLog.target_id == project_id)).all()
    if wo_ids:
        rows += db.query(AuditLog).filter(
            (AuditLog.target_type == "work_order") &
            (AuditLog.target_id.in_(wo_ids))).all()
    if rfq_ids:
        rows += db.query(AuditLog).filter(
            (AuditLog.target_type == "rfq") &
            (AuditLog.target_id.in_(rfq_ids))).all()
    rows.sort(key=lambda r: r.timestamp or "", reverse=True)
    return [{"id": r.id, "action": r.action, "actor_id": r.actor_id,
             "target_type": r.target_type, "target_id": r.target_id,
             "timestamp": r.timestamp, "meta_info": r.meta_info}
            for r in rows[:200]]


# ================= SUPERVISOR ATTENDANCE & COST =================
def _machine_rates_for_projects(db: Session, project_ids: list[int]) -> dict:
    """machine_id -> {rate, source} where an accepted work order rate wins
    over the machine master rate. Latest work order wins."""
    import json as _json
    from app.modules.machinery.models import Machine
    from app.modules.procurement.models import WorkOrder
    out: dict[int, dict] = {}
    if not project_ids:
        return out
    wos = db.query(WorkOrder).filter(WorkOrder.project_id.in_(project_ids)) \
            .order_by(WorkOrder.id.asc()).all()
    for wo in wos:
        try:
            team = _json.loads(wo.team_machines_json or "[]") or []
        except (ValueError, TypeError):
            team = []
        for entry in team:
            try:
                mid = int((entry or {}).get("machine_id"))
            except (TypeError, ValueError):
                continue
            rate = float((entry or {}).get("rate_per_day") or 0)
            if rate > 0:
                out[mid] = {"rate": rate, "source": f"WO {wo.work_order_number}"}
    # fall back to master rate where no work order priced it
    for mid, info in list(out.items()):
        m = db.query(Machine).filter(Machine.id == mid).first()
        if not info["rate"] and m and m.rate_per_day:
            out[mid] = {"rate": float(m.rate_per_day), "source": "master"}
    for m in db.query(Machine).all():
        if m.id not in out and m.rate_per_day:
            out[m.id] = {"rate": float(m.rate_per_day), "source": "master"}
    return out


def get_supervisor_attendance(db: Session, project_id: int | None = None,
                             supervisor_id: int | None = None) -> dict:
    """Attendance and machinery cost, calculated entirely on the server.

    For every supervisor who filed daily execution reports this returns:
      * days_worked      - distinct report dates (one report per day is enforced)
      * reports          - reports filed
      * hours_worked     - sum of hours_worked
      * manpower_days    - sum of manpower_count across attended days
      * total_depth      - sum of total_depth
      * machines         - per-machine days and cost (rate from the accepted
                           work order, else the machine master rate)
      * machinery_cost   - rate x days for every machine they worked
      * cost_per_day     - machinery cost / days_worked
      * per_project      - the same split by project
    """
    from collections import defaultdict
    from app.modules.daily_execution.models import DEREquipment, DERManpower, DailyExecutionReport
    from app.modules.projects.models import Project, ProjectAssignment
    from app.modules.users.models import User

    projects = db.query(Project).all()
    if project_id is not None:
        projects = [p for p in projects if p.id == project_id]
    if not projects:
        return {"totals": {}, "supervisors": [], "generated_at": datetime.utcnow().isoformat()}

    pmap = {p.id: p for p in projects}
    rates = _machine_rates_for_projects(db, list(pmap.keys()))

    reports = db.query(DailyExecutionReport).filter(
        DailyExecutionReport.project_id.in_(list(pmap.keys()))).all()
    if supervisor_id is not None:
        reports = [r for r in reports if r.created_by == supervisor_id]

    # machine usage per (supervisor, machine, date) so a day counts once
    usage: dict[int, dict[int, set]] = defaultdict(lambda: defaultdict(set))
    for r in reports:
        if r.machine_id:
            usage[r.created_by][r.machine_id].add(str(r.report_date))
    eq_by_report: dict[int, list] = defaultdict(list)
    for eq in db.query(DEREquipment).filter(
            DEREquipment.report_id.in_([r.id for r in reports])).all() if reports else []:
        eq_by_report[eq.report_id].append(eq)
    for r in reports:
        for eq in eq_by_report.get(r.id, []):
            if eq.machine_id:
                usage[r.created_by][eq.machine_id].add(str(r.report_date))

    hours: dict[int, float] = defaultdict(float)
    manpower: dict[int, int] = defaultdict(int)
    depth: dict[int, float] = defaultdict(float)
    man_days: dict[int, float] = defaultdict(float)
    report_count: dict[int, int] = defaultdict(int)
    days: dict[int, set] = defaultdict(set)
    day_hours: dict[tuple, float] = defaultdict(float)
    per_project: dict[int, dict[int, dict]] = defaultdict(dict)
    machines_by_project: dict[tuple, dict[int, set]] = defaultdict(lambda: defaultdict(set))

    for r in reports:
        uid = r.created_by
        report_count[uid] += 1
        days[uid].add(str(r.report_date))
        hours[uid] += float(r.hours_worked or 0)
        # hours are summed per calendar day so a supervisor working two
        # projects on one day is not double-counted in the per-day average
        day_hours[(uid, str(r.report_date))] += float(r.hours_worked or 0)
        manpower[uid] += int(r.manpower_count or 0)
        depth[uid] += float(r.total_depth or 0)
        for mp in db.query(DERManpower).filter(DERManpower.report_id == r.id).all():
            man_days[uid] += float(mp.actual_count or 0) * float(mp.hours or 0) / 8.0
        slot = per_project[uid].setdefault(r.project_id, {
            "project_id": r.project_id,
            "project_code": pmap[r.project_id].project_code,
            "project_name": pmap[r.project_id].name,
            "days_worked": 0, "reports": 0, "hours_worked": 0.0,
            "manpower_days": 0.0, "machinery_cost": 0.0, "_dates": set(),
        })
        slot["reports"] += 1
        slot["_dates"].add(str(r.report_date))
        slot["hours_worked"] += float(r.hours_worked or 0)
        for mp in db.query(DERManpower).filter(DERManpower.report_id == r.id).all():
            slot["manpower_days"] += float(mp.actual_count or 0) * float(mp.hours or 0) / 8.0
        for mid in [r.machine_id] + [e.machine_id for e in eq_by_report.get(r.id, [])]:
            if mid:
                machines_by_project[(uid, r.project_id)][mid].add(str(r.report_date))

    # machine detail + cost
    machine_rows: dict[int, list] = defaultdict(list)
    for (uid, pid), mids in machines_by_project.items():
        slot = per_project[uid][pid]
        for mid, dts in mids.items():
            info = rates.get(mid, {"rate": 0.0, "source": "unset"})
            amt = round(info["rate"] * len(dts), 2)
            slot["machinery_cost"] = round(slot["machinery_cost"] + amt, 2)
            machine_rows[uid].append({
                "machine_id": mid, "project_id": pid,
                "rate_per_day": round(info["rate"], 2), "rate_source": info["source"],
                "days": len(dts), "amount": amt,
            })

    supervisors = []
    for uid in sorted(set(list(report_count.keys()) + list(days.keys()))):
        u = db.query(User).filter(User.id == uid).first()
        if not u:
            continue
        pslots = list(per_project.get(uid, {}).values())
        for s in pslots:
            s["days_worked"] = len(s.pop("_dates"))
            s["machinery_cost"] = round(s["machinery_cost"], 2)
        rows = machine_rows.get(uid, [])
        merged: dict[int, dict] = {}
        for m in rows:
            cur = merged.setdefault(m["machine_id"], {
                "machine_id": m["machine_id"], "rate_per_day": m["rate_per_day"],
                "rate_source": m["rate_source"], "days": 0, "amount": 0.0,
            })
            cur["days"] += m["days"]
            cur["amount"] = round(cur["amount"] + m["amount"], 2)
        machines = sorted(merged.values(), key=lambda x: -x["amount"])
        mach_cost = round(sum(m["amount"] for m in machines), 2)
        d = len(days.get(uid, set()))
        attended_hours = sum(v for (u, _dt), v in day_hours.items() if u == uid)
        supervisors.append({
            "supervisor_id": uid,
            "name": u.full_name,
            "employee_id": u.employee_id,
            "designation": u.designation,
            "email": u.email,
            "projects": len(pslots),
            "days_worked": d,
            "reports": report_count.get(uid, 0),
            "hours_worked": round(attended_hours, 2),
            "avg_hours_per_day": round(attended_hours / d, 2) if d else 0.0,
            "manpower_count_total": manpower.get(uid, 0),
            "manpower_days": round(man_days.get(uid, 0.0), 2),
            "total_depth": round(depth.get(uid, 0.0), 2),
            "machines": machines,
            "machinery_cost": mach_cost,
            "cost_per_day": round(mach_cost / d, 2) if d else 0.0,
            "per_project": sorted(pslots, key=lambda s: s["project_code"]),
        })

    supervisors.sort(key=lambda s: -s["machinery_cost"])
    return {
        "scope": "PROJECT" if project_id is not None else "ALL_PROJECTS",
        "project_id": project_id,
        "projects": len(projects),
        "totals": {
            "supervisors": len(supervisors),
            "days_worked": sum(s["days_worked"] for s in supervisors),
            "reports": sum(s["reports"] for s in supervisors),
            "hours_worked": round(sum(s["hours_worked"] for s in supervisors), 2),
            "machinery_cost": round(sum(s["machinery_cost"] for s in supervisors), 2),
        },
        "supervisors": supervisors,
        "generated_at": datetime.utcnow().isoformat(),
    }