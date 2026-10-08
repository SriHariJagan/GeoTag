from pydantic import BaseModel, Field, field_validator
from datetime import date, datetime
from typing import Optional, List


# ---------------- CREATOR ----------------
class CreatedByResponse(BaseModel):
    id: int
    full_name: str
    role: str

    class Config:
        from_attributes = True


# ---------------- PROJECT SHORT ----------------
class ProjectShort(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


# ---------------- VENDOR SHORT ----------------
class VendorShort(BaseModel):
    id: int
    # 🔥 Map DB column "vendor_company" → API field "vendor_name"
    vendor_name: str = Field(alias="vendor_company")

    class Config:
        from_attributes = True
        populate_by_name = True


# ---------------- BASE ----------------
class DailyExecutionBase(BaseModel):
    project_id: int
    vendor_id: Optional[int] = None
    machine_id: Optional[int] = None

    borehole_started: str
    borehole_ended: str

    site_location: str
    borehole_no: str
    rig_no: str
    type_of_rig: str
    chainage: str

    depth_started: float = Field(0, ge=0)
    hours_worked: float = Field(0, ge=0)
    manpower_count: int = Field(0, ge=0)
    soil_depth: float = Field(0, ge=0)
    soft_rock_depth: float = Field(0, ge=0)
    hard_rock_depth: float = Field(0, ge=0)

    client: str
    client_person_name: str
    client_person_designation: str

    weather_condition: Optional[str] = None
    delay_reason: Optional[str] = None
    work_status: str = "working"
    remarks: Optional[str] = None
    report_date: date

    @field_validator(
        "depth_started",
        "hours_worked",
        "soil_depth",
        "soft_rock_depth",
        "hard_rock_depth",
        mode="before",
    )
    @classmethod
    def parse_floats(cls, v):
        if v is None or v == "":
            return 0.0
        return float(v)


# ---------------- CREATE ----------------
class DailyExecutionCreate(DailyExecutionBase):
    status: Optional[str] = "SUBMITTED"

    @field_validator("status")
    @classmethod
    def status_known(cls, v):
        if v is not None and v.upper() not in ("DRAFT", "SUBMITTED"):
            raise ValueError("status must be DRAFT or SUBMITTED")
        return v

    @field_validator("report_date")
    @classmethod
    def not_future(cls, v):
        if v and v > date.today():
            raise ValueError("report_date cannot be in the future")
        return v


# ---------------- UPDATE ----------------
class DailyExecutionUpdate(BaseModel):
    project_id: Optional[int] = None
    vendor_id: Optional[int] = None
    machine_id: Optional[int] = None

    borehole_started: Optional[str] = None
    borehole_ended: Optional[str] = None

    site_location: Optional[str] = None
    borehole_no: Optional[str] = None
    rig_no: Optional[str] = None
    type_of_rig: Optional[str] = None
    chainage: Optional[str] = None

    depth_started: Optional[float] = Field(None, ge=0)
    hours_worked: Optional[float] = Field(None, ge=0)
    manpower_count: Optional[int] = Field(None, ge=0)
    soil_depth: Optional[float] = Field(None, ge=0)
    soft_rock_depth: Optional[float] = Field(None, ge=0)
    hard_rock_depth: Optional[float] = Field(None, ge=0)

    client: Optional[str] = None
    client_person_name: Optional[str] = None
    client_person_designation: Optional[str] = None
    weather_condition: Optional[str] = None
    delay_reason: Optional[str] = None
    work_status: Optional[str] = None
    remarks: Optional[str] = None
    report_date: Optional[date] = None


# ---------------- RESPONSE ----------------
class DERManpowerResponse(BaseModel):
    id: int
    category: Optional[str] = None
    role: Optional[str] = None
    planned_count: int = 0
    actual_count: int = 0
    hours: float = 0
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


class DEREquipmentResponse(BaseModel):
    id: int
    machine_id: Optional[int] = None
    equipment_name: Optional[str] = None
    quantity: int = 1
    hours_used: float = 0
    utilization: Optional[float] = None
    condition: Optional[str] = None
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


class DERVendorActivityResponse(BaseModel):
    id: int
    vendor_id: int
    work_order_id: Optional[int] = None
    activity: Optional[str] = None
    quantity_completed: Optional[float] = None
    progress: Optional[float] = None
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


class DailyExecutionResponse(DailyExecutionBase):
    id: int
    total_depth: float
    status: str = "SUBMITTED"

    creator: CreatedByResponse
    project: ProjectShort
    vendor: Optional[VendorShort]
    manpower: List[DERManpowerResponse] = []
    equipment: List[DEREquipmentResponse] = []
    vendor_activity: List[DERVendorActivityResponse] = []

    class Config:
        from_attributes = True


# ---------------- CHILD CREATE ----------------

class DERManpowerCreate(BaseModel):
    category: Optional[str] = None
    role: Optional[str] = None
    planned_count: int = Field(0, ge=0)
    actual_count: int = Field(0, ge=0)
    hours: float = Field(0, ge=0)
    remarks: Optional[str] = None


class DEREquipmentCreate(BaseModel):
    machine_id: Optional[int] = None
    equipment_name: Optional[str] = None
    quantity: int = Field(1, ge=1)
    hours_used: float = Field(0, ge=0)
    utilization: Optional[float] = None
    condition: Optional[str] = None
    remarks: Optional[str] = None


class DERVendorActivityCreate(BaseModel):
    vendor_id: int
    work_order_id: Optional[int] = None
    activity: Optional[str] = None
    quantity_completed: Optional[float] = Field(None, ge=0)
    progress: Optional[float] = Field(None, ge=0)
    remarks: Optional[str] = None


# ---------------- EDIT REQUESTS (supervisor asks, admin decides) ----------------

class DEREditRequestCreate(BaseModel):
    message: str = Field(..., min_length=3, max_length=2000)


class DEREditRequestReview(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=2000)


class DEREditRequestResponse(BaseModel):
    id: int
    report_id: int
    requested_by: int
    requester_name: Optional[str] = None
    message: str
    status: str = "PENDING"
    reviewed_by: Optional[int] = None
    review_note: Optional[str] = None
    created_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    # report context for the review queue
    report_date: Optional[date] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    borehole_no: Optional[str] = None
    report_status: Optional[str] = None

    class Config:
        from_attributes = True
