from datetime import date, datetime
from xmlrpc.client import Boolean  # noqa: F401  (legacy unused import, kept for compat)


from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    project_code = Column(String, unique=True, nullable=False)
    date = Column(String, nullable=False)  # Use Date if preferred
    name = Column(String, nullable=False)
    client_name = Column(String, nullable=False)
    engineer_in_charge = Column(String, nullable=False)
    location = Column(String, nullable=False)

    planned_start_date = Column(Date, nullable=True)
    planned_end_date = Column(Date, nullable=True)
    actual_start_date = Column(Date, nullable=True)
    actual_end_date = Column(Date, nullable=True)
    project_budget = Column(Float, default=0)
    estimated_total_depth = Column(Float, default=0)
    target_depth_per_day = Column(Float, default=0)
    target_boreholes_per_day = Column(Float, default=0)

    status = Column(String, default="Not Started")
    progress = Column(Float, default=0)
    total_boreholes = Column(Integer, default=0)
    completed_boreholes = Column(Integer, default=0)

    # --- V3 descriptors (nullable; lifecycle validated in service) ---
    description = Column(Text, nullable=True)
    project_type = Column(String, nullable=True)
    priority = Column(String, nullable=True)  # LOW | MEDIUM | HIGH | CRITICAL
    currency = Column(String, default="INR")

    vendors = relationship(
        "ProjectVendor",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    supervisors = relationship(
        "ProjectSupervisor",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    machinery = relationship(
        "ProjectMachine",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    expenditures = relationship(
        "Expenditure",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    daily_execution_reports = relationship(
        "DailyExecutionReport",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    # V3 procurement children (explicit ORM cascade; SQLite has no FK enforcement
    # by default, so service also deletes in dependency order — see delete_project)
    rfqs = relationship(
        "RFQ",
        cascade="all, delete-orphan"
    )

    work_orders = relationship(
        "WorkOrder",
        cascade="all, delete-orphan"
    )

    project_expenditures = relationship(
        "ProjectExpenditure",
        back_populates="project",
        cascade="all, delete-orphan"
    )


class ProjectSupervisor(Base):
    __tablename__ = "project_supervisors"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    supervisor_id = Column(Integer, ForeignKey("users.id"))
    assigned_at = Column(Date, default=date.today)           # Date assigned to this project
    is_active = Column(Boolean, default=True)         # Currently assigned?

    project = relationship("Project", back_populates="supervisors")
    supervisor = relationship("User")


class ProjectMachine(Base):
    __tablename__ = "project_machines"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    machine_id = Column(Integer, ForeignKey("machines.id"))

    project = relationship("Project", back_populates="machinery")
    machine = relationship("Machine")  # Machine model from machinery.models


class ProjectVendor(Base):
    __tablename__ = "project_vendors"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    vendor_id = Column(Integer, ForeignKey("vendors.id"))

    project = relationship("Project", back_populates="vendors")
    vendor = relationship("Vendor")


class ProjectAssignment(Base):
    """Professional project assignment (User → Project), separate from role.

    History is preserved: ending an assignment sets status to
    COMPLETED/CANCELLED/REMOVED instead of deleting the row.
    Only ACTIVE SUPERVISORs may hold an ACTIVE assignment (enforced in service).
    """

    __tablename__ = "project_assignments"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # assignment_role is a label (SUPERVISOR today; extend for future roles)
    assignment_role = Column(String, nullable=False, default="SUPERVISOR")
    # PENDING|ACTIVE|COMPLETED|CANCELLED|REMOVED
    status = Column(String, nullable=False, default="ACTIVE", index=True)
    is_primary = Column(Boolean, default=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    removed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    removed_at = Column(DateTime, nullable=True)
    removal_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    project = relationship("Project")
    user = relationship("User", foreign_keys=[user_id])
