"""Pydantic schemas — User Management V2. Frontend + backend validation agree."""
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator, model_validator
from datetime import datetime, date
from typing import Optional

from app.core.rbac import (
    VALID_ROLES, VALID_ACCOUNT_STATUSES, EMPLOYMENT_TYPES, PROFICIENCIES,
    CERT_STATUSES, SUPERVISOR_SPECIALIZATIONS,
)

PHONE_RE = __import__("re").compile(r"^[+\d][\d\s\-().]{5,25}$")


def _validate_phone(v: Optional[str], field: str) -> Optional[str]:
    if v is None or v == "":
        return v
    if not PHONE_RE.match(v.strip()):
        raise ValueError(f"{field} has an invalid phone format")
    return v.strip()


# ---------- Shared mixins ----------

class PersonalInfo(BaseModel):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None

    @field_validator("date_of_birth")
    @classmethod
    def dob_not_future(cls, v):
        if v and v > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return v


class ContactInfo(BaseModel):
    secondary_email: Optional[EmailStr] = None
    primary_phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None

    @field_validator("primary_phone", "secondary_phone")
    @classmethod
    def phone_fmt(cls, v, info):
        return _validate_phone(v, info.field_name)


class EmergencyContact(BaseModel):
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_secondary_phone: Optional[str] = None
    emergency_contact_email: Optional[EmailStr] = None

    @field_validator("emergency_contact_phone", "emergency_contact_secondary_phone")
    @classmethod
    def ephone_fmt(cls, v, info):
        return _validate_phone(v, info.field_name)


class EmploymentInfo(BaseModel):
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    joining_date: Optional[date] = None
    reporting_manager_id: Optional[int] = None
    years_of_experience: Optional[float] = None
    professional_summary: Optional[str] = None
    current_specialization: Optional[str] = None

    @field_validator("employment_type")
    @classmethod
    def employment_known(cls, v):
        if v is not None and v not in EMPLOYMENT_TYPES:
            raise ValueError(f"employment_type must be one of {sorted(EMPLOYMENT_TYPES)}")
        return v

    @field_validator("years_of_experience")
    @classmethod
    def exp_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("years_of_experience cannot be negative")
        return v


# ---------- User CRUD ----------

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    contact: Optional[str] = None

    @field_validator("role")
    @classmethod
    def role_known(cls, v):
        from app.core.rbac import normalize_role
        if normalize_role(v) not in VALID_ROLES:
            raise ValueError(f"role must be one of {sorted(VALID_ROLES)}")
        return normalize_role(v)

    @field_validator("contact")
    @classmethod
    def contact_fmt(cls, v):
        return _validate_phone(v, "contact")


class UserCreate(UserBase, PersonalInfo, ContactInfo, EmergencyContact, EmploymentInfo):
    password: Optional[str] = None
    profile_photo: Optional[str] = None


class UserUpdate(BaseModel):
    """Allowlist for mass-assignment protection. No password/email here."""

    full_name: Optional[str] = None
    contact: Optional[str] = None
    role: Optional[str] = None
    account_status: Optional[str] = None
    is_active: Optional[bool] = None  # legacy compat; mapped to account_status

    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None
    secondary_email: Optional[EmailStr] = None
    primary_phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_secondary_phone: Optional[str] = None
    emergency_contact_email: Optional[EmailStr] = None
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    joining_date: Optional[date] = None
    reporting_manager_id: Optional[int] = None
    years_of_experience: Optional[float] = None
    professional_summary: Optional[str] = None
    current_specialization: Optional[str] = None
    profile_photo: Optional[str] = None

    @field_validator("role")
    @classmethod
    def role_known(cls, v):
        if v is None:
            return v
        from app.core.rbac import normalize_role
        if normalize_role(v) not in VALID_ROLES:
            raise ValueError(f"role must be one of {sorted(VALID_ROLES)}")
        return normalize_role(v)

    @field_validator("account_status")
    @classmethod
    def status_known(cls, v):
        if v is None:
            return v
        if v not in VALID_ACCOUNT_STATUSES:
            raise ValueError(f"account_status must be one of {sorted(VALID_ACCOUNT_STATUSES)}")
        return v

    @field_validator("contact", "primary_phone", "secondary_phone",
                     "emergency_contact_phone", "emergency_contact_secondary_phone")
    @classmethod
    def phone_fmt(cls, v, info):
        return _validate_phone(v, info.field_name)

    @field_validator("employment_type")
    @classmethod
    def employment_known(cls, v):
        if v is not None and v not in EMPLOYMENT_TYPES:
            raise ValueError(f"employment_type must be one of {sorted(EMPLOYMENT_TYPES)}")
        return v

    @field_validator("years_of_experience")
    @classmethod
    def exp_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("years_of_experience cannot be negative")
        return v


class InvitationInfo(BaseModel):
    invitation_status: Optional[str] = None
    invitation_sent_at: Optional[datetime] = None
    invitation_expires_at: Optional[datetime] = None
    invitation_accepted_at: Optional[datetime] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    account_status: str
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserAdminView(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str
    is_active: bool
    account_status: str = "INVITED"
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    years_of_experience: Optional[float] = None
    contact: Optional[str] = None
    primary_phone: Optional[str] = None
    invited_at: Optional[datetime] = None
    invite_accepted_at: Optional[datetime] = None
    invitation_expires_at: Optional[datetime] = None
    invitation_status: Optional[str] = None
    supervisor_eligible: bool = False
    eligibility_reason: Optional[str] = None
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserDetailView(UserAdminView):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    profile_photo: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    nationality: Optional[str] = None
    secondary_email: Optional[EmailStr] = None
    secondary_phone: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_secondary_phone: Optional[str] = None
    emergency_contact_email: Optional[EmailStr] = None
    employment_type: Optional[str] = None
    joining_date: Optional[date] = None
    reporting_manager_id: Optional[int] = None
    professional_summary: Optional[str] = None
    current_specialization: Optional[str] = None
    suspended_at: Optional[datetime] = None
    deactivated_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------- Auth ----------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class InviteUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str

    @field_validator("role")
    @classmethod
    def role_known(cls, v):
        from app.core.rbac import normalize_role
        if normalize_role(v) not in VALID_ROLES:
            raise ValueError(f"role must be one of {sorted(VALID_ROLES)}")
        return normalize_role(v)


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=4, max_length=12)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    password: str


class RoleChangeRequest(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def role_known(cls, v):
        from app.core.rbac import normalize_role
        if normalize_role(v) not in VALID_ROLES:
            raise ValueError(f"role must be one of {sorted(VALID_ROLES)}")
        return normalize_role(v)


class StatusChangeRequest(BaseModel):
    account_status: str
    reason: Optional[str] = None

    @field_validator("account_status")
    @classmethod
    def status_known(cls, v):
        if v not in VALID_ACCOUNT_STATUSES:
            raise ValueError(f"account_status must be one of {sorted(VALID_ACCOUNT_STATUSES)}")
        return v


# ---------- Sub-resources ----------

class ExperienceCreate(BaseModel):
    company_name: str
    job_title: str
    employment_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    currently_working: bool = False
    location: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    industry: Optional[str] = None


class ExperienceUpdate(ExperienceCreate):
    company_name: Optional[str] = None
    job_title: Optional[str] = None


class ExperienceResponse(ExperienceCreate):
    id: int
    user_id: int
    model_config = ConfigDict(from_attributes=True)


class EducationCreate(BaseModel):
    qualification: str
    specialization: Optional[str] = None
    institution: Optional[str] = None
    university: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    grade: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode="after")
    def years_sane(self):
        if self.start_year and self.end_year and self.end_year < self.start_year:
            raise ValueError("end_year cannot be before start_year")
        return self


class EducationUpdate(EducationCreate):
    qualification: Optional[str] = None


class EducationResponse(EducationCreate):
    id: int
    user_id: int
    model_config = ConfigDict(from_attributes=True)


class SkillCreate(BaseModel):
    skill: str
    proficiency: Optional[str] = None
    years_of_experience: Optional[float] = None

    @field_validator("proficiency")
    @classmethod
    def prof_known(cls, v):
        if v is not None and v not in PROFICIENCIES:
            raise ValueError(f"proficiency must be one of {sorted(PROFICIENCIES)}")
        return v

    @field_validator("years_of_experience")
    @classmethod
    def exp_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("years_of_experience cannot be negative")
        return v


class SkillUpdate(BaseModel):
    skill: Optional[str] = None
    proficiency: Optional[str] = None
    years_of_experience: Optional[float] = None


class SkillResponse(SkillCreate):
    id: int
    user_id: int
    model_config = ConfigDict(from_attributes=True)


class CertificationCreate(BaseModel):
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


class CertificationUpdate(CertificationCreate):
    certification_name: Optional[str] = None


class CertificationResponse(CertificationCreate):
    id: int
    user_id: int
    is_expired: bool = False
    model_config = ConfigDict(from_attributes=True)


class LicenseCreate(BaseModel):
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


class LicenseUpdate(LicenseCreate):
    license_name: Optional[str] = None


class LicenseResponse(LicenseCreate):
    id: int
    user_id: int
    is_expired: bool = False
    model_config = ConfigDict(from_attributes=True)


class DocumentCreate(BaseModel):
    document_type: str
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None


class DocumentResponse(DocumentCreate):
    id: int
    user_id: int
    storage_status: str = "PENDING"
    storage_key: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SupervisorProfileUpsert(BaseModel):
    supervisor_experience_years: Optional[float] = None
    geotechnical_experience_years: Optional[float] = None
    drilling_experience_years: Optional[float] = None
    site_experience_years: Optional[float] = None
    project_management_experience_years: Optional[float] = None
    projects_managed_count: Optional[int] = None
    specializations: Optional[str] = None
    available_from: Optional[date] = None
    available_to: Optional[date] = None
    current_availability: Optional[str] = None

    @field_validator(
        "supervisor_experience_years", "geotechnical_experience_years",
        "drilling_experience_years", "site_experience_years",
        "project_management_experience_years",
    )
    @classmethod
    def non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("experience years cannot be negative")
        return v

    @field_validator("specializations")
    @classmethod
    def specs_known(cls, v):
        if not v:
            return v
        parts = [p.strip().upper() for p in v.split(",") if p.strip()]
        bad = [p for p in parts if p not in SUPERVISOR_SPECIALIZATIONS]
        if bad:
            raise ValueError(f"Unknown specializations: {bad}. Allowed: {sorted(SUPERVISOR_SPECIALIZATIONS)}")
        return ",".join(parts)


class SupervisorProfileResponse(SupervisorProfileUpsert):
    user_id: int
    model_config = ConfigDict(from_attributes=True)


class EligibilityResponse(BaseModel):
    eligible: bool
    reason: Optional[str] = None
    account_status: str
    role: str


class AssignmentCreate(BaseModel):
    project_id: int
    user_id: int
    assignment_role: str = "SUPERVISOR"
    is_primary: bool = False
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def dates_sane(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class AssignmentResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    assignment_role: str
    status: str
    is_primary: bool = False
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    assigned_by: Optional[int] = None
    assigned_at: Optional[datetime] = None
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AuditLogResponse(BaseModel):
    id: int
    actor_id: Optional[int] = None
    action: str
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    timestamp: datetime
    meta_info: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AuditLogEntry(AuditLogResponse):
    """Audit row enriched with the actor's identity for log consoles."""
    actor_email: Optional[str] = None
    actor_name: Optional[str] = None
