"""Company settings schemas."""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    tagline: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    other_registrations: Optional[str] = None
    wo_number_prefix: Optional[str] = None
    wo_number_format: Optional[str] = None
    footer_head_office: Optional[str] = None
    footer_regional_office: Optional[str] = None


class CompanySettingsResponse(CompanySettingsUpdate):
    id: int
    logo_path: Optional[str] = None
    logo_url: Optional[str] = None
    updated_by: Optional[int] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
