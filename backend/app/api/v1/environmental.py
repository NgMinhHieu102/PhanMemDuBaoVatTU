"""Environmental Data API endpoints."""
import logging
from typing import List, Optional, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_admin_user
from app.models.user import User
from app.schemas.base import EnvironmentalDataCreate, EnvironmentalDataResponse
from app.services.environmental_service import EnvironmentalDataService

router = APIRouter()
logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/", response_model=List[EnvironmentalDataResponse])
def list_environmental_data(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    List environmental data records.
    
    Supports filtering by location.
    All authenticated users can access this endpoint.
    """
    service = EnvironmentalDataService(db)
    data = service.get_environmental_data(
        skip=skip,
        limit=limit,
        location=location
    )
    return data


@router.post("/", response_model=EnvironmentalDataResponse, status_code=status.HTTP_201_CREATED)
def create_environmental_data(
    data: EnvironmentalDataCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Create a new environmental data record.
    
    All authenticated users can create environmental data records.
    """
    service = EnvironmentalDataService(db)
    client_ip = get_client_ip(request)
    
    try:
        new_data = service.create_environmental_data(
            data=data,
            created_by_user_id=current_user.id,
            ip_address=client_ip
        )
        return new_data
    except Exception as e:
        logger.error(f"Failed to create environmental data: {str(e)}")
        raise


@router.get("/latest", response_model=EnvironmentalDataResponse)
def get_latest_environmental_data(
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get the latest environmental data record.
    
    Optionally filter by location.
    All authenticated users can access this endpoint.
    """
    service = EnvironmentalDataService(db)
    data = service.get_latest_data(location=location)
    return data


@router.get("/range", response_model=List[EnvironmentalDataResponse])
def get_environmental_data_range(
    start_date: datetime = Query(..., description="Start date and time (ISO format)"),
    end_date: datetime = Query(..., description="End date and time (ISO format)"),
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get environmental data for a specific date range.
    
    All authenticated users can access this endpoint.
    """
    service = EnvironmentalDataService(db)
    data = service.get_data_by_date_range(
        start_date=start_date,
        end_date=end_date,
        location=location
    )
    return data
