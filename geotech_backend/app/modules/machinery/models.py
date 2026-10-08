from sqlalchemy import Column, Float, Integer, String, Date, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    machine_name = Column(String, nullable=False)
    machine_type = Column(String, nullable=False)
    last_maintenance = Column(Date, nullable=True)
    status = Column(String, default="active")  # active | inactive | maintenance | working
    rate_per_day = Column(Float, nullable=True)  # standard hire rate; WO can override per order

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 🔥 Relationship with ProjectMachine
    projects = relationship(
        "ProjectMachine",
        back_populates="machine",
        cascade="all, delete-orphan"
    )