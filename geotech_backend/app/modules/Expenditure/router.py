# app/modules/Expenditure/routes.py

# app/modules/Expenditure/routes.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from fastapi.encoders import jsonable_encoder
from typing import List

from app.core.database import get_db
from app.modules.Expenditure import schemas, service
from app.modules.Expenditure.models import Expenditure
from app.modules.projects.models import Project
from app.modules.Expenditure.schemas import (
    ExpenditureCreate,
    ExpenditureUpdate,
    ExpenditureResponse
)
from app.utils.dependencies import get_current_user, normalize_role

router = APIRouter(prefix="/expenditures", tags=["Expenditures"])



@router.get("/aggregated-all-projects")
def get_all_projects_expenditures_aggregated(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Returns aggregated expenditure data for all projects.
    """
    role = normalize_role(current_user.role)
    
    # Get all projects (optionally filter by role)
    projects_query = db.query(Project).all()

    result = []

    for project in projects_query:
        # Get all expenditures for this project
        expenditures = db.query(Expenditure).options(
            joinedload(Expenditure.manpower_expenses),
            joinedload(Expenditure.vendor_expenses)
        ).filter(Expenditure.project_id == project.id)

        if role == "SUPERVISOR":
            expenditures = expenditures.filter(Expenditure.created_by == current_user.id)

        expenditures = expenditures.all()

        # Skip projects with no expenditures
        if not expenditures:
            continue

        # Aggregate all expenditure fields for the project
        manpower_names = set()
        vendor_names = set()
        manpower_totals = {
            "travel": 0,
            "accom": 0,
            "da": 0,
            "vehicle_hire": 0,
            "jcb_hydra_other": 0,
            "tractor_trolly_water": 0,
            "local_vehicle_hire": 0,
            "sample_transport": 0,
            "misc": 0,
            "total": 0
        }
        vendor_totals = {
            "vendor_total_exp": 0,
            "accom": 0,
            "vehicle_hire": 0,
            "jcb_hydra_other": 0,
            "tractor_trolly_water": 0,
            "local_vehicle_hire": 0,
            "sample_transport": 0,
            "misc": 0,
            "total_exp": 0
        }
        start_date = None
        end_date = None
        grand_total = 0

        for exp in expenditures:
            # Track min start date / max end date
            if not start_date or exp.start_date < start_date:
                start_date = exp.start_date
            if not end_date or exp.end_date > end_date:
                end_date = exp.end_date

            # Manpower names and totals
            for m in exp.manpower_expenses:
                manpower_names.add(m.supervisor.full_name)
                manpower_totals["travel"] += m.travel
                manpower_totals["accom"] += m.accom
                manpower_totals["da"] += m.da
                manpower_totals["vehicle_hire"] += m.vehicle_hire
                manpower_totals["jcb_hydra_other"] += m.jcb_hydra_other
                manpower_totals["tractor_trolly_water"] += m.tractor_trolly_water
                manpower_totals["local_vehicle_hire"] += m.local_vehicle_hire
                manpower_totals["sample_transport"] += m.sample_transport
                manpower_totals["misc"] += m.misc
                manpower_totals["total"] += m.total

            # Vendor totals
            for v in exp.vendor_expenses:
                vendor_names.add(v.vendor.vendor_company or v.vendor.contact_person)
                vendor_totals["vendor_total_exp"] += v.vendor_total_exp
                vendor_totals["accom"] += v.accom
                vendor_totals["vehicle_hire"] += v.vehicle_hire
                vendor_totals["jcb_hydra_other"] += v.jcb_hydra_other
                vendor_totals["tractor_trolly_water"] += v.tractor_trolly_water
                vendor_totals["local_vehicle_hire"] += v.local_vehicle_hire
                vendor_totals["sample_transport"] += v.sample_transport
                vendor_totals["misc"] += v.misc
                vendor_totals["total_exp"] += v.total_exp

            grand_total += exp.grand_total

        duration = (end_date - start_date).days + 1 if start_date and end_date else 0

        result.append({
            "project_id": project.id,
            "company_name": getattr(project, "company_name", None) or project.client_name,
            "department": getattr(project, "department", None),
            "project_name": project.name,
            "location": project.location,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "duration": f"{duration} Days",
            "manpower_names": ", ".join(manpower_names),
            "vendor_names": ", ".join(vendor_names),
            "manpower_totals": manpower_totals,
            "vendor_totals": vendor_totals,
            "grand_total": grand_total
        })

    # Convert to JSON-compatible structure
    return jsonable_encoder(result)




# ================= CREATE =================
@router.post(
    "/",
    response_model=ExpenditureResponse,
    status_code=status.HTTP_201_CREATED
)
def create_expenditure(
    data: ExpenditureCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Supervisor:
        - Can create expenditure
        - Adds only their manpower
        - Can attach vendors
    """
    return service.create_expenditure(db, data, current_user)


# ================= UPDATE =================
@router.put(
    "/{exp_id}",
    response_model=ExpenditureResponse
)
def update_expenditure(
    exp_id: int,
    data: ExpenditureUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Supervisor:
        - Can update only their own expenditure
    SuperAdmin:
        - Can update any
    """
    return service.update_expenditure(db, exp_id, data, current_user)


# ================= DELETE =================
@router.delete("/{exp_id}")
def delete_expenditure(
    exp_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Supervisor:
        - Can delete only their own
    SuperAdmin:
        - Can delete any
    """
    return service.delete_expenditure(db, exp_id, current_user)


# ================= LIST PROJECT EXPENDITURES =================
@router.get(
    "/project/{project_id}",
    response_model=List[ExpenditureResponse]
)
def get_project_expenditures(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Supervisor:
        - Sees only their expenditures

    SuperAdmin:
        - Sees all expenditures of project
    """
    return service.get_project_expenditures(
        db,
        project_id,
        current_user
    )


# ================= TOTAL SUMMARY =================
# Auth-gated (was public — K-03). Supervisors scoped to assigned projects.
@router.get("/project/{project_id}/totals")
def get_project_totals(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Returns summarized totals for project
    Mostly for SuperAdmin dashboard
    """
    from app.modules.projects.service import is_supervisor_assigned
    if normalize_role(current_user.role) == "SUPERVISOR" and not is_supervisor_assigned(
            db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if normalize_role(current_user.role) == "VENDOR":
        raise HTTPException(status_code=403, detail="Not permitted")
    return service.get_project_totals(db, project_id)


# ================= DETAILED GROUP VIEW =================
@router.get("/project/{project_id}/detailed")
def get_project_detailed(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Returns:
        - Project details
        - Grouped supervisors
        - Grouped vendors
        - Grand total
    """
    return service.get_project_detailed(
        db,
        project_id,
        current_user
    )