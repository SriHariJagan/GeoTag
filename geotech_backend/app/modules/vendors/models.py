"""Vendor domain — V3 professional model.

`Vendor` is extended in place (legacy columns preserved; dev DB is empty but the
migration still backfills). Child entities are normalized — no giant text blobs.
Documents are metadata-only (storage_key is S3-ready for a later phase).
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, Float, DateTime, Date, Text,
    ForeignKey, UniqueConstraint, Index,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)

    # --- legacy columns (preserved; vendor_company backfilled to legal name) ---
    vendor_company = Column(String, nullable=True)
    contact_person = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    vendor_code = Column(String, nullable=True, index=True)

    is_active = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # --- V3 business identity ---
    legal_business_name = Column(String, nullable=True, index=True)
    trading_name = Column(String, nullable=True)
    business_type = Column(String, nullable=True)  # PVT_LTD | PARTNERSHIP | PROPRIETORSHIP | LLP | OTHER
    registration_number = Column(String, nullable=True)
    tax_identifier = Column(String, nullable=True)
    year_established = Column(Integer, nullable=True)
    # PROSPECT | ACTIVE | SUSPENDED | BLACKLISTED
    status = Column(String, nullable=False, default="ACTIVE", index=True)

    # --- primary contact (extends legacy contact_person/phone/email) ---
    contact_designation = Column(String, nullable=True)
    alternate_phone = Column(String, nullable=True)

    # --- address (extends legacy address) ---
    registered_address = Column(Text, nullable=True)
    operational_address = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)

    # --- capabilities (comma-separated controlled values; see SERVICE_CATEGORIES) ---
    service_categories = Column(Text, nullable=True)
    specializations = Column(Text, nullable=True)
    technical_capabilities = Column(Text, nullable=True)
    operating_regions = Column(Text, nullable=True)
    maximum_project_capacity = Column(Float, nullable=True)
    manpower_capacity = Column(Integer, nullable=True)
    equipment_capacity = Column(Integer, nullable=True)

    # --- experience summary (detail in child tables) ---
    years_of_experience = Column(Float, nullable=True)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    status_changed_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # 🔥 Many-to-Many relationship (legacy project links)
    projects = relationship(
        "ProjectVendor",
        back_populates="vendor",
        cascade="all, delete-orphan"
    )
    contacts = relationship("VendorContact", back_populates="vendor", cascade="all, delete-orphan")
    experiences = relationship("VendorExperience", back_populates="vendor", cascade="all, delete-orphan")
    references = relationship("VendorReference", back_populates="vendor", cascade="all, delete-orphan")
    capabilities = relationship("VendorCapability", back_populates="vendor", cascade="all, delete-orphan")
    equipment = relationship("VendorEquipment", back_populates="vendor", cascade="all, delete-orphan")
    certifications = relationship("VendorCertification", back_populates="vendor", cascade="all, delete-orphan")
    licenses = relationship("VendorLicense", back_populates="vendor", cascade="all, delete-orphan")
    documents = relationship("VendorDocument", back_populates="vendor", cascade="all, delete-orphan")
    vendor_users = relationship("VendorUser", back_populates="vendor", cascade="all, delete-orphan")


class VendorContact(Base):
    __tablename__ = "vendor_contacts"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    designation = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    alternate_phone = Column(String, nullable=True)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="contacts")


class VendorExperience(Base):
    __tablename__ = "vendor_experiences"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    project_name = Column(String, nullable=False)
    project_type = Column(String, nullable=True)
    client_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    contract_value = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="experiences")


class VendorReference(Base):
    __tablename__ = "vendor_references"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    client_name = Column(String, nullable=False)
    contact_person = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    relation = Column("relationship", String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="references")


class VendorCapability(Base):
    __tablename__ = "vendor_capabilities"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String, nullable=False)  # SERVICE_CATEGORIES value
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="capabilities")


class VendorEquipment(Base):
    __tablename__ = "vendor_equipment"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_type = Column(String, nullable=False)
    equipment_name = Column(String, nullable=False)
    quantity = Column(Integer, default=1)
    capacity = Column(String, nullable=True)
    condition = Column(String, nullable=True)  # NEW | GOOD | FAIR | NEEDS_REPAIR
    ownership_type = Column(String, nullable=True)  # OWNED | LEASED | RENTED
    availability_status = Column(String, nullable=True)  # AVAILABLE | DEPLOYED | MAINTENANCE
    # Optional link to a global machinery record (no duplication when shared)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="equipment")


class VendorCertification(Base):
    __tablename__ = "vendor_certifications"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    certification_name = Column(String, nullable=False)
    issuing_organization = Column(String, nullable=True)
    certificate_number = Column(String, nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    status = Column(String, nullable=True)  # ACTIVE | EXPIRED | REVOKED
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="certifications")


class VendorLicense(Base):
    __tablename__ = "vendor_licenses"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    license_name = Column(String, nullable=False)
    license_number = Column(String, nullable=True)
    issuing_authority = Column(String, nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="licenses")


class VendorDocument(Base):
    """Document metadata only (storage_key is S3/object-storage ready)."""

    __tablename__ = "vendor_documents"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type = Column(String, nullable=False)  # REGISTRATION | TAX | CERTIFICATE | INSURANCE | PROFILE | OTHER
    file_name = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    storage_key = Column(String, nullable=True)
    storage_status = Column(String, nullable=False, default="PENDING")
    uploaded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="documents")


class VendorUser(Base):
    """Links a User (usually role=VENDOR) to a vendor organization."""

    __tablename__ = "vendor_users"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_role = Column(String, nullable=False, default="STAFF")  # OWNER | CONTACT | STAFF
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="vendor_users")

    __table_args__ = (
        UniqueConstraint("vendor_id", "user_id", name="uq_vendor_user"),
        Index("ix_vendor_user_user", "user_id"),
    )
