"""Medical Supply model."""
from sqlalchemy import Column, Integer, String, Numeric, Text, DateTime
from sqlalchemy.sql import func
from app.database import Base


class MedicalSupply(Base):
    """Medical supplies master data."""
    
    __tablename__ = "medical_supplies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)
    unit = Column(String(50), nullable=False)
    unit_price = Column(Numeric(10, 2))
    minimum_order_quantity = Column(Integer)
    lead_time_days = Column(Integer)
    storage_capacity = Column(Integer)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
