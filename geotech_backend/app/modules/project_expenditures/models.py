"""Professional project expenditures (V3 clean model).

Legacy `expenditures` tables/endpoints are deprecated (crash-fixed, read-only
in practice). All new UI uses this model.
"""
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Text, ForeignKey,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class ProjectExpenditure(Base):
    __tablename__ = "project_expenditures"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    expense_date = Column(Date, nullable=False)
    expense_category = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    amount = Column(Float, nullable=False, default=0)
    currency = Column(String, default="INR")
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=True)
    supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    payment_method = Column(String, nullable=True)
    reference_number = Column(String, nullable=True)
    receipt_document_id = Column(Integer, nullable=True)  # document metadata id (future)
    # DRAFT | SUBMITTED | APPROVED | REJECTED
    status = Column(String, nullable=False, default="DRAFT", index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="project_expenditures")
