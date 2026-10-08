from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class DailyExecutionReport(Base):
    __tablename__ = "daily_execution_reports"

    id = Column(Integer, primary_key=True)

    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)

    # ✅ NEW FIELDS
    borehole_started = Column(String, nullable=False)
    borehole_ended = Column(String, nullable=False)

    site_location = Column(String, nullable=False)
    borehole_no = Column(String, nullable=False)
    rig_no = Column(String, nullable=False)
    type_of_rig = Column(String, nullable=False)
    chainage = Column(String, nullable=False)

    depth_started = Column(Float, default=0)
    hours_worked = Column(Float, default=0)
    manpower_count = Column(Integer, default=0)

    soil_depth = Column(Float, default=0)
    soft_rock_depth = Column(Float, default=0)
    hard_rock_depth = Column(Float, default=0)
    total_depth = Column(Float, default=0)

    client = Column(String, nullable=False)
    client_person_name = Column(String, nullable=False)
    client_person_designation = Column(String, nullable=False)

    weather_condition = Column(String, nullable=True)
    delay_reason = Column(Text, nullable=True)
    work_status = Column(String, default="working")
    remarks = Column(Text)
    report_date = Column(Date, nullable=False)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    # V3 lifecycle: DRAFT | SUBMITTED (default SUBMITTED preserves legacy behavior)
    status = Column(String, nullable=False, default="SUBMITTED")
    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships (single project link — K-05 duplicate removed)
    project = relationship("Project", back_populates="daily_execution_reports")
    creator = relationship("User")
    vendor = relationship("Vendor")
    machine = relationship("Machine")

    manpower = relationship("DERManpower", back_populates="report",
                            cascade="all, delete-orphan")
    equipment = relationship("DEREquipment", back_populates="report",
                             cascade="all, delete-orphan")
    vendor_activity = relationship("DERVendorActivity", back_populates="report",
                                   cascade="all, delete-orphan")


class DERManpower(Base):
    """Structured manpower rows (not a JSON blob)."""

    __tablename__ = "der_manpower"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("daily_execution_reports.id",
                                           ondelete="CASCADE"),
                       nullable=False, index=True)
    category = Column(String, nullable=True)
    role = Column(String, nullable=True)
    planned_count = Column(Integer, default=0)
    actual_count = Column(Integer, default=0)
    hours = Column(Float, default=0)
    remarks = Column(Text, nullable=True)

    report = relationship("DailyExecutionReport", back_populates="manpower")


class DEREquipment(Base):
    __tablename__ = "der_equipment"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("daily_execution_reports.id",
                                           ondelete="CASCADE"),
                       nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    equipment_name = Column(String, nullable=True)
    quantity = Column(Integer, default=1)
    hours_used = Column(Float, default=0)
    utilization = Column(Float, nullable=True)
    condition = Column(String, nullable=True)
    remarks = Column(Text, nullable=True)

    report = relationship("DailyExecutionReport", back_populates="equipment")


class DERVendorActivity(Base):
    """Vendor execution recorded for the day (vendor must belong to project)."""

    __tablename__ = "der_vendor_activity"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("daily_execution_reports.id",
                                           ondelete="CASCADE"),
                       nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=True)
    activity = Column(String, nullable=True)
    quantity_completed = Column(Float, nullable=True)
    progress = Column(Float, nullable=True)
    remarks = Column(Text, nullable=True)

    report = relationship("DailyExecutionReport", back_populates="vendor_activity")


class DEREditRequest(Base):
    """Supervisor asks admin to unlock a SUBMITTED report for correction.

    Approval flips the report back to DRAFT so the supervisor can edit and
    resubmit. Rejection leaves the report untouched.
    """

    __tablename__ = "der_edit_requests"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("daily_execution_reports.id",
                                           ondelete="CASCADE"),
                       nullable=False, index=True)
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    # PENDING | APPROVED | REJECTED
    status = Column(String, nullable=False, default="PENDING", index=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    review_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    report = relationship("DailyExecutionReport")
    requester = relationship("User", foreign_keys=[requested_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
