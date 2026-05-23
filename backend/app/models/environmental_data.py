"""Environmental Data model."""
from sqlalchemy import Column, Integer, String, Numeric, DateTime
from sqlalchemy.sql import func
from app.database import Base


class EnvironmentalData(Base):
    """Environmental data for forecasting."""
    
    __tablename__ = "environmental_data"
    
    id = Column(Integer, primary_key=True, index=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)
    location = Column(String(100), nullable=False, index=True)
    temperature = Column(Numeric(5, 2))  # Celsius
    humidity = Column(Numeric(5, 2))  # Percentage
    rainfall = Column(Numeric(7, 2))  # mm
    air_quality_index = Column(Integer)
    data_source = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
