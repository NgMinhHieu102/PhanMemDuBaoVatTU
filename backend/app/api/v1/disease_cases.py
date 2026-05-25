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
from app.schemas.base import DiseaseCaseCreate, DiseaseCaseResponse, DiseaseCaseUpdate
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

    Spec 3.4 — không trùng tháng + bệnh + khu vực:
    nếu đã tồn tại bản ghi cùng (year, month, disease_type, location), trả về 409
    để frontend gợi ý người dùng cập nhật thay vì thêm mới.
    """
    from app.models.disease_case import DiseaseCase
    from sqlalchemy import extract

    service = DiseaseCaseService(db)
    client_ip = get_client_ip(request)

    # Dedupe check: cùng (year, month, disease_type, location) → 409
    existing = (
        db.query(DiseaseCase)
        .filter(
            extract("year", DiseaseCase.recorded_at) == data.recorded_at.year,
            extract("month", DiseaseCase.recorded_at) == data.recorded_at.month,
            DiseaseCase.disease_type == data.disease_type,
            DiseaseCase.location == data.location,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Đã tồn tại bản ghi cho cùng tháng, bệnh và khu vực. "
                           "Vui lòng cập nhật thay vì thêm mới.",
                "existing_id": existing.id,
            },
        )

    try:
        new_case = service.create_disease_case(
            data=data,
            created_by_user_id=current_user.id,
            ip_address=client_ip
        )
        # Gắn note + created_by username (vì service legacy không xử lý 2 trường này)
        new_case.note = data.note
        new_case.created_by = current_user.username
        db.commit()
        db.refresh(new_case)
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
    Import disease cases from CSV.

    Hỗ trợ 2 định dạng:
    1. **Template đơn giản** (file mẫu): cột ``month``, ``disease_name``, ``region``, ``cases``
       - month dạng MM/YYYY hoặc YYYY-MM
       - disease_name có thể tiếng Việt (Sốt xuất huyết, Cúm A, ...) hoặc key (dengue_fever)
    2. **Hospital CSV**: cột ``AdmissionDate``, ``NhomBenh``, ``SoTiepNhan``, ``District``
       - Records aggregated by (date, disease_type, location), counted by distinct ``SoTiepNhan``.
    """
    from app.models.disease_case import DiseaseCase

    if not file.filename or not file.filename.lower().endswith((".csv",)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV",
        )

    try:
        raw = await file.read()
        text = raw.decode("utf-8", errors="replace")
        reader = list(csv.DictReader(io.StringIO(text)))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot parse CSV: {exc}",
        )

    if not reader:
        return {"status": "ok", "imported": 0, "updated": 0, "skipped": 0, "message": "Empty CSV"}

    headers = {h.strip() for h in (reader[0].keys() if reader else [])}

    imported = 0
    updated = 0
    skipped = 0
    errors: list[dict] = []  # spec 3.5: liệt kê dòng lỗi để user sửa

    # Cache các khu vực đã đăng ký ở module Quản trị (admin.regions) — tránh query lại nhiều lần.
    # Khu vực mới gặp trong CSV sẽ được tự động đăng ký vào danh mục này.
    new_regions_to_register: set[str] = set()

    def _register_pending_regions() -> None:
        """Thêm các khu vực mới từ CSV vào admin.regions (idempotent)."""
        if not new_regions_to_register:
            return
        from app.models.system_config import SystemConfig
        import json as _json

        cfg = (
            db.query(SystemConfig)
            .filter(SystemConfig.config_key == "admin.regions")
            .first()
        )
        if cfg is None:
            cfg = SystemConfig(
                config_key="admin.regions",
                config_value="[]",
                description="Danh mục khu vực",
            )
            db.add(cfg)
            db.flush()

        try:
            existing = _json.loads(cfg.config_value or "[]")
            if not isinstance(existing, list):
                existing = []
        except Exception:
            existing = []

        existing_names = {r.get("name") for r in existing if isinstance(r, dict)}
        added_count = 0
        for name in new_regions_to_register:
            if name in existing_names:
                continue
            existing.append({"name": name, "province": None, "description": ""})
            added_count += 1

        if added_count:
            cfg.config_value = _json.dumps(existing, ensure_ascii=False)
            cfg.updated_by = current_user.id
            logger.info(
                "CSV import: auto-registered %d new region(s): %s",
                added_count,
                ", ".join(sorted(new_regions_to_register)),
            )

    if {"month", "disease_name", "region", "cases"}.issubset(headers):
        # Simple template format → 1 row = 1 record
        for idx, row in enumerate(reader, start=2):  # start=2 vì line 1 là header
            month_str = (row.get("month") or "").strip()
            disease = (row.get("disease_name") or "").strip()
            region = (row.get("region") or "").strip()
            cases_raw = (row.get("cases") or "").strip()
            note = (row.get("note") or "").strip() or None

            if not month_str or not disease or not region or not cases_raw:
                skipped += 1
                errors.append({
                    "row": idx,
                    "reason": "Thiếu cột bắt buộc (month / disease_name / region / cases)",
                    "data": {"month": month_str, "disease_name": disease, "region": region, "cases": cases_raw},
                })
                continue

            # Parse month: "MM/YYYY" or "YYYY-MM" or "YYYY-MM-DD"
            parsed: Optional[datetime] = None
            for fmt in ("%m/%Y", "%Y-%m", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
                try:
                    parsed = datetime.strptime(month_str, fmt)
                    break
                except ValueError:
                    continue
            if parsed is None:
                skipped += 1
                errors.append({
                    "row": idx,
                    "reason": f"Không hiểu định dạng tháng: '{month_str}' (chấp nhận MM/YYYY, YYYY-MM)",
                })
                continue
            recorded_at = datetime(parsed.year, parsed.month, 1)

            try:
                cases_int = int(float(cases_raw))
            except ValueError:
                skipped += 1
                errors.append({"row": idx, "reason": f"Số ca không hợp lệ: '{cases_raw}'"})
                continue
            if cases_int < 0:
                skipped += 1
                errors.append({"row": idx, "reason": f"Số ca phải >= 0, nhận được {cases_int}"})
                continue

            # Map Vietnamese disease name → key if needed
            disease_key = NHOM_BENH_MAPPING.get(disease, disease)

            existing = (
                db.query(DiseaseCase)
                .filter(
                    DiseaseCase.recorded_at == recorded_at,
                    DiseaseCase.disease_type == disease_key,
                    DiseaseCase.location == region,
                )
                .first()
            )
            if existing:
                existing.case_count = cases_int
                existing.data_source = file.filename
                if note:
                    existing.note = note
                updated += 1
            else:
                db.add(
                    DiseaseCase(
                        recorded_at=recorded_at,
                        disease_type=disease_key,
                        case_count=cases_int,
                        location=region,
                        data_source=file.filename,
                        note=note,
                        created_by=current_user.username,
                    )
                )
                imported += 1
            # Đánh dấu khu vực để register vào admin.regions sau
            new_regions_to_register.add(region)
    else:
        # Hospital CSV format
        aggregate: dict[tuple, set[str]] = {}
        for row in reader:
            admit = (row.get("AdmissionDate") or "").strip()
            nhom = (row.get("NhomBenh") or "").strip()
            so_tiep_nhan = (row.get("SoTiepNhan") or "").strip()
            location = (row.get("District") or "Thành phố Hồ Chí Minh").strip()

            if not admit or not nhom or not so_tiep_nhan:
                skipped += 1
                continue

            disease_type = NHOM_BENH_MAPPING.get(nhom)
            if not disease_type:
                skipped += 1
                continue

            parsed = None
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
            new_regions_to_register.add(location)

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

    # Register các khu vực mới gặp trong CSV vào admin.regions
    try:
        _register_pending_regions()
    except Exception as exc:
        logger.warning("Không thể tự đăng ký khu vực mới: %s", exc)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save: {exc}",
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
        "errors": errors[:200],  # giới hạn 200 dòng lỗi đầu để response không quá lớn
        "errors_truncated": len(errors) > 200,
    }


@router.put("/{case_id}", response_model=DiseaseCaseResponse)
def update_disease_case(
    case_id: int,
    data: DiseaseCaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update an existing disease case (PATCH-style: chỉ cập nhật field có giá trị)."""
    from app.models.disease_case import DiseaseCase
    from sqlalchemy import extract

    case = db.query(DiseaseCase).filter(DiseaseCase.id == case_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Disease case {case_id} not found",
        )

    # Nếu đổi (recorded_at + disease_type + location) → check trùng với bản ghi khác
    new_recorded_at = data.recorded_at or case.recorded_at
    new_disease = data.disease_type or case.disease_type
    new_location = data.location or case.location
    duplicate = (
        db.query(DiseaseCase)
        .filter(
            DiseaseCase.id != case_id,
            extract("year", DiseaseCase.recorded_at) == new_recorded_at.year,
            extract("month", DiseaseCase.recorded_at) == new_recorded_at.month,
            DiseaseCase.disease_type == new_disease,
            DiseaseCase.location == new_location,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Đã có bản ghi khác cho cùng tháng/bệnh/khu vực này.",
                "existing_id": duplicate.id,
            },
        )

    update_dict = data.model_dump(exclude_none=True)
    for k, v in update_dict.items():
        setattr(case, k, v)

    try:
        db.commit()
        db.refresh(case)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update: {exc}",
        )
    logger.info(f"Disease case {case_id} updated by user={current_user.username}")
    return case


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


@router.get("/template")
async def download_template():
    """Trả về file CSV mẫu để người dùng tải về điền."""
    from fastapi.responses import StreamingResponse

    sample = (
        "month,disease_name,region,cases,note\n"
        "10/2024,Sốt xuất huyết,Quận 1,145,\n"
        "10/2024,Tay chân miệng,Quận 3,32,\n"
        "09/2024,Cúm A,Thành phố Thủ Đức,89,\n"
    )
    return StreamingResponse(
        iter([sample]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=disease_cases_template.csv"},
    )


@router.get("/distinct-values")
async def distinct_values(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Lấy danh sách disease_type + location duy nhất để dùng cho dropdown filter."""
    from app.models.disease_case import DiseaseCase

    diseases = (
        db.query(DiseaseCase.disease_type)
        .distinct()
        .order_by(DiseaseCase.disease_type)
        .all()
    )
    regions = (
        db.query(DiseaseCase.location)
        .distinct()
        .order_by(DiseaseCase.location)
        .all()
    )
    return {
        "disease_types": [d[0] for d in diseases if d[0]],
        "regions": [r[0] for r in regions if r[0]],
    }
