from sqlalchemy.orm import joinedload
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.modules.projects.models import ProjectMachine
from . import models


# ---------------- CREATE ----------------
def create_machine(db: Session, data):
    machine = models.Machine(**data.dict())
    db.add(machine)
    db.commit()
    db.refresh(machine)
    return machine


# ---------------- GET ALL ----------------
def get_machines(db: Session, q: str | None = None,
                 page: int = 1, limit: int = 20) -> tuple[list, int]:
    from app.utils.pagination import paginate_query
    query = db.query(models.Machine).options(
        joinedload(models.Machine.projects)
        .joinedload(ProjectMachine.project)
    )
    if (q or "").strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            models.Machine.machine_name.ilike(like) |
            models.Machine.machine_type.ilike(like))
    machines, total = paginate_query(
        query.order_by(models.Machine.id.desc()), page, limit)

    result = []

    for machine in machines:
        project_names = [
            link.project.name
            for link in machine.projects
            if link.project
        ]

        result.append({
            "id": machine.id,
            "machine_name": machine.machine_name,
            "machine_type": machine.machine_type,
            "last_maintenance": machine.last_maintenance,
            "status": machine.status,
            "created_at": machine.created_at,
            "project_names": project_names
        })

    return result, total


# ---------------- GET BY ID ----------------
def get_machine_by_id(db: Session, machine_id: int):
    machine = db.query(models.Machine).options(
        joinedload(models.Machine.projects)
        .joinedload(ProjectMachine.project)
    ).filter(models.Machine.id == machine_id).first()

    if not machine:
        return None

    project_names = [
        link.project.name
        for link in machine.projects
        if link.project
    ]

    return {
        "id": machine.id,
        "machine_name": machine.machine_name,
        "machine_type": machine.machine_type,
        "last_maintenance": machine.last_maintenance,
        "status": machine.status,
        "created_at": machine.created_at,
        "project_names": project_names
    }


# ---------------- UPDATE ----------------
def update_machine(db: Session, machine_id: int, data):
    machine = db.query(models.Machine).filter(
        models.Machine.id == machine_id
    ).first()

    if not machine:
        return None

    for key, value in data.dict(exclude_unset=True).items():
        setattr(machine, key, value)

    db.commit()
    db.refresh(machine)
    return machine


# ---------------- DELETE ----------------
def delete_machine(db: Session, machine_id: int):
    machine = db.query(models.Machine).filter(
        models.Machine.id == machine_id
    ).first()

    if not machine:
        return None

    db.delete(machine)
    db.commit()
    return machine

