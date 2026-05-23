"""Inventory API endpoints."""
import logging
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_inventory_manager_or_admin
from app.models.user import User
from app.schemas.base import InventoryUpdate, InventoryResponse
from app.services.inventory_service import InventoryService

router = APIRouter()
logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/", response_model=List[InventoryResponse])
def list_inventory(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=5000),
    supply_id: Optional[int] = Query(None, description="Filter by supply ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    List all inventory items.
    
    Supports filtering by supply_id and location.
    All authenticated users can access this endpoint.
    """
    inventory_service = InventoryService(db)
    items = inventory_service.get_inventory_items(
        skip=skip,
        limit=limit,
        supply_id=supply_id,
        location=location
    )
    return items


@router.get("/low-stock", response_model=List[InventoryResponse])
def get_low_stock_items(
    threshold: float = Query(1.0, ge=0.1, le=2.0, description="Threshold multiplier for safety stock"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get inventory items with low stock.
    
    Returns items where current_stock <= safety_stock * threshold.
    Default threshold is 1.0 (at or below safety stock).
    """
    inventory_service = InventoryService(db)
    items = inventory_service.get_low_stock_items(threshold_multiplier=threshold)
    return items


@router.get("/expiring", response_model=List[InventoryResponse])
def get_expiring_items(
    days: int = Query(30, ge=1, le=365, description="Number of days to look ahead"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get inventory items expiring within the specified number of days.
    
    Default is 30 days.
    """
    inventory_service = InventoryService(db)
    items = inventory_service.get_expiring_items(days_threshold=days)
    return items


@router.get("/{inventory_id}", response_model=InventoryResponse)
def get_inventory_item(
    inventory_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get inventory item by ID.
    
    All authenticated users can access this endpoint.
    """
    inventory_service = InventoryService(db)
    item = inventory_service.get_inventory_by_id(inventory_id)
    return item


@router.delete("/{inventory_id}", status_code=status.HTTP_200_OK)
def delete_inventory(
    inventory_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_inventory_manager_or_admin),
) -> Any:
    """
    Delete an inventory record.

    Only Inventory Managers and Administrators can delete inventory entries.
    Resolves any open alerts attached to the same supply afterwards.
    """
    from app.models.inventory import Inventory as InventoryModel
    from app.models.alert import Alert as AlertModel
    from datetime import datetime, timezone

    item = (
        db.query(InventoryModel)
        .filter(InventoryModel.id == inventory_id)
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory {inventory_id} not found",
        )

    supply_id = item.supply_id
    db.delete(item)

    # Resolve open alerts tied to this supply if no inventory rows remain
    remaining = (
        db.query(InventoryModel)
        .filter(
            InventoryModel.supply_id == supply_id,
            InventoryModel.id != inventory_id,
        )
        .count()
    )
    if remaining == 0:
        now = datetime.now(timezone.utc)
        for alert in (
            db.query(AlertModel)
            .filter(
                AlertModel.supply_id == supply_id,
                AlertModel.is_resolved == False,  # noqa: E712
            )
            .all()
        ):
            alert.is_resolved = True
            alert.resolved_at = now

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to delete inventory {inventory_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete inventory record",
        )

    logger.info(
        f"Inventory {inventory_id} (supply_id={supply_id}) deleted by "
        f"user={current_user.username}"
    )
    return {"message": "Inventory deleted", "id": inventory_id}


@router.put("/{inventory_id}", response_model=InventoryResponse)
def update_inventory(
    inventory_id: int,
    inventory_data: InventoryUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_inventory_manager_or_admin)
) -> Any:
    """
    Update inventory stock levels.
    
    Only Inventory Managers and Administrators can update inventory.
    """
    inventory_service = InventoryService(db)
    client_ip = get_client_ip(request)
    
    try:
        updated_item = inventory_service.update_inventory(
            inventory_id=inventory_id,
            inventory_data=inventory_data,
            updated_by_user_id=current_user.id,
            ip_address=client_ip
        )
        return updated_item
    except Exception as e:
        logger.error(f"Failed to update inventory {inventory_id}: {str(e)}")
        raise


@router.post("/batch-update", response_model=List[InventoryResponse])
def batch_update_inventory(
    updates: List[dict],
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_inventory_manager_or_admin)
) -> Any:
    """
    Batch update multiple inventory items.
    
    Request body should be a list of objects with:
    - inventory_id (required): ID of inventory item to update
    - current_stock (optional): New current stock value
    - safety_stock (optional): New safety stock value
    
    Only Inventory Managers and Administrators can perform batch updates.
    
    Example:
    [
        {"inventory_id": 1, "current_stock": 500},
        {"inventory_id": 2, "current_stock": 300, "safety_stock": 100}
    ]
    """
    inventory_service = InventoryService(db)
    client_ip = get_client_ip(request)
    
    try:
        updated_items = inventory_service.batch_update_inventory(
            updates=updates,
            updated_by_user_id=current_user.id,
            ip_address=client_ip
        )
        return updated_items
    except Exception as e:
        logger.error(f"Failed to batch update inventory: {str(e)}")
        raise
