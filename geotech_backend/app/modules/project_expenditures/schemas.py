"""Project expenditure schemas — PATCH uses exclude_unset (K-11 fix)."""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from datetime import date, datetime

from app.core.rbac import EXP_CATEGORIES, VALID_EXP_STATUSES


class ProjectExpenditureCreate(BaseModel):
    project_id: int
    expense_date: date
    expense_category: str
    description: Optional[str] = None
    amount: float
    currency: str = "INR"
    vendor_id: Optional[int] = None
    work_order_id: Optional[int] = None
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None

    @field_validator("expense_category")
    @classmethod
    def cat_known(cls, v):
        v = v.strip().upper()
        if v not in EXP_CATEGORIES:
            raise ValueError(f"expense_category must be one of {sorted(EXP_CATEGORIES)}")
        return v

    @field_validator("amount")
    @classmethod
    def amount_valid(cls, v):
        if v is None or v < 0:
            raise ValueError("amount must be >= 0")
        return v

    @field_validator("expense_date")
    @classmethod
    def not_future(cls, v):
        if v and v > date.today():
            raise ValueError("expense_date cannot be in the future")
        return v


class ProjectExpenditureUpdate(BaseModel):
    """PATCH semantics: only supplied fields change (exclude_unset)."""

    expense_date: Optional[date] = None
    expense_category: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    vendor_id: Optional[int] = None
    work_order_id: Optional[int] = None
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None

    @field_validator("expense_category")
    @classmethod
    def cat_known(cls, v):
        if v is not None and v.strip().upper() not in EXP_CATEGORIES:
            raise ValueError(f"expense_category must be one of {sorted(EXP_CATEGORIES)}")
        return v.upper().strip() if v is not None else v

    @field_validator("amount")
    @classmethod
    def amount_valid(cls, v):
        if v is not None and v < 0:
            raise ValueError("amount must be >= 0")
        return v


class ProjectExpenditureResponse(BaseModel):
    id: int
    project_id: int
    expense_date: date
    expense_category: str
    description: Optional[str] = None
    amount: float
    currency: str = "INR"
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    work_order_id: Optional[int] = None
    supervisor_id: Optional[int] = None
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    status: str
    created_by: int
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
