"""Company settings — singleton row (id=1) driving WO header/footer/numbering.

No hardcoded corporate identity lives in code or frontend: the document
engine resolves everything from here (with seed defaults).
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from datetime import datetime
from app.core.database import Base


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True, default=1)
    company_name = Column(String, nullable=False, default="GeoTech Engineering Pvt Ltd")
    tagline = Column(String, nullable=True)
    logo_path = Column(String, nullable=True)
    address_line1 = Column(String, nullable=True)
    address_line2 = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    pin = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    phone2 = Column(String, nullable=True)
    email = Column(String, nullable=True)
    website = Column(String, nullable=True)
    gstin = Column(String, nullable=True)
    pan = Column(String, nullable=True)
    other_registrations = Column(Text, nullable=True)
    # Work-order numbering (tokens: {prefix} {project} {yy} {yyyy} {seq} + :Nd padding)
    wo_number_prefix = Column(String, nullable=False, default="GEOTECH/WO")
    wo_number_format = Column(String, nullable=False,
                              default="{prefix}/{project}/{seq:02d}")
    footer_head_office = Column(Text, nullable=True)
    footer_regional_office = Column(Text, nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
