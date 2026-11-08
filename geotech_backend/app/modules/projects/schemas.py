import re

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import date

# Indian statutory identifiers: PAN (10 chars) and GSTIN (15 chars).
PAN_PATTERN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


def _clean_identifier(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().upper().replace(" ", "")
    return cleaned or None


def _validate_pan(value: Optional[str]) -> Optional[str]:
    cleaned = _clean_identifier(value)
    if cleaned and not PAN_PATTERN.match(cleaned):
        raise ValueError("project_pan must be a valid 10-character PAN (e.g. ABCDE1234F)")
    return cleaned


def _validate_gstin(value: Optional[str]) -> Optional[str]:
    cleaned = _clean_identifier(value)
    if cleaned and not GSTIN_PATTERN.match(cleaned):
        raise ValueError("project_gst must be a valid 15-character GSTIN")
    return cleaned


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

    # Statutory identity (PAN is enforced on create; GSTIN remains optional)
    project_pan: Optional[str] = None
    project_gst: Optional[str] = None

    # Field operations profile
    number_of_rigs: int = 0
    rig_types: Optional[str] = None
    area_of_working: Optional[str] = None

    @field_validator("priority")
    @classmethod
    def priority_known(cls, v):
        if v is not None and v not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            raise ValueError("priority must be LOW, MEDIUM, HIGH or CRITICAL")
        return v

    @field_validator("project_pan")
    @classmethod
    def pan_known(cls, v):
        return _validate_pan(v)

    @field_validator("project_gst")
    @classmethod
    def gst_known(cls, v):
        return _validate_gstin(v)

    @field_validator("number_of_rigs")
    @classmethod
    def rigs_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("number_of_rigs cannot be negative")
        return v

    @model_validator(mode="after")
    def dates_sane(self):
        if (self.planned_start_date and self.planned_end_date
                and self.planned_end_date < self.planned_start_date):
            raise ValueError("planned_end_date cannot be before planned_start_date")
        return self


class ProjectCreate(ProjectBase):
    # Mandatory on creation — the API rejects projects without a valid PAN.
    project_pan: str = Field(..., min_length=10, max_length=10)
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
    project_pan: Optional[str] = None
    project_gst: Optional[str] = None
    number_of_rigs: Optional[int] = None
    rig_types: Optional[str] = None
    area_of_working: Optional[str] = None

    supervisor_ids: Optional[List[int]] = None
    machine_ids: Optional[List[int]] = None
    vendor_ids: Optional[List[int]] = None

    @field_validator("priority")
    @classmethod
    def priority_known(cls, v):
        if v is not None and v not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            raise ValueError("priority must be LOW, MEDIUM, HIGH or CRITICAL")
        return v

    @field_validator("project_pan")
    @classmethod
    def pan_known(cls, v):
        return _validate_pan(v)

    @field_validator("project_gst")
    @classmethod
    def gst_known(cls, v):
        return _validate_gstin(v)

    @field_validator("number_of_rigs")
    @classmethod
    def rigs_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("number_of_rigs cannot be negative")
        return v

    @model_validator(mode="after")
    def dates_sane(self):
        if (self.planned_start_date and self.planned_end_date
                and self.planned_end_date < self.planned_start_date):
            raise ValueError("planned_end_date cannot be before planned_start_date")
        return self


class ProjectResponse(ProjectBase):
    id: int
    # Budget is role-redacted: supervisors and vendors receive null.
    project_budget: Optional[float] = None
    supervisors: List[UserResponse] = []
    machinery: List[MachineResponse] = []
    vendors: List[VendorResponse] = []

    class Config:
        from_attributes = True


class ProjectStatusChange(BaseModel):
    status: str
    reason: Optional[str] = None
