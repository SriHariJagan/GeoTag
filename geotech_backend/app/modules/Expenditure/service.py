# app/modules/Expenditure/service.py

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from app.modules.Expenditure.models import (
    Expenditure, ManpowerExpense, VendorExpense
)
from app.modules.projects.models import Project
from app.modules.projects.service import is_supervisor_assigned
from app.modules.users.models import User
from app.modules.vendors.models import Vendor
from app.utils.dependencies import normalize_role


# ================= CALCULATIONS =================

def calculate_manpower_total(data):
    return (
        data.travel + data.accom + data.da +
        data.vehicle_hire + data.jcb_hydra_other +
        data.tractor_trolly_water + data.local_vehicle_hire +
        data.sample_transport + data.misc
    )


def calculate_vendor_total(data):
    return (
        data.vendor_total_exp + data.accom +
        data.vehicle_hire + data.jcb_hydra_other +
        data.tractor_trolly_water + data.local_vehicle_hire +
        data.sample_transport + data.misc
    )


# ================= CREATE =================
def create_expenditure(db: Session, data, current_user):

    role = normalize_role(current_user.role)

    if role != "SUPERVISOR":
        raise HTTPException(403, "Only supervisors can create expenditures")

    # Check project exists
    project = db.query(Project).filter(Project.id == data.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Check supervisor assigned
    if not is_supervisor_assigned(db, data.project_id, current_user.id):
        raise HTTPException(403, "Not assigned to this project")

    # --------------------------------------------------
    # 🔥 CHECK IF EXPENDITURE ALREADY EXISTS FOR PROJECT
    # --------------------------------------------------
    expenditure = db.query(Expenditure).filter(
        Expenditure.project_id == data.project_id
    ).first()

    # --------------------------------------------------
    # IF NOT EXISTS → CREATE NEW
    # --------------------------------------------------
    if not expenditure:
        expenditure = Expenditure(
            project_id=data.project_id,
            created_by=current_user.id,
            location=project.location,
            date=data.date,
            total_manpower_amount=0,
            total_vendor_amount=0,
            grand_total=0
        )
        db.add(expenditure)
        db.flush()

    total_manpower = 0
    total_vendor = 0

    # --------------------------------------------------
    # 🔥 ADD MANPOWER (ONLY CURRENT SUPERVISOR)
    # --------------------------------------------------
    for m in data.manpower:
        total = calculate_manpower_total(m)
        total_manpower += total

        db.add(ManpowerExpense(
            expenditure_id=expenditure.id,
            supervisor_id=current_user.id,
            travel=m.travel,
            accom=m.accom,
            da=m.da,
            vehicle_hire=m.vehicle_hire,
            jcb_hydra_other=m.jcb_hydra_other,
            tractor_trolly_water=m.tractor_trolly_water,
            local_vehicle_hire=m.local_vehicle_hire,
            sample_transport=m.sample_transport,
            misc=m.misc,
            misc_remark=m.misc_remark,
            total=total
        ))

    # --------------------------------------------------
    # 🔥 ADD VENDOR ENTRIES
    # --------------------------------------------------
    for v in data.vendors:

        # Validate vendor exists
        vendor = db.query(Vendor).filter(Vendor.id == v.vendor_id).first()
        if not vendor:
            raise HTTPException(404, f"Vendor {v.vendor_id} not found")

        total = calculate_vendor_total(v)
        total_vendor += total

        db.add(VendorExpense(
            expenditure_id=expenditure.id,
            vendor_id=v.vendor_id,
            vendor_total_exp=v.vendor_total_exp,
            accom=v.accom,
            vehicle_hire=v.vehicle_hire,
            jcb_hydra_other=v.jcb_hydra_other,
            tractor_trolly_water=v.tractor_trolly_water,
            local_vehicle_hire=v.local_vehicle_hire,
            sample_transport=v.sample_transport,
            misc=v.misc,
            misc_remark=v.misc_remark,
            total_exp=total
        ))

    # --------------------------------------------------
    # 🔥 UPDATE TOTALS (APPEND MODE)
    # --------------------------------------------------
    expenditure.total_manpower_amount += total_manpower
    expenditure.total_vendor_amount += total_vendor
    expenditure.grand_total = (
        expenditure.total_manpower_amount +
        expenditure.total_vendor_amount
    )

    db.commit()
    db.refresh(expenditure)

    return expenditure


# ================= UPDATE =================

def update_expenditure(db: Session, exp_id: int, data, current_user):

    role = normalize_role(current_user.role)

    exp = db.query(Expenditure).filter(Expenditure.id == exp_id).first()
    if not exp:
        raise HTTPException(404, "Expenditure not found")

    if role == "SUPERVISOR" and exp.created_by != current_user.id:
        raise HTTPException(403, "Not allowed")

    exp.location = data.location
    exp.date = data.date

    db.commit()
    db.refresh(exp)

    return exp


# ================= DELETE =================

def delete_expenditure(db: Session, exp_id: int, current_user):

    role = normalize_role(current_user.role)

    exp = db.query(Expenditure).filter(Expenditure.id == exp_id).first()
    if not exp:
        raise HTTPException(404, "Expenditure not found")

    if role == "SUPERVISOR" and exp.created_by != current_user.id:
        raise HTTPException(403, "Not allowed")

    db.delete(exp)
    db.commit()

    return {"message": "Deleted successfully"}


# ================= LIST =================

def get_project_expenditures(db: Session, project_id: int, current_user):

    role = normalize_role(current_user.role)

    query = db.query(Expenditure).options(
        joinedload(Expenditure.manpower_expenses),
        joinedload(Expenditure.vendor_expenses)
    ).filter(Expenditure.project_id == project_id)

    if role == "SUPERVISOR":
        query = query.filter(Expenditure.created_by == current_user.id)

    return query.all()


# ================= TOTAL REPORT =================

def get_project_totals(db: Session, project_id: int):

    expenditures = db.query(Expenditure).options(
        joinedload(Expenditure.manpower_expenses),
        joinedload(Expenditure.vendor_expenses)
    ).filter(Expenditure.project_id == project_id).all()

    totals = {
        "travel": 0,
        "accom": 0,
        "da": 0,
        "vehicle_hire": 0,
        "vendor_total": 0,
        "grand_total": 0
    }

    for exp in expenditures:
        for m in exp.manpower_expenses:
            totals["travel"] += m.travel
            totals["accom"] += m.accom
            totals["da"] += m.da
            totals["vehicle_hire"] += m.vehicle_hire

        for v in exp.vendor_expenses:
            totals["vendor_total"] += v.total_exp

        totals["grand_total"] += exp.grand_total

    return totals


def get_project_detailed(db: Session, project_id: int, current_user):

    role = normalize_role(current_user.role)

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    query = db.query(Expenditure).options(
        joinedload(Expenditure.manpower_expenses)
            .joinedload(ManpowerExpense.supervisor),
        joinedload(Expenditure.vendor_expenses)
            .joinedload(VendorExpense.vendor)
    ).filter(Expenditure.project_id == project_id)

    if role == "SUPERVISOR":
        query = query.filter(Expenditure.created_by == current_user.id)

    expenditures = query.all()

    supervisor_map = {}
    vendor_map = {}
    grand_total = 0

    for exp in expenditures:
        grand_total += exp.grand_total

        # ---- GROUP SUPERVISORS ----
        for m in exp.manpower_expenses:
            sid = m.supervisor_id

            if sid not in supervisor_map:
                supervisor_map[sid] = {
                    "supervisor_id": sid,
                    "supervisor_name": m.supervisor.full_name,
                    "total_manpower_amount": 0,
                    "manpower_expenses": []
                }

            supervisor_map[sid]["total_manpower_amount"] += m.total
            supervisor_map[sid]["manpower_expenses"].append({
                "travel": m.travel,
                "accom": m.accom,
                "da": m.da,
                "vehicle_hire": m.vehicle_hire,
                "misc": m.misc,
                "total": m.total
            })

        # ---- GROUP VENDORS ----
        for v in exp.vendor_expenses:
            vid = v.vendor_id

            if vid not in vendor_map:
                vendor_map[vid] = {
                    "vendor_id": vid,
                    "vendor_name": v.vendor.vendor_company or v.vendor.contact_person,
                    "total_vendor_amount": 0,
                    "vendor_expenses": []
                }

            vendor_map[vid]["total_vendor_amount"] += v.total_exp
            vendor_map[vid]["vendor_expenses"].append({
                "vendor_total_exp": v.vendor_total_exp,
                "vehicle_hire": v.vehicle_hire,
                "jcb_hydra_other": v.jcb_hydra_other,
                "total_exp": v.total_exp
            })

    return {
        "project_id": project.id,
        "project_name": project.name,
        "company_name": getattr(project, "company_name", None) or project.client_name,
        "department": getattr(project, "department", None),
        "location": project.location,
        "start_date": getattr(project, "start_date", None) or project.planned_start_date,
        "end_date": getattr(project, "end_date", None) or project.planned_end_date,
        "duration": getattr(project, "duration", None),
        "supervisors": list(supervisor_map.values()),
        "vendors": list(vendor_map.values()),
        "grand_total": grand_total
    }