"""Forecast API endpoints."""
import logging
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.base import (
    DiseaseType,
    ForecastRequest,
    DiseaseForecastResponse,
)
from app.services.forecast_service import ForecastService

# Try to import Celery task, but make it optional
try:
    from app.tasks.forecast_tasks import generate_forecast_async
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False
    logging.warning("Celery not available, async forecast generation will use background tasks")

logger = logging.getLogger(__name__)

router = APIRouter(tags=["forecasts"])


@router.post("/generate", status_code=202)
async def generate_forecast(
    request: ForecastRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate a new disease forecast.
    
    This endpoint initiates forecast generation asynchronously.
    For 7-day forecasts, it should complete within 30 seconds.
    For 30-day forecasts, it should complete within 2 minutes.
    
    Args:
        request: Forecast request parameters
        background_tasks: FastAPI background tasks
        db: Database session
        current_user: Authenticated user
    
    Returns:
        Task ID and status information
    """
    logger.info(f"Forecast generation requested by user {current_user.username}")
    logger.info(f"Disease: {request.disease_type.value}, Period: {request.forecast_period_days} days")
    
    try:
        # If Celery is available, use it for async processing
        if CELERY_AVAILABLE:
            task = generate_forecast_async.apply_async(
                args=[
                    request.disease_type.value,
                    request.forecast_period_days,
                    request.location
                ]
            )
            
            return {
                "task_id": task.id,
                "status": "processing",
                "message": f"Forecast generation started for {request.disease_type.value}",
                "disease_type": request.disease_type.value,
                "forecast_period_days": request.forecast_period_days,
                "estimated_completion_time": "30 seconds" if request.forecast_period_days <= 7 else "2 minutes"
            }
        else:
            # Fallback to synchronous generation if Celery is not available
            forecast_service = ForecastService(db)
            result = forecast_service.generate_forecast(
                disease_type=request.disease_type,
                forecast_period_days=request.forecast_period_days,
                location=request.location
            )
            
            return {
                "status": "completed",
                "message": f"Forecast generated for {request.disease_type.value}",
                "result": result
            }
    
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating forecast: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate forecast")


@router.get("", response_model=List[DiseaseForecastResponse])
async def list_forecasts(
    disease_type: Optional[DiseaseType] = Query(None, description="Filter by disease type"),
    start_date: Optional[date] = Query(None, description="Filter by start date"),
    end_date: Optional[date] = Query(None, description="Filter by end date"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of forecasts with optional filters.
    
    Args:
        disease_type: Optional disease type filter
        start_date: Optional start date filter
        end_date: Optional end date filter
        limit: Maximum number of results
        offset: Number of results to skip
        db: Database session
        current_user: Authenticated user
    
    Returns:
        List of forecast records
    """
    logger.info(f"Listing forecasts requested by user {current_user.username}")
    
    try:
        forecast_service = ForecastService(db)
        forecasts = forecast_service.get_forecasts(
            disease_type=disease_type,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset
        )
        
        return forecasts
    
    except Exception as e:
        logger.error(f"Error listing forecasts: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve forecasts")


@router.get("/{forecast_id}", response_model=DiseaseForecastResponse)
async def get_forecast(
    forecast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific forecast by ID.
    
    Args:
        forecast_id: Forecast ID
        db: Database session
        current_user: Authenticated user
    
    Returns:
        Forecast record
    """
    logger.info(f"Getting forecast {forecast_id} requested by user {current_user.username}")
    
    try:
        forecast_service = ForecastService(db)
        forecast = forecast_service.get_forecast_by_id(forecast_id)
        
        if not forecast:
            raise HTTPException(status_code=404, detail="Forecast not found")
        
        return forecast
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting forecast: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve forecast")


@router.get("/latest/{disease_type}", response_model=DiseaseForecastResponse)
async def get_latest_forecast(
    disease_type: DiseaseType,
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the most recent forecast for a disease type.
    
    Args:
        disease_type: Type of disease
        location: Optional location filter
        db: Database session
        current_user: Authenticated user
    
    Returns:
        Most recent forecast record
    """
    logger.info(f"Getting latest forecast for {disease_type.value} requested by user {current_user.username}")
    
    try:
        forecast_service = ForecastService(db)
        forecast = forecast_service.get_latest_forecast(
            disease_type=disease_type,
            location=location
        )
        
        if not forecast:
            raise HTTPException(
                status_code=404,
                detail=f"No forecast found for {disease_type.value}"
            )
        
        return forecast
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting latest forecast: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve latest forecast")


@router.get("/accuracy/metrics")
async def get_accuracy_metrics(
    disease_type: Optional[DiseaseType] = Query(None, description="Filter by disease type"),
    start_date: Optional[date] = Query(None, description="Filter by start date"),
    end_date: Optional[date] = Query(None, description="Filter by end date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get accuracy metrics for forecasts.
    
    Returns MAE (Mean Absolute Error), RMSE (Root Mean Square Error),
    and MAPE (Mean Absolute Percentage Error) for the specified forecasts.
    
    Args:
        disease_type: Optional disease type filter
        start_date: Optional start date filter
        end_date: Optional end date filter
        db: Database session
        current_user: Authenticated user
    
    Returns:
        Dictionary containing accuracy metrics
    """
    logger.info(f"Getting accuracy metrics requested by user {current_user.username}")
    
    try:
        forecast_service = ForecastService(db)
        metrics = forecast_service.get_accuracy_metrics(
            disease_type=disease_type,
            start_date=start_date,
            end_date=end_date
        )
        
        return metrics
    
    except Exception as e:
        logger.error(f"Error getting accuracy metrics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve accuracy metrics")


@router.get("/{forecast_id}/supply-requirements")
async def get_forecast_supply_requirements(
    forecast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get supply requirements associated with a forecast.
    
    Args:
        forecast_id: Forecast ID
        db: Database session
        current_user: Authenticated user
    
    Returns:
        List of supply requirements
    """
    logger.info(f"Getting supply requirements for forecast {forecast_id}")
    
    try:
        forecast_service = ForecastService(db)
        
        # Check if forecast exists
        forecast = forecast_service.get_forecast_by_id(forecast_id)
        if not forecast:
            raise HTTPException(status_code=404, detail="Forecast not found")
        
        # Get supply requirements
        requirements = forecast_service.get_supply_requirements_for_forecast(forecast_id)
        
        return {
            "forecast_id": forecast_id,
            "disease_type": forecast.disease_type,
            "forecast_date": forecast.forecast_date,
            "requirements": requirements
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting supply requirements: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve supply requirements")


# Optional: Task status endpoint if Celery is available
if CELERY_AVAILABLE:
    @router.get("/tasks/{task_id}")
    async def get_task_status(
        task_id: str,
        current_user: User = Depends(get_current_user)
    ):
        """Get the status of an async forecast generation task.
        
        Args:
            task_id: Celery task ID
            current_user: Authenticated user
        
        Returns:
            Task status and result if completed
        """
        from celery.result import AsyncResult
        
        task = AsyncResult(task_id)
        
        if task.state == "PENDING":
            response = {
                "task_id": task_id,
                "status": "pending",
                "message": "Task is waiting to be processed"
            }
        elif task.state == "STARTED":
            response = {
                "task_id": task_id,
                "status": "started",
                "message": "Task has started processing",
                "meta": task.info
            }
        elif task.state == "PROGRESS":
            response = {
                "task_id": task_id,
                "status": "in_progress",
                "message": "Task is in progress",
                "meta": task.info
            }
        elif task.state == "SUCCESS":
            response = {
                "task_id": task_id,
                "status": "completed",
                "message": "Task completed successfully",
                "result": task.result
            }
        elif task.state == "FAILURE":
            response = {
                "task_id": task_id,
                "status": "failed",
                "message": "Task failed",
                "error": str(task.info)
            }
        else:
            response = {
                "task_id": task_id,
                "status": task.state.lower(),
                "message": f"Task is in {task.state} state"
            }
        
        return response
