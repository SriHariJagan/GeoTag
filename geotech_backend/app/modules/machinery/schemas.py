from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


class MachineBase(BaseModel):
    machine_name: str
    machine_type: str
    last_maintenance: Optional[date] = None
    status: str = "active"
    rate_per_day: Optional[float] = None


class MachineCreate(MachineBase):
    pass


class MachineUpdate(BaseModel):
    machine_name: Optional[str] = None
    machine_type: Optional[str] = None
    last_maintenance: Optional[date] = None
    status: Optional[str] = None
    rate_per_day: Optional[float] = None


class MachineResponse(MachineBase):
    id: int
    created_at: datetime
    project_names: List[str] = []

    class Config:
        from_attributes = True