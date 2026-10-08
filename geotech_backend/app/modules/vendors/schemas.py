"""Vendor schemas — V3. Legacy fields kept; new fields optional/validated."""
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator, model_validator
from typing import Optional, List
from datetime import datetime, date

from app.core.rbac import VALID_VENDOR_STATUSES, SERVICE_CATEGORIES, CERT_STATUSES


def _csv_known(v: Optional[str], allowed: set, field: str) -> Optional[str]:
    if not v:
        return v
    parts = [p.strip().upper() for p in v.split(",") if p.strip()]
    bad = [p for p in parts if p not in allowed]
    if bad:
        raise ValueError(f"Unknown {field}: {bad}. Allowed: {sorted(allowed)}")
    return ",".join(parts)


class VendorBase(BaseModel):
    vendor_company: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    rating: Optional[float] = None
    vendor_code: Optional[str] = None
    is_active: bool = False

    # V3 identity
    legal_business_name: Optional[str] = None
    trading_name: Optional[str] = None
    business_type: Optional[str] = None
    registration_number: Optional[str] = None
    tax_identifier: Optional[str] = None
    year_established: Optional[int] = None
    status: str = "ACTIVE"

    contact_designation: Optional[str] = None
    alternate_phone: Optional[str] = None

    registered_address: Optional[str] = None
    operational_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None

    service_categories: Optional[str] = None
    specializations: Optional[str] = None
    technical_capabilities: Optional[str] = None
    operating_regions: Optional[str] = None
    maximum_project_capacity: Optional[float] = None
    manpower_capacity: Optional[int] = None
    equipment_capacity: Optional[int] = None
    years_of_experience: Optional[float] = None

    @field_validator("status")
    @classmethod
    def status_known(cls, v):
        if v not in VALID_VENDOR_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_VENDOR_STATUSES)}")
        return v

    @field_validator("service_categories")
    @classmethod
    def cats_known(cls, v):
        return _csv_known(v, SERVICE_CATEGORIES, "service_categories")

    @field_validator("years_of_experience", "maximum_project_capacity")
    @classmethod
    def non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("value cannot be negative")
        return v

    @field_validator("year_established")
    @classmethod
    def year_sane(cls, v):
        if v is not None and (v < 1800 or v > date.today().year):
            raise ValueError("year_established is not plausible")
        return v


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    vendor_company: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    rating: Optional[float] = None
    vendor_code: Optional[str] = None
    is_active: Optional[bool] = None
    legal_business_name: Optional[str] = None
    trading_name: Optional[str] = None
    business_type: Optional[str] = None
    registration_number: Optional[str] = None
    tax_identifier: Optional[str] = None
    year_established: Optional[int] = None
    status: Optional[str] = None
    contact_designation: Optional[str] = None
    alternate_phone: Optional[str] = None
    registered_address: Optional[str] = None
    operational_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    service_categories: Optional[str] = None
    specializations: Optional[str] = None
    technical_capabilities: Optional[str] = None
    operating_regions: Optional[str] = None
    maximum_project_capacity: Optional[float] = None
    manpower_capacity: Optional[int] = None
    equipment_capacity: Optional[int] = None
    years_of_experience: Optional[float] = None

    @field_validator("status")
    @classmethod
    def status_known(cls, v):
        if v is not None and v not in VALID_VENDOR_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_VENDOR_STATUSES)}")
        return v


class VendorStatusChange(BaseModel):
    status: str
    reason: Optional[str] = None

    @field_validator("status")
    @classmethod
    def status_known(cls, v):
        if v not in VALID_VENDOR_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_VENDOR_STATUSES)}")
        return v


class VendorResponse(VendorBase):
    id: int
    created_at: datetime
    project_names: List[str] = []
    compliance_overdue: bool = False

    model_config = ConfigDict(from_attributes=True)


# ---------- child entities ----------

class VendorContactCreate(BaseModel):
    name: str
    designation: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    is_primary: bool = False


class VendorContactResponse(VendorContactCreate):
    id: int
    vendor_id: int
    model_config = ConfigDict(from_attributes=True)


class VendorExperienceCreate(BaseModel):
    project_name: str
    project_type: Optional[str] = None
    client_name: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    contract_value: Optional[float] = None
    description: Optional[str] = None


class VendorExperienceResponse(VendorExperienceCreate):
    id: int
    vendor_id: int
    model_config = ConfigDict(from_attributes=True)


class VendorReferenceCreate(BaseModel):
    client_name: str
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    relation: Optional[str] = None


class VendorReferenceResponse(VendorReferenceCreate):
    id: int
    vendor_id: int
    model_config = ConfigDict(from_attributes=True)


class VendorCapabilityCreate(BaseModel):
    category: str
    description: Optional[str] = None

    @field_validator("category")
    @classmethod
    def cat_known(cls, v):
        v = v.strip().upper()
        if v not in SERVICE_CATEGORIES:
            raise ValueError(f"category must be one of {sorted(SERVICE_CATEGORIES)}")
        return v


class VendorCapabilityResponse(VendorCapabilityCreate):
    id: int
    vendor_id: int
    model_config = ConfigDict(from_attributes=True)


class VendorEquipmentCreate(BaseModel):
    equipment_type: str
    equipment_name: str
    quantity: int = 1
    capacity: Optional[str] = None
    condition: Optional[str] = None
    ownership_type: Optional[str] = None
    availability_status: Optional[str] = None
    machine_id: Optional[int] = None

    @field_validator("quantity")
    @classmethod
    def qty_positive(cls, v):
        if v < 1:
            raise ValueError("quantity must be >= 1")
        return v


class VendorEquipmentResponse(VendorEquipmentCreate):
    id: int
    vendor_id: int
    model_config = ConfigDict(from_attributes=True)


class VendorCertificationCreate(BaseModel):
    certification_name: str
    issuing_organization: Optional[str] = None
    certificate_number: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    status: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode="after")
    def dates_sane(self):
        if self.issue_date and self.expiry_date and self.expiry_date < self.issue_date:
            raise ValueError("expiry_date cannot be before issue_date")
        if self.status is not None and self.status not in CERT_STATUSES:
            raise ValueError(f"status must be one of {sorted(CERT_STATUSES)}")
        return self


class VendorCertificationResponse(VendorCertificationCreate):
    id: int
    vendor_id: int
    is_expired: bool = False
    model_config = ConfigDict(from_attributes=True)


class VendorLicenseCreate(BaseModel):
    license_name: str
    license_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    status: Optional[str] = None

    @model_validator(mode="after")
    def dates_sane(self):
        if self.issue_date and self.expiry_date and self.expiry_date < self.issue_date:
            raise ValueError("expiry_date cannot be before issue_date")
        if self.status is not None and self.status not in CERT_STATUSES:
            raise ValueError(f"status must be one of {sorted(CERT_STATUSES)}")
        return self


class VendorLicenseResponse(VendorLicenseCreate):
    id: int
    vendor_id: int
    is_expired: bool = False
    model_config = ConfigDict(from_attributes=True)


class VendorDocumentCreate(BaseModel):
    document_type: str
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None


class VendorDocumentResponse(VendorDocumentCreate):
    id: int
    vendor_id: int
    storage_status: str = "PENDING"
    storage_key: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class VendorUserLink(BaseModel):
    user_id: int
    org_role: str = "STAFF"
    is_primary: bool = False

    @field_validator("org_role")
    @classmethod
    def role_known(cls, v):
        v = v.strip().upper()
        if v not in {"OWNER", "CONTACT", "STAFF"}:
            raise ValueError("org_role must be OWNER, CONTACT or STAFF")
        return v


class VendorUserResponse(VendorUserLink):
    id: int
    vendor_id: int
    model_config = ConfigDict(from_attributes=True)
