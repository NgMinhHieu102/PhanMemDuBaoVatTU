"""Disease Case model."""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class DiseaseCase(Base):
    """Disease case records (epidemiological data)."""
    
    __tablename__ = "disease_cases"
    
    id = Column(Integer, primary_key=True, index=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)
    disease_type = Column(String(100), nullable=False, index=True)  # dengue_fever, seasonal_flu, respiratory_disease
    case_count = Column(Integer, nullable=False)
    location = Column(String(100), nullable=False, index=True)
    severity = Column(String(20))
    data_source = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
