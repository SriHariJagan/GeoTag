from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.utils.dependencies import require_superadmin, get_current_user
from app.utils.pagination import page_param, limit_param, set_total
from . import schemas, service

router = APIRouter(
    prefix="/machines",
    tags=["Machinery"],
)


# CREATE
@router.post(
    "/",
    response_model=schemas.MachineResponse,
    dependencies=[Depends(require_superadmin)]
)
def create_machine(
    data: schemas.MachineCreate,
    db: Session = Depends(get_db),
):
    return service.create_machine(db, data)


# GET ALL
@router.get("/", response_model=list[schemas.MachineResponse])
def list_machines(
    q: Optional[str] = None,
    page: int = page_param(), limit: int = limit_param(),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    response: Response = None,
):
    rows, total = service.get_machines(db, q=q, page=page, limit=limit)
    if response is not None:
        set_total(response, total)
    return rows


# GET BY ID
@router.get("/{machine_id}", response_model=schemas.MachineResponse)
def get_machine(
    machine_id: int,
    db: Session = Depends(get_db),
):
    machine = service.get_machine_by_id(db, machine_id)
    if not machine:
        raise HTTPException(404, "Machine not found")
    return machine


# UPDATE
@router.put(
    "/{machine_id}",
    response_model=schemas.MachineResponse,
    dependencies=[Depends(require_superadmin)]
)
def update_machine(
    machine_id: int,
    data: schemas.MachineUpdate,
    db: Session = Depends(get_db),
):
    machine = service.update_machine(db, machine_id, data)
    if not machine:
        raise HTTPException(404, "Machine not found")
    return machine



# DELETE
@router.delete(
    "/{machine_id}",
    dependencies=[Depends(require_superadmin)]
)
def delete_machine(
    machine_id: int,
    db: Session = Depends(get_db),
):
    machine = service.delete_machine(db, machine_id)
    if not machine:
        raise HTTPException(404, "Machine not found")
    return {"message": "Machine deleted successfully"}