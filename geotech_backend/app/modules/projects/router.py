from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.projects import service, schemas
from app.utils.dependencies import (
    normalize_role, require_superadmin, get_current_user, require_roles,
)

router = APIRouter(prefix="/projects", tags=["Projects"])

_project_write = require_roles("SUPERADMIN", "ADMIN")

# ---------------- CREATE PROJECT ----------------
@router.post("/", response_model=schemas.ProjectResponse, dependencies=[Depends(_project_write)])
def create_project_api(data: schemas.ProjectCreate, db: Session = Depends(get_db),
                       current_user=Depends(get_current_user)):
    from app.modules.users.audit import log_action
    project = service.create_project(db, data)
    log_action(db, action="PROJECT_CREATED", actor_id=current_user.id,
               target_type="project", target_id=project.id,
               metadata={"code": project.project_code})
    db.commit()
    return service.transform_project(project)

# ---------------- SEARCH (autocomplete GEO-2026-001) ----------------
@router.get("/search")
def search_projects_api(q: str = "", limit: int = 20,
                        db: Session = Depends(get_db),
                        current_user=Depends(get_current_user)):
    return service.search_projects(db, q, current_user, limit=limit)


# ---------------- GET PROJECTS BASED ON ROLE ----------------
# Backend-enforced: supervisors see ONLY assigned projects, vendors ONLY
# projects of their assigned orgs (legacy links + canonical assignments).
# Never rely on frontend filtering.
@router.get("/my-projects", response_model=list[schemas.ProjectResponse])
def my_projects(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    role = normalize_role(current_user.role)
    if role in ("SUPERADMIN", "ADMIN", "MONITOR"):
        projects = service.get_projects(db)
    elif role == "SUPERVISOR":
        projects = service.get_projects_for_supervisor(db, current_user.id)
    elif role == "VENDOR":
        projects = service.get_projects_for_vendor(db, current_user.id)
    else:
        raise HTTPException(403, "Access denied")
    return [service.transform_project(p) for p in projects]

# ---------------- GET PROJECT BY ID ----------------
@router.get("/{project_id}", response_model=schemas.ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = service.get_project_with_relations(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    role = normalize_role(current_user.role)
    if role == "SUPERVISOR" and not service.is_supervisor_assigned(db, project_id, current_user.id):
        raise HTTPException(403, "Access denied")
    if role == "VENDOR" and not service.is_vendor_assigned(db, project_id, current_user.id):
        raise HTTPException(403, "Access denied")
    if role not in ("SUPERADMIN", "ADMIN", "SUPERVISOR", "VENDOR", "MONITOR"):
        raise HTTPException(403, "Access denied")
    return service.transform_project(project)



# ---------------- GET DETAILED PROJECT DETAILS BY ID ----------------
# Auth enforced (was public): supervisors only if assigned.
@router.get("/details/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    role = normalize_role(current_user.role)
    if role == "SUPERVISOR" and not service.is_supervisor_assigned(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "VENDOR" and not service.is_vendor_assigned(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if role not in ("SUPERADMIN", "ADMIN", "SUPERVISOR", "VENDOR", "MONITOR"):
        raise HTTPException(status_code=403, detail="Access denied")
    project = service.get_project_with_full_details(db, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return service.transform_Full_project_Details(project)


# ---------------- PROJECT ASSIGNMENTS (foundation, history preserved) ----------------
@router.get("/{project_id}/assignments")
def list_project_assignments(project_id: int, db: Session = Depends(get_db),
                             current_user=Depends(get_current_user)):
    from app.modules.projects import models
    role = normalize_role(current_user.role)
    if role == "SUPERVISOR" and not service.is_supervisor_assigned(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if role not in ("SUPERADMIN", "ADMIN", "SUPERVISOR", "MONITOR"):
        raise HTTPException(status_code=403, detail="Access denied")
    rows = db.query(models.ProjectAssignment).filter(
        models.ProjectAssignment.project_id == project_id).all()
    return [
        {
            "id": r.id, "project_id": r.project_id, "user_id": r.user_id,
            "assignment_role": r.assignment_role, "status": r.status,
            "is_primary": bool(getattr(r, "is_primary", False)),
            "start_date": r.start_date, "end_date": r.end_date,
            "assigned_by": r.assigned_by, "assigned_at": r.assigned_at,
            "removed_by": r.removed_by, "removed_at": r.removed_at,
            "removal_reason": r.removal_reason, "notes": r.notes,
        }
        for r in rows
    ]



# ---------------- PROJECT STATUS LIFECYCLE ----------------
@router.patch("/{project_id}/status")
def change_project_status(project_id: int, data: schemas.ProjectStatusChange,
                          db: Session = Depends(get_db),
                          current_user=Depends(get_current_user)):
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    return service.change_project_status(
        db, project_id, data.status,
        actor_id=current_user.id, reason=data.reason)



# ---------------- UPDATE PROJECT ----------------
@router.put("/{project_id}", response_model=schemas.ProjectResponse, dependencies=[Depends(_project_write)])
def update_project_api(project_id: int, data: schemas.ProjectUpdate, db: Session = Depends(get_db),
                       current_user=Depends(get_current_user)):
    from app.modules.users.audit import log_action
    project = service.update_project(db, project_id, data)
    log_action(db, action="PROJECT_UPDATED", actor_id=current_user.id,
               target_type="project", target_id=project.id, metadata={})
    db.commit()
    return service.transform_project(project)

# ---------------- DELETE PROJECT ----------------
@router.delete("/{project_id}", dependencies=[Depends(require_superadmin)])
def delete_project_api(project_id: int, db: Session = Depends(get_db)):
    project = service.delete_project(db, project_id)
    return {"message": "Project deleted successfully"}


# ---------------- TEAM ASSIGNMENT (enforced backend) ----------------
@router.post("/{project_id}/supervisors")
def assign_supervisor(project_id: int, supervisor_id: int,
                      db: Session = Depends(get_db),
                      current_user=Depends(get_current_user)):
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    project = service.assign_supervisor_to_project(
        db, project_id, supervisor_id, actor_id=current_user.id)
    return service.transform_project(project)


@router.post("/{project_id}/vendors")
def assign_vendor(project_id: int, vendor_id: int,
                  db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    project = service.assign_vendor_to_project(
        db, project_id, vendor_id, actor_id=current_user.id)
    return service.transform_project(project)


@router.post("/{project_id}/machines")
def assign_machine(project_id: int, machine_id: int, force: bool = False,
                   db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not permitted")
    project = service.assign_machine_to_project(
        db, project_id, machine_id, actor_id=current_user.id, force=force)
    return service.transform_project(project)


@router.get("/{project_id}/cost-ledger")
def project_cost_ledger(project_id: int, db: Session = Depends(get_db),
                        current_user=Depends(get_current_user)):
    role = normalize_role(current_user.role)
    if role == "SUPERVISOR" and not service.is_supervisor_assigned(
            db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if role not in ("SUPERADMIN", "ADMIN", "SUPERVISOR", "MONITOR"):
        raise HTTPException(status_code=403, detail="Access denied")
    return service.get_cost_ledger(db, project_id)


@router.get("/{project_id}/timeline")
def project_timeline(project_id: int, db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    role = normalize_role(current_user.role)
    if role == "SUPERVISOR" and not service.is_supervisor_assigned(
            db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "VENDOR" and not service.is_vendor_assigned(
            db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if role not in ("SUPERADMIN", "ADMIN", "SUPERVISOR", "VENDOR", "MONITOR"):
        raise HTTPException(status_code=403, detail="Access denied")
    return service.get_project_timeline(db, project_id)


# ---------------- PROJECT AUDIT ----------------
@router.get("/{project_id}/audit")
def project_audit(project_id: int, db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    from app.modules.users import models as user_models
    if normalize_role(current_user.role) not in ("SUPERADMIN", "ADMIN", "MONITOR"):
        raise HTTPException(status_code=403, detail="Not permitted")
    if not service.get_project_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return db.query(user_models.AuditLog).filter(
        user_models.AuditLog.target_type == "project",
        user_models.AuditLog.target_id == project_id,
    ).order_by(user_models.AuditLog.timestamp.desc()).limit(100).all()

# ---------------- SUPERVISOR ATTENDANCE & MACHINERY COST ----------------
@router.get("/{project_id}/supervisor-attendance")
def project_supervisor_attendance(project_id: int, db: Session = Depends(get_db),
                                  current_user=Depends(get_current_user)):
    """Days worked, hours, manpower and machinery cost per supervisor.
    Machinery cost uses the accepted work-order rate, else the master rate."""
    role = normalize_role(current_user.role)
    if not service.get_project_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if role == "SUPERVISOR" and not service.is_supervisor_assigned(
            db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if role not in ("SUPERADMIN", "ADMIN", "SUPERVISOR", "MONITOR"):
        raise HTTPException(status_code=403, detail="Not permitted")
    return service.get_supervisor_attendance(db, project_id=project_id)