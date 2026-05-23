"""Disease Cases API endpoints."""
import csv
import io
import logging
from typing import List, Optional, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.base import DiseaseCaseCreate, DiseaseCaseResponse
from app.services.disease_case_service import DiseaseCaseService

router = APIRouter()
logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/", response_model=List[DiseaseCaseResponse])
def list_disease_cases(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    disease_type: Optional[str] = Query(None, description="Filter by disease type"),
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    List disease case records.
    
    Supports filtering by disease type and location.
    All authenticated users can access this endpoint.
    """
    service = DiseaseCaseService(db)
    cases = service.get_disease_cases(
        skip=skip,
        limit=limit,
        disease_type=disease_type,
        location=location
    )
    return cases


@router.post("/", response_model=DiseaseCaseResponse, status_code=status.HTTP_201_CREATED)
def create_disease_case(
    data: DiseaseCaseCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Create a new disease case record.
    
    All authenticated users can create disease case records.
    Validates that case_count is non-negative.
    """
    service = DiseaseCaseService(db)
    client_ip = get_client_ip(request)
    
    try:
        new_case = service.create_disease_case(
            data=data,
            created_by_user_id=current_user.id,
            ip_address=client_ip
        )
        return new_case
    except Exception as e:
        logger.error(f"Failed to create disease case: {str(e)}")
        raise


@router.get("/stats")
def get_disease_case_statistics(
    location: Optional[str] = Query(None, description="Filter by location"),
    start_date: Optional[datetime] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date (ISO format)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get disease case statistics grouped by disease type.
    
    Returns total case counts, record counts, and latest record date for each disease type.
    All authenticated users can access this endpoint.
    """
    service = DiseaseCaseService(db)
    statistics = service.get_statistics(
        location=location,
        start_date=start_date,
        end_date=end_date
    )
    return {
        "statistics": statistics,
        "filters": {
            "location": location,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None
        }
    }


@router.get("/trends")
def get_disease_case_trends(
    disease_type: Optional[str] = Query(None, description="Filter by disease type"),
    location: Optional[str] = Query(None, description="Filter by location"),
    start_date: Optional[datetime] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date (ISO format)"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of data points"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get disease case trend data (time series).
    
    Returns daily aggregated case counts over time.
    All authenticated users can access this endpoint.
    """
    service = DiseaseCaseService(db)
    trends = service.get_trends(
        disease_type=disease_type,
        location=location,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )
    return {
        "trends": trends,
        "filters": {
            "disease_type": disease_type,
            "location": location,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None
        }
    }


# Mapping NhomBenh (Vietnamese) → standard disease_type used in DB
NHOM_BENH_MAPPING = {
    "Bệnh lý hô hấp": "respiratory_disease",
    "Cúm mùa": "seasonal_flu",
    "Nhiễm virus": "viral_infection",
    "Sốt xuất huyết": "dengue_fever",
}


@router.post("/import-csv", status_code=status.HTTP_200_OK)
async def import_disease_cases_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Import disease cases from a hospital CSV file.

    Expected columns: ``AdmissionDate``, ``NhomBenh``, ``SoTiepNhan``, ``District``.
    Records are aggregated by (date, disease_type, location) and counted by
    distinct ``SoTiepNhan`` (case ID). Existing records for the same key are
    replaced, so the import is idempotent.
    """
    from app.models.disease_case import DiseaseCase

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV",
        )

    try:
        raw = await file.read()
        text = raw.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))

        # Aggregate {(date, disease_type, location): set(SoTiepNhan)}
        aggregate: dict[tuple, set[str]] = {}
        skipped = 0
        for row in reader:
            admit = (row.get("AdmissionDate") or "").strip()
            nhom = (row.get("NhomBenh") or "").strip()
            so_tiep_nhan = (row.get("SoTiepNhan") or "").strip()
            location = (row.get("District") or "Thành phố Hồ Chí Minh").strip() or "Thành phố Hồ Chí Minh"

            if not admit or not nhom or not so_tiep_nhan:
                skipped += 1
                continue

            disease_type = NHOM_BENH_MAPPING.get(nhom)
            if not disease_type:
                skipped += 1
                continue

            # Parse admission date (M/D/YYYY or YYYY-MM-DD)
            parsed: Optional[datetime] = None
            for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"):
                try:
                    parsed = datetime.strptime(admit, fmt)
                    break
                except ValueError:
                    continue
            if parsed is None:
                skipped += 1
                continue

            key = (parsed.date(), disease_type, location)
            aggregate.setdefault(key, set()).add(so_tiep_nhan)
    except Exception as exc:
        logger.error(f"Failed to parse CSV: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot parse CSV: {exc}",
        )

    if not aggregate:
        return {
            "status": "ok",
            "imported": 0,
            "updated": 0,
            "skipped": skipped,
            "message": "No valid rows found",
        }

    imported = 0
    updated = 0
    for (rec_date, disease_type, location), ids in aggregate.items():
        recorded_at = datetime(rec_date.year, rec_date.month, rec_date.day)
        existing = (
            db.query(DiseaseCase)
            .filter(
                DiseaseCase.recorded_at == recorded_at,
                DiseaseCase.disease_type == disease_type,
                DiseaseCase.location == location,
            )
            .first()
        )
        if existing:
            existing.case_count = len(ids)
            existing.data_source = file.filename
            updated += 1
        else:
            db.add(
                DiseaseCase(
                    recorded_at=recorded_at,
                    disease_type=disease_type,
                    case_count=len(ids),
                    location=location,
                    data_source=file.filename,
                )
            )
            imported += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Commit failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save disease cases",
        )

    logger.info(
        f"Disease cases import by user={current_user.username}: "
        f"imported={imported} updated={updated} skipped={skipped}"
    )
    return {
        "status": "ok",
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "total_groups": len(aggregate),
    }


@router.delete("/{case_id}", status_code=status.HTTP_200_OK)
def delete_disease_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Delete a single disease case record."""
    from app.models.disease_case import DiseaseCase

    case = db.query(DiseaseCase).filter(DiseaseCase.id == case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Disease case {case_id} not found",
        )

    db.delete(case)
    db.commit()
    logger.info(f"Disease case {case_id} deleted by user={current_user.username}")
    return {"message": "Disease case deleted", "id": case_id}
