"""User domain models — User Management V2.

Tables:
  users                 Account + professional profile (structured columns, no giant JSON)
  user_invitations       Single-use hashed invitation tokens with lifecycle
  user_experiences       Multiple professional experience records per user
  user_education         Multiple education records per user
  user_skills            Structured skills with proficiency + years
  user_certifications    Certifications with expiry tracking
  user_licenses          Professional licenses with expiry tracking
  user_documents         Document *metadata* abstraction (storage = next phase)
  supervisor_profiles    1-1 extension for role == SUPERVISOR
  audit_logs             Reusable admin-action audit trail (no secrets)

ProjectAssignment lives in projects.models (references projects + users).
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Float, Text,
    ForeignKey, UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)

    # --- Account lifecycle (distinct from role) ---
    # INVITED | ACTIVE | SUSPENDED | DEACTIVATED
    account_status = Column(String, nullable=False, default="INVITED", index=True)
    role = Column(String, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)
    is_active = Column(Boolean, default=False)  # legacy mirror of account_status == ACTIVE

    contact = Column(String, nullable=True)

    # --- Personal information ---
    first_name = Column(String, nullable=True)
    middle_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    profile_photo = Column(String, nullable=True)  # URL/path only; upload = next phase
    gender = Column(String, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    nationality = Column(String, nullable=True)

    # --- Contact information (auth email stays `email`) ---
    secondary_email = Column(String, nullable=True)
    primary_phone = Column(String, nullable=True)
    secondary_phone = Column(String, nullable=True)
    country = Column(String, nullable=True)
    state = Column(String, nullable=True)
    city = Column(String, nullable=True)
    address_line1 = Column(String, nullable=True)
    address_line2 = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)

    # --- Emergency contact (separate from normal contact) ---
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_relationship = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)
    emergency_contact_secondary_phone = Column(String, nullable=True)
    emergency_contact_email = Column(String, nullable=True)

    # --- Employment / professional information ---
    employee_id = Column(String, unique=True, nullable=True, index=True)
    designation = Column(String, nullable=True)
    department = Column(String, nullable=True)
    employment_type = Column(String, nullable=True)  # FULL_TIME|PART_TIME|CONTRACT|CONSULTANT|TEMPORARY
    joining_date = Column(Date, nullable=True)
    reporting_manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    years_of_experience = Column(Float, nullable=True)
    professional_summary = Column(Text, nullable=True)
    current_specialization = Column(String, nullable=True)

    # --- Timestamps ---
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    invited_at = Column(DateTime, nullable=True)
    invite_accepted_at = Column(DateTime, nullable=True)
    invitation_expires_at = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    suspended_at = Column(DateTime, nullable=True)
    deactivated_at = Column(DateTime, nullable=True)

    # --- Relationships ---
    experiences = relationship("UserExperience", back_populates="user", cascade="all, delete-orphan")
    education = relationship("UserEducation", back_populates="user", cascade="all, delete-orphan")
    skills = relationship("UserSkill", back_populates="user", cascade="all, delete-orphan")
    certifications = relationship("UserCertification", back_populates="user", cascade="all, delete-orphan")
    licenses = relationship("UserLicense", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("UserDocument", back_populates="user", cascade="all, delete-orphan")
    invitations = relationship("UserInvitation", back_populates="user", cascade="all, delete-orphan",
                               foreign_keys="UserInvitation.user_id")
    supervisor_profile = relationship("SupervisorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserInvitation(Base):
    """Single-use invitation tokens. Only the SHA-256 hash is stored."""

    __tablename__ = "user_invitations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False, index=True)
    token_jti = Column(String, unique=True, nullable=False, index=True)
    # PENDING|SENT|ACCEPTED|EXPIRED|REVOKED
    status = Column(String, nullable=False, default="SENT", index=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    resend_count = Column(Integer, default=0)

    user = relationship("User", back_populates="invitations", foreign_keys=[user_id])


class PasswordReset(Base):
    """Forgot-password flow: hashed OTP first, then a single-use reset link.

    Only hashes ever touch the database — never the OTP or the token itself.
    Statuses: PENDING (otp issued) | VERIFIED (otp ok, link sent) |
    USED (password changed) | FAILED (too many wrong OTPs) | SUPERSEDED.
    """

    __tablename__ = "password_resets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    otp_hash = Column(String, nullable=False, index=True)
    otp_expires_at = Column(DateTime, nullable=False)
    otp_attempts = Column(Integer, default=0)
    token_hash = Column(String, nullable=True, unique=True, index=True)
    token_expires_at = Column(DateTime, nullable=True)
    # PENDING|VERIFIED|USED|FAILED|SUPERSEDED
    status = Column(String, nullable=False, default="PENDING", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    verified_at = Column(DateTime, nullable=True)
    used_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])


class UserExperience(Base):
    __tablename__ = "user_experiences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name = Column(String, nullable=False)
    job_title = Column(String, nullable=False)
    employment_type = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    currently_working = Column(Boolean, default=False)
    location = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    responsibilities = Column(Text, nullable=True)
    industry = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="experiences")


class UserEducation(Base):
    __tablename__ = "user_education"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    qualification = Column(String, nullable=False)
    specialization = Column(String, nullable=True)
    institution = Column(String, nullable=True)
    university = Column(String, nullable=True)
    start_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    grade = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="education")


class UserSkill(Base):
    __tablename__ = "user_skills"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    skill = Column(String, nullable=False)
    proficiency = Column(String, nullable=True)  # BEGINNER|INTERMEDIATE|ADVANCED|EXPERT
    years_of_experience = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="skills")

    __table_args__ = (UniqueConstraint("user_id", "skill", name="uq_user_skill"),)


class UserCertification(Base):
    __tablename__ = "user_certifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    certification_name = Column(String, nullable=False)
    issuing_organization = Column(String, nullable=True)
    certificate_number = Column(String, nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    status = Column(String, nullable=True)  # ACTIVE|EXPIRED|REVOKED
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="certifications")


class UserLicense(Base):
    __tablename__ = "user_licenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    license_name = Column(String, nullable=False)
    license_number = Column(String, nullable=True)
    issuing_authority = Column(String, nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    status = Column(String, nullable=True)  # ACTIVE|EXPIRED|REVOKED
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="licenses")


class UserDocument(Base):
    """Document *metadata* only. Binary storage is an explicit next phase.

    storage_status: PENDING (metadata recorded, file not yet uploaded) |
                    AVAILABLE | DELETED
    """

    __tablename__ = "user_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type = Column(String, nullable=False)  # RESUME|DEGREE|LICENSE|ID|EXPERIENCE_LETTER|SAFETY|OTHER
    file_name = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    storage_key = Column(String, nullable=True)  # opaque key for future storage backend
    storage_status = Column(String, nullable=False, default="PENDING")
    uploaded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="documents")


class SupervisorProfile(Base):
    """1-1 extension, only meaningful when user.role == SUPERVISOR."""

    __tablename__ = "supervisor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    supervisor_experience_years = Column(Float, nullable=True)
    geotechnical_experience_years = Column(Float, nullable=True)
    drilling_experience_years = Column(Float, nullable=True)
    site_experience_years = Column(Float, nullable=True)
    project_management_experience_years = Column(Float, nullable=True)
    projects_managed_count = Column(Integer, default=0)
    specializations = Column(String, nullable=True)  # comma-separated controlled values
    available_from = Column(Date, nullable=True)
    available_to = Column(Date, nullable=True)
    current_availability = Column(String, nullable=True)  # AVAILABLE|ON_PROJECT|ON_LEAVE|UNAVAILABLE
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="supervisor_profile")


class AuditLog(Base):
    """Reusable audit trail. Never store passwords or token secrets."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    target_type = Column(String, nullable=True)
    target_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    meta_info = Column(Text, nullable=True)  # JSON string (no secrets)

    __table_args__ = (Index("ix_audit_target", "target_type", "target_id"),)
