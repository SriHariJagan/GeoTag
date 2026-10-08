"""Procurement domain: RFQ → quotations → evaluation → award → work order.

Pre-award requests are RFQs (never "work orders"). A WorkOrder exists only
after an award. Vendor assignment activates only on work-order acceptance
(single writer: activate_vendor_assignment).
"""
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Text, ForeignKey,
    UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class RFQ(Base):
    __tablename__ = "rfqs"

    id = Column(Integer, primary_key=True, index=True)
    rfq_number = Column(String, unique=True, nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    scope_of_work = Column(Text, nullable=True)
    technical_requirements = Column(Text, nullable=True)
    submission_deadline = Column(DateTime, nullable=True)
    expected_start_date = Column(Date, nullable=True)
    expected_completion_date = Column(Date, nullable=True)
    currency = Column(String, default="INR")
    commercial_terms = Column(Text, nullable=True)
    technical_terms = Column(Text, nullable=True)
    # DRAFT|SENT|EVALUATING|AWARDED|CLOSED|CANCELLED
    status = Column(String, nullable=False, default="DRAFT", index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("RFQItem", back_populates="rfq", cascade="all, delete-orphan")
    vendors = relationship("RFQVendor", back_populates="rfq", cascade="all, delete-orphan")
    quotations = relationship("Quotation", cascade="all, delete-orphan",
                              foreign_keys="Quotation.rfq_id")
    award = relationship("Award", uselist=False, cascade="all, delete-orphan",
                         foreign_keys="Award.rfq_id")


class RFQItem(Base):
    """BOQ/scope line. Quotation items snapshot description/unit at quote time."""

    __tablename__ = "rfq_items"

    id = Column(Integer, primary_key=True, index=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id", ondelete="CASCADE"),
                    nullable=False, index=True)
    description = Column(String, nullable=False)
    category = Column(String, nullable=True)
    quantity = Column(Float, nullable=True)
    unit = Column(String, nullable=True)
    technical_specification = Column(Text, nullable=True)
    estimated_rate = Column(Float, nullable=True)

    rfq = relationship("RFQ", back_populates="items")


class RFQVendor(Base):
    """Per-vendor invitation state for an RFQ."""

    __tablename__ = "rfq_vendors"

    id = Column(Integer, primary_key=True, index=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id", ondelete="CASCADE"),
                    nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    # SENT|VIEWED|DECLINED|QUOTATION_SUBMITTED|EXPIRED
    status = Column(String, nullable=False, default="SENT", index=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
    viewed_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)

    rfq = relationship("RFQ", back_populates="vendors")

    __table_args__ = (UniqueConstraint("rfq_id", "vendor_id", name="uq_rfq_vendor"),)


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    quotation_number = Column(String, unique=True, nullable=False, index=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id", ondelete="CASCADE"),
                    nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    valid_until = Column(Date, nullable=True)
    currency = Column(String, default="INR")
    subtotal = Column(Float, default=0.0)
    tax = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)  # server-computed
    mobilization_cost = Column(Float, default=0.0)
    delivery_cost = Column(Float, default=0.0)
    payment_terms = Column(Text, nullable=True)
    lead_time_days = Column(Integer, nullable=True)
    assumptions = Column(Text, nullable=True)
    exclusions = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    # DRAFT|SUBMITTED|SUPERSEDED|EVALUATED|AWARDED|REJECTED
    status = Column(String, nullable=False, default="DRAFT", index=True)
    supersedes_id = Column(Integer, ForeignKey("quotations.id"), nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("QuotationItem", back_populates="quotation",
                         cascade="all, delete-orphan", foreign_keys="QuotationItem.quotation_id")
    documents = relationship("QuotationDocument", back_populates="quotation",
                             cascade="all, delete-orphan")
    evaluation = relationship("Evaluation", uselist=False,
                              cascade="all, delete-orphan")


class QuotationItem(Base):
    __tablename__ = "quotation_items"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    rfq_item_id = Column(Integer, ForeignKey("rfq_items.id"), nullable=True)
    description = Column(String, nullable=False)  # snapshot copy
    unit = Column(String, nullable=True)  # snapshot copy
    quantity = Column(Float, nullable=False, default=1)
    unit_rate = Column(Float, nullable=False, default=0)
    tax = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    line_total = Column(Float, default=0.0)  # server-computed
    remarks = Column(Text, nullable=True)

    quotation = relationship("Quotation", back_populates="items",
                             foreign_keys=[quotation_id])


class QuotationDocument(Base):
    """Private attachments (technical/commercial proposals, certificates)."""

    __tablename__ = "quotation_documents"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    document_type = Column(String, nullable=False)  # TECHNICAL|COMMERCIAL|PROFILE|CERTIFICATE|OTHER
    file_name = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    storage_key = Column(String, nullable=True)
    storage_status = Column(String, nullable=False, default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow)

    quotation = relationship("Quotation", back_populates="documents")


class Evaluation(Base):
    """One current evaluation per quotation (history via audit). Admin-only."""

    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id", ondelete="CASCADE"),
                          nullable=False, unique=True, index=True)
    technical_score = Column(Float, nullable=True)
    commercial_score = Column(Float, nullable=True)
    experience_score = Column(Float, nullable=True)
    capacity_score = Column(Float, nullable=True)
    compliance_score = Column(Float, nullable=True)
    overall_score = Column(Float, nullable=True)  # server-computed mean of provided
    evaluation_notes = Column(Text, nullable=True)  # internal, never vendor-visible
    is_internal = Column(String, nullable=False, default="YES")
    evaluated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    evaluated_at = Column(DateTime, default=datetime.utcnow)


class Award(Base):
    """Admin award decision — one per RFQ, fully auditable."""

    __tablename__ = "awards"

    id = Column(Integer, primary_key=True, index=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id", ondelete="CASCADE"),
                    nullable=False, unique=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    selected_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    selected_at = Column(DateTime, default=datetime.utcnow)
    award_reason = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)  # never vendor-visible
    lowest_compliant = Column(String, nullable=True)  # YES|NO|UNKNOWN


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id = Column(Integer, primary_key=True, index=True)
    # Number is unique per version (a corrected Version 2 keeps the same number).
    work_order_number = Column(String, nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("work_orders.id"), nullable=True, index=True)
    work_order_date = Column(Date, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"),
                       nullable=True, index=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id"), nullable=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=True)
    # --- WO wizard header (snapshots; project master stays canonical) ---
    project_name = Column(String, nullable=True)
    client_name = Column(String, nullable=True)
    site = Column(String, nullable=True)
    location = Column(String, nullable=True)
    work_type = Column(String, nullable=True)
    scope_of_work = Column(Text, nullable=True)
    # --- BOQ totals (all server-computed; frontend totals ignored) ---
    subtotal = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    other_charges = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    contract_value = Column(Float, default=0.0)  # frozen at issue (= grand_total)
    currency = Column(String, default="INR")
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    # --- Commercial terms ---
    payment_terms = Column(Text, nullable=True)
    validity_days = Column(Integer, nullable=True)
    completion_period = Column(String, nullable=True)
    retention_percent = Column(Float, nullable=True)
    tax_terms = Column(Text, nullable=True)
    delivery_terms = Column(Text, nullable=True)
    special_conditions = Column(Text, nullable=True)
    # --- Terms & conditions (reusable standard + custom) ---
    standard_terms = Column(Text, nullable=True)
    custom_terms = Column(Text, nullable=True)
    # --- Corporate document fields (structured; never a giant HTML blob) ---
    subject = Column(Text, nullable=True)
    reference = Column(String, nullable=True)
    intro_text = Column(Text, nullable=True)
    acceptance_text = Column(Text, nullable=True)
    payment_terms_json = Column(Text, nullable=True)  # JSON array of strings
    general_terms_json = Column(Text, nullable=True)  # JSON array of strings
    # Document-specific overrides (master vendor/project rows never mutated)
    vendor_override_json = Column(Text, nullable=True)  # JSON object
    # Team chosen inside the work order (auto-reflected to the project on
    # acceptance; project may be created with an empty team).
    team_supervisors_json = Column(Text, nullable=True)  # JSON array of user ids
    # JSON array of {machine_id, rate_per_day}; rate defaults to machine master.
    team_machines_json = Column(Text, nullable=True)
    # Signatory blocks
    signer_name = Column(String, nullable=True)
    signer_designation = Column(String, nullable=True)
    vendor_signer_name = Column(String, nullable=True)
    vendor_signer_designation = Column(String, nullable=True)
    # Finalization snapshots (historical accuracy after master edits)
    vendor_snapshot = Column(Text, nullable=True)  # JSON
    project_snapshot = Column(Text, nullable=True)  # JSON
    company_snapshot = Column(Text, nullable=True)  # JSON
    # Lifecycle: DRAFT|IN_REVIEW|PDF_GENERATED|SIGNED|STAMPED|FINALIZED|
    #            ISSUED|VIEWED|ACCEPTED|REJECTED|CANCELLED|IN_PROGRESS|COMPLETED|CLOSED
    status = Column(String, nullable=False, default="DRAFT", index=True)
    issued_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    issued_at = Column(DateTime, nullable=True)
    viewed_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    accepted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    rejected_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    accept_ip = Column(String, nullable=True)
    reject_ip = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    # --- Admin sign/stamp/finalize (immutability gate) ---
    version = Column(Integer, nullable=False, default=1)
    is_locked = Column(Integer, nullable=False, default=0)  # 1 once FINALIZED
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    pdf_generated_at = Column(DateTime, nullable=True)
    pdf_path = Column(String, nullable=True)
    pdf_version = Column(Integer, nullable=False, default=0)
    signed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    signed_at = Column(DateTime, nullable=True)
    signature_data = Column(Text, nullable=True)  # signer name / base64 stamp text
    stamped_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    stamped_at = Column(DateTime, nullable=True)
    stamp_data = Column(Text, nullable=True)
    finalized_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    finalized_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("WorkOrderItem", back_populates="work_order",
                         cascade="all, delete-orphan")
    vendor_invites = relationship("WorkOrderVendor", back_populates="work_order",
                                  cascade="all, delete-orphan")
    versions = relationship("WorkOrderVersion", back_populates="work_order",
                            cascade="all, delete-orphan")
    documents = relationship("WorkOrderDocument", back_populates="work_order",
                             cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("work_order_number", "version", name="uq_wo_number_version"),
    )


class WorkOrderItem(Base):
    __tablename__ = "work_order_items"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    item_number = Column(String, nullable=True)
    description = Column(String, nullable=False)
    sub_description = Column(Text, nullable=True)  # "Additional note" under the line
    quantity = Column(Float, nullable=True)
    unit = Column(String, nullable=True)
    unit_rate = Column(Float, nullable=True)
    line_total = Column(Float, nullable=True)  # server-computed qty*rate

    work_order = relationship("WorkOrder", back_populates="items")


class WorkOrderVendor(Base):
    """Per-vendor send/accept track for direct work orders (multi-vendor)."""

    __tablename__ = "work_order_vendors"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    # SENT|VIEWED|ACCEPTED|REJECTED|EXPIRED
    status = Column(String, nullable=False, default="SENT", index=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
    sent_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    viewed_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    accepted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    rejected_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    accept_ip = Column(String, nullable=True)
    reject_ip = Column(String, nullable=True)

    work_order = relationship("WorkOrder", back_populates="vendor_invites")

    __table_args__ = (
        UniqueConstraint("work_order_id", "vendor_id", name="uq_wo_vendor"),
    )


class WorkOrderVersion(Base):
    """Immutable snapshot per sign/finalize (never silently modify signed WO)."""

    __tablename__ = "work_order_versions"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    version = Column(Integer, nullable=False)
    snapshot = Column(Text, nullable=True)  # JSON of header+items+totals+terms
    pdf_path = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    work_order = relationship("WorkOrder", back_populates="versions")


class WorkOrderDocument(Base):
    """Official document files for a WO version.

    Files live on disk (storage/work_order_docs/); the DB holds metadata +
    SHA-256 so integrity stays verifiable. Binaries never go into text fields.
    """

    __tablename__ = "work_order_documents"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    # GENERATED | SIGNED | STAMPED | FINAL
    document_type = Column(String, nullable=False, index=True)
    file_name = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    storage_path = Column(String, nullable=True)
    sha256 = Column(String, nullable=True, index=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    is_final = Column(Integer, nullable=False, default=0)
    is_signed = Column(Integer, nullable=False, default=0)

    work_order = relationship("WorkOrder", back_populates="documents")


class StandardTerm(Base):
    """Reusable standard terms & conditions library."""

    __tablename__ = "standard_terms"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String, nullable=True)  # COMMERCIAL|TECHNICAL|LEGAL|GENERAL
    is_active = Column(Integer, nullable=False, default=1)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProjectVendorAssignment(Base):
    """Active only after work-order acceptance. History rows never deleted."""

    __tablename__ = "project_vendor_assignments"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    # ACTIVE|COMPLETED|CANCELLED|REMOVED
    status = Column(String, nullable=False, default="ACTIVE", index=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    removed_at = Column(DateTime, nullable=True)
    removed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    removal_reason = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    scope = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_pva_active_wo", "work_order_id", "status"),
    )
