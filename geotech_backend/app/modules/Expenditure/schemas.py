from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date


# ================= MANPOWER =================

class ManpowerBase(BaseModel):
    travel: float = 0
    accom: float = 0
    da: float = 0
    vehicle_hire: float = 0
    jcb_hydra_other: float = 0
    tractor_trolly_water: float = 0
    local_vehicle_hire: float = 0
    sample_transport: float = 0
    misc: float = 0
    misc_remark: Optional[str] = None


class ManpowerCreate(ManpowerBase):
    # Required only for SUPERADMIN
    supervisor_id: Optional[int] = None


class ManpowerResponse(ManpowerBase):
    id: int
    supervisor_id: int
    total: float

    class Config:
        from_attributes = True


# ================= VENDOR =================

class VendorExpenseBase(BaseModel):
    vendor_total_exp: float = 0
    accom: float = 0
    vehicle_hire: float = 0
    jcb_hydra_other: float = 0
    tractor_trolly_water: float = 0
    local_vehicle_hire: float = 0
    sample_transport: float = 0
    misc: float = 0
    misc_remark: Optional[str] = None


class VendorExpenseCreate(VendorExpenseBase):
    vendor_id: int


class VendorExpenseResponse(VendorExpenseBase):
    id: int
    vendor_id: int
    total_exp: float

    class Config:
        from_attributes = True


# ================= EXPENDITURE =================

class ExpenditureBase(BaseModel):
    location: Optional[str] = None
    company_name: Optional[str] = None
    department: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    duration: Optional[int] = None
    date: date


class ExpenditureCreate(ExpenditureBase):
    project_id: int
    manpower: List[ManpowerCreate] = Field(default_factory=list)
    vendors: List[VendorExpenseCreate] = Field(default_factory=list)


# Separate schema for update (professional practice)
class ExpenditureUpdate(BaseModel):
    location: Optional[str] = None
    date: Optional[date] = None


class ExpenditureResponse(ExpenditureBase):
    id: int
    project_id: int
    created_by: int

    total_manpower_amount: float
    total_vendor_amount: float
    grand_total: float

    manpower_expenses: List[ManpowerResponse]
    vendor_expenses: List[VendorExpenseResponse]

    class Config:
        from_attributes = True