# app/modules/Expenditure/models.py

from sqlalchemy import Column, Integer, Float, ForeignKey, Date, Text, String
from sqlalchemy.orm import relationship
from app.core.database import Base


class Expenditure(Base):
    __tablename__ = "expenditures"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    location = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    department = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    duration = Column(Integer, nullable=True)
    date = Column(Date, nullable=False)

    total_manpower_amount = Column(Float, default=0.0)
    total_vendor_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)

    project = relationship("Project", back_populates="expenditures")
    creator = relationship("User")

    manpower_expenses = relationship(
        "ManpowerExpense",
        back_populates="expenditure",
        cascade="all, delete-orphan"
    )

    vendor_expenses = relationship(
        "VendorExpense",
        back_populates="expenditure",
        cascade="all, delete-orphan"
    )


# ================= MANPOWER =================

class ManpowerExpense(Base):
    __tablename__ = "manpower_expenses"

    id = Column(Integer, primary_key=True)

    expenditure_id = Column(
        Integer,
        ForeignKey("expenditures.id", ondelete="CASCADE"),
        nullable=False
    )

    supervisor_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    travel = Column(Float, default=0.0)
    accom = Column(Float, default=0.0)
    da = Column(Float, default=0.0)
    vehicle_hire = Column(Float, default=0.0)
    jcb_hydra_other = Column(Float, default=0.0)
    tractor_trolly_water = Column(Float, default=0.0)
    local_vehicle_hire = Column(Float, default=0.0)
    sample_transport = Column(Float, default=0.0)
    misc = Column(Float, default=0.0)
    misc_remark = Column(Text, nullable=True)

    total = Column(Float, default=0.0)

    expenditure = relationship("Expenditure", back_populates="manpower_expenses")
    supervisor = relationship("User")


# ================= VENDOR =================

class VendorExpense(Base):
    __tablename__ = "vendor_expenses"

    id = Column(Integer, primary_key=True)

    expenditure_id = Column(
        Integer,
        ForeignKey("expenditures.id", ondelete="CASCADE"),
        nullable=False
    )

    vendor_id = Column(
        Integer,
        ForeignKey("vendors.id"),
        nullable=False
    )

    vendor_total_exp = Column(Float, default=0.0)
    accom = Column(Float, default=0.0)
    vehicle_hire = Column(Float, default=0.0)
    jcb_hydra_other = Column(Float, default=0.0)
    tractor_trolly_water = Column(Float, default=0.0)
    local_vehicle_hire = Column(Float, default=0.0)
    sample_transport = Column(Float, default=0.0)
    misc = Column(Float, default=0.0)
    misc_remark = Column(Text, nullable=True)

    total_exp = Column(Float, default=0.0)

    expenditure = relationship("Expenditure", back_populates="vendor_expenses")
    vendor = relationship("Vendor")