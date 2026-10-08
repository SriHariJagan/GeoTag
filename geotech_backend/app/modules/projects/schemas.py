from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import date


# ---------------- Nested ----------------
class UserResponse(BaseModel):
    id: int
    full_name: str

    class Config:
        from_attributes = True


class MachineResponse(BaseModel):
    id: int
    machine_name: str

    class Config:
        from_attributes = True


class VendorResponse(BaseModel):
    id: int
    vendor_name: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------- Base ----------------
class ProjectBase(BaseModel):
    project_code: str
    date: str
    name: str
    client_name: str
    engineer_in_charge: str
    location: str
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    actual_start_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    project_budget: float = 0
    estimated_total_depth: float = 0
    target_depth_per_day: float = 0
    target_boreholes_per_day: float = 0
    status: str = "Not Started"
    progress: float = 0
    total_boreholes: int = 0
    completed_boreholes: int = 0
    # V3 descriptors
    description: Optional[str] = None
    project_type: Optional[str] = None
    priority: Optional[str] = None
    currency: str = "INR"

    @field_validator("priority")
    @classmethod
    def priority_known(cls, v):
        if v is not None and v not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            raise ValueError("priority must be LOW, MEDIUM, HIGH or CRITICAL")
        return v

    @model_validator(mode="after")
    def dates_sane(self):
        if (self.planned_start_date and self.planned_end_date
                and self.planned_end_date < self.planned_start_date):
            raise ValueError("planned_end_date cannot be before planned_start_date")
        return self


class ProjectCreate(ProjectBase):
    supervisor_ids: List[int] = Field(default_factory=list)
    machine_ids: List[int] = Field(default_factory=list)
    vendor_ids: List[int] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    project_code: Optional[str] = None
    date: Optional[str] = None
    name: Optional[str] = None
    client_name: Optional[str] = None
    engineer_in_charge: Optional[str] = None
    location: Optional[str] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    actual_start_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    project_budget: Optional[float] = None
    estimated_total_depth: Optional[float] = None
    target_depth_per_day: Optional[float] = None
    target_boreholes_per_day: Optional[float] = None
    status: Optional[str] = None
    total_boreholes: Optional[int] = None
    completed_boreholes: Optional[int] = None
    description: Optional[str] = None
    project_type: Optional[str] = None
    priority: Optional[str] = None
    currency: Optional[str] = None

    supervisor_ids: Optional[List[int]] = None
    machine_ids: Optional[List[int]] = None
    vendor_ids: Optional[List[int]] = None

    @field_validator("priority")
    @classmethod
    def priority_known(cls, v):
        if v is not None and v not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            raise ValueError("priority must be LOW, MEDIUM, HIGH or CRITICAL")
        return v

    @model_validator(mode="after")
    def dates_sane(self):
        if (self.planned_start_date and self.planned_end_date
                and self.planned_end_date < self.planned_start_date):
            raise ValueError("planned_end_date cannot be before planned_start_date")
        return self


class ProjectResponse(ProjectBase):
    id: int
    supervisors: List[UserResponse] = []
    machinery: List[MachineResponse] = []
    vendors: List[VendorResponse] = []

    class Config:
        from_attributes = True


class ProjectStatusChange(BaseModel):
    status: str
    reason: Optional[str] = None
