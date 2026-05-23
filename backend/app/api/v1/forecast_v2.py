"""
Forecast API v2 - Pipeline mới dựa trên CSV data

Endpoints:
- POST /api/v1/forecast-v2/train          - Load CSV + Train models
- POST /api/v1/forecast-v2/predict        - Dự báo tháng tới
- POST /api/v1/forecast-v2/full-pipeline  - Chạy toàn bộ pipeline
- GET  /api/v1/forecast-v2/ratios         - Xem conversion ratios thực tế
- GET  /api/v1/forecast-v2/monthly-data   - Xem dữ liệu tháng đã trích xuất
"""

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["forecast-v2"])

# Global service instance (singleton pattern for loaded data)
_forecasting_service = None


def get_forecasting_service():
    """Get or create the forecasting service singleton."""
    global _forecasting_service
    if _forecasting_service is None:
        from app.ai_engine.forecasting_service import ForecastingService
        _forecasting_service = ForecastingService()
    return _forecasting_service


# ── Request/Response Models ───────────────────────────────────────────────────

class WeatherInput(BaseModel):
    temp: float = Field(..., description="Nhiệt độ trung bình (°C)")
    humidity: float = Field(..., description="Độ ẩm trung bình (%)")
    rainfall: float = Field(..., description="Lượng mưa (mm)")
    aqi: float = Field(100.0, description="Chỉ số chất lượng không khí")


class PredictRequest(BaseModel):
    prev_month_weather: WeatherInput = Field(..., description="Thời tiết tháng trước (actual)")
    forecast_weather: WeatherInput = Field(..., description="Dự báo thời tiết tháng tới")
    target_month: int = Field(..., ge=1, le=12, description="Tháng cần dự báo (1-12)")
    target_year: Optional[int] = Field(None, description="Năm cần dự báo")
    forecast_period: Optional[str] = Field("month", description="Khoảng dự báo: tomorrow, 7days, month")


class FullPipelineRequest(BaseModel):
    prev_month_weather: WeatherInput = Field(..., description="Thời tiết tháng trước")
    forecast_weather: WeatherInput = Field(..., description="Dự báo thời tiết tháng tới")
    target_month: int = Field(..., ge=1, le=12, description="Tháng cần dự báo")
    target_year: Optional[int] = Field(None, description="Năm cần dự báo")
    current_inventory: Optional[Dict[str, float]] = Field(
        None, description="Tồn kho hiện tại {DrugName: quantity}"
    )
    top_n_supplies: int = Field(30, description="Top N vật tư cho mỗi nhóm bệnh")


class TrainRequest(BaseModel):
    csv_files: Optional[List[str]] = Field(
        None, description="Danh sách file CSV. Nếu None, tự tìm trong thư mục mặc định."
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/upload-csv")
async def upload_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload file CSV dữ liệu bệnh viện.
    
    File sẽ được lưu vào thư mục data và sẵn sàng cho training.
    Mỗi ngày có thể upload file mới để cập nhật dữ liệu.
    """
    import os
    import shutil
    
    logger.info(f"CSV upload by user {current_user.username}: {file.filename}")
    
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File phải có định dạng .csv")
    
    # Save to project root (where other data_HM_*.csv files are)
    from app.ai_engine.forecasting_service import DATA_DIR
    save_path = DATA_DIR / file.filename
    
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get file size
        file_size = os.path.getsize(save_path)
        
        return {
            "status": "success",
            "message": f"File '{file.filename}' uploaded successfully",
            "filename": file.filename,
            "size_bytes": file_size,
            "size_mb": round(file_size / 1024 / 1024, 2),
            "path": str(save_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/uploaded-files")
async def list_uploaded_files(
    current_user: User = Depends(get_current_user)
):
    """Liệt kê các file CSV đã upload."""
    import os
    from app.ai_engine.forecasting_service import DATA_DIR
    
    files = []
    for f in sorted(DATA_DIR.glob("*.csv")):
        stat = os.stat(f)
        files.append({
            "filename": f.name,
            "size_mb": round(stat.st_size / 1024 / 1024, 2),
            "modified": stat.st_mtime,
        })
    
    return {"status": "success", "files": files, "total": len(files)}

@router.post("/train")
async def train_models(
    request: TrainRequest = TrainRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Load CSV data và train models.
    
    Bước 1-2 trong pipeline:
    1. Import CSV → Trích xuất số ca bệnh + lượng vật tư
    2. AI học từ dữ liệu → Train model cho từng nhóm bệnh
    3. Tự động trừ tồn kho theo lượng vật tư đã sử dụng trong CSV
    """
    logger.info(f"Train request by user {current_user.username}")
    
    try:
        service = get_forecasting_service()
        
        # Convert filenames to full paths if needed
        csv_files = None
        if request.csv_files:
            from app.ai_engine.forecasting_service import DATA_DIR
            csv_files = []
            for f in request.csv_files:
                # If it's just a filename, prepend DATA_DIR
                if '/' not in f and '\\' not in f:
                    full_path = str(DATA_DIR / f)
                else:
                    full_path = f
                csv_files.append(full_path)
        
        # Step 1: Load data
        data_summary = service.load_training_data(csv_files)
        
        # Step 2: Train models
        training_metrics = service.train_models()
        
        # Step 3: Auto-deduct inventory based on CSV usage
        deduction_summary = _deduct_inventory_from_csv(service, db)
        
        # Step 4: Auto-import disease cases from CSV into database
        cases_imported = _import_disease_cases_from_csv(service, db)
        
        return {
            "status": "success",
            "message": "Models trained successfully",
            "data_summary": {
                'files_loaded': data_summary['files_loaded'],
                'total_records': data_summary['total_records'],
                'date_range': data_summary['date_range'],
                'months_available': data_summary['months_available'],
                'disease_groups': data_summary['disease_groups'],
            },
            "training_metrics": training_metrics,
            "inventory_deduction": deduction_summary,
            "cases_imported": cases_imported
        }
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Training error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


def _deduct_inventory_from_csv(service, db: Session) -> dict:
    """
    Tự động trừ tồn kho theo lượng vật tư đã sử dụng trong CSV.
    
    Logic: Tính tổng TotalQuantityUsed theo DrugName từ CSV,
    sau đó trừ khỏi current_stock trong inventory.
    """
    from app.models.medical_supply import MedicalSupply
    from app.models.inventory import Inventory
    
    if not service.is_data_loaded or service.csv_processor.raw_data is None:
        return {"deducted": 0, "message": "No data to deduct"}
    
    # Tính tổng vật tư đã dùng theo DrugName
    raw = service.csv_processor.raw_data
    usage = (
        raw
        .groupby('DrugName')['TotalQuantityUsed']
        .sum()
        .reset_index()
    )
    
    deducted = 0
    skipped = 0
    
    for _, row in usage.iterrows():
        drug_name = row['DrugName']
        qty_used = float(row['TotalQuantityUsed'])
        
        if qty_used <= 0 or not drug_name:
            continue
        
        # Find supply in database
        supply = db.query(MedicalSupply).filter(MedicalSupply.name == drug_name).first()
        if not supply:
            skipped += 1
            continue
        
        # Find inventory record
        inv = db.query(Inventory).filter(Inventory.supply_id == supply.id).first()
        if not inv:
            skipped += 1
            continue
        
        # Deduct (don't go below 0)
        old_stock = inv.current_stock or 0
        inv.current_stock = max(0, old_stock - int(qty_used))
        deducted += 1
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error deducting inventory: {e}")
        return {"deducted": 0, "error": str(e)}
    
    logger.info(f"Inventory deduction: {deducted} items deducted, {skipped} skipped")
    
    return {
        "deducted": deducted,
        "skipped": skipped,
        "message": f"Đã trừ tồn kho cho {deducted} vật tư (bỏ qua {skipped} vật tư chưa có trong kho)"
    }


def _import_disease_cases_from_csv(service, db: Session) -> dict:
    """
    Import số ca bệnh từ CSV vào database disease_cases.
    
    Trích xuất: số ca bệnh theo ngày theo nhóm bệnh từ CSV,
    rồi insert vào bảng disease_cases để trang Dịch tễ hiển thị.
    """
    from app.models.disease_case import DiseaseCase
    from datetime import datetime
    
    if not service.is_data_loaded or service.csv_processor.raw_data is None:
        return {"imported": 0, "message": "No data"}
    
    raw = service.csv_processor.raw_data
    
    # Group by date + disease type → count unique patients
    daily_cases = (
        raw
        .dropna(subset=['AdmissionDate', 'NhomBenh'])
        .groupby([raw['AdmissionDate'].dt.date, 'DiseaseType'])['SoTiepNhan']
        .nunique()
        .reset_index()
    )
    daily_cases.columns = ['date', 'disease_type', 'case_count']
    
    # Clear old data to avoid duplicates
    db.query(DiseaseCase).delete()
    db.flush()
    
    imported = 0
    for _, row in daily_cases.iterrows():
        if not row['disease_type'] or row['case_count'] <= 0:
            continue
        
        case = DiseaseCase(
            disease_type=row['disease_type'],
            case_count=int(row['case_count']),
            recorded_at=datetime.combine(row['date'], datetime.min.time()),
            location='Thành phố Hồ Chí Minh',
            data_source='csv_import',
        )
        db.add(case)
        imported += 1
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing disease cases: {e}")
        return {"imported": 0, "error": str(e)}
    
    logger.info(f"Imported {imported} disease case records from CSV")
    return {"imported": imported, "message": f"Đã import {imported} bản ghi ca bệnh từ CSV"}


def _save_forecast_to_db(forecast_result: dict, demand_df, scale_factor: float, db: Session):
    """
    Lưu kết quả dự báo vào database để Dashboard hiển thị.
    
    Ghi vào:
    - disease_forecasts: số ca bệnh dự báo
    - supply_requirements: nhu cầu vật tư dự báo
    """
    from app.models.disease_forecast import DiseaseForecast
    from app.models.supply_requirement import SupplyRequirement
    from app.models.medical_supply import MedicalSupply
    from datetime import date, timedelta
    
    try:
        target_month = forecast_result.get('target_month', date.today().month)
        target_year = forecast_result.get('target_year', date.today().year)
        
        # Generate dates for the forecast period
        start_date = date(target_year, target_month, 1)
        period = forecast_result.get('forecast_period', 'month')
        if period == 'tomorrow':
            days = 1
        elif period == '7days':
            days = 7
        else:
            days = 30
        
        # Clear old forecasts for this period
        end_date = start_date + timedelta(days=days)
        db.query(DiseaseForecast).filter(
            DiseaseForecast.forecast_date >= start_date,
            DiseaseForecast.forecast_date <= end_date
        ).delete()
        
        # Save disease forecasts (spread across days)
        predictions = forecast_result.get('predictions', {})
        for disease_type, pred in predictions.items():
            if not isinstance(pred, dict) or 'predicted_cases' not in pred:
                continue

            # Lấy metrics thực từ kết quả huấn luyện (kèm trong predict result)
            metrics = pred.get('model_metrics') or {}
            mae_val = float(metrics.get('mae') or 0)
            rmse_val = float(metrics.get('rmse') or 0)
            mape_val = float(metrics.get('mape') or 0)

            daily_cases = max(1, pred['predicted_cases'] // max(1, days))

            for d in range(days):
                forecast_date = start_date + timedelta(days=d)
                fc = DiseaseForecast(
                    forecast_date=forecast_date,
                    disease_type=disease_type,
                    predicted_cases=daily_cases,
                    confidence_lower=max(0, int(daily_cases * 0.8)),
                    confidence_upper=int(daily_cases * 1.2),
                    model_used='monthly_forecaster_v2',
                    model_accuracy_mae=round(mae_val, 2),
                    model_accuracy_rmse=round(rmse_val, 2),
                    model_accuracy_mape=round(mape_val, 2),
                    forecast_period_days=days,
                )
                db.add(fc)
        
        # Save supply requirements
        if demand_df is not None and not demand_df.empty:
            # Clear old requirements
            db.query(SupplyRequirement).filter(
                SupplyRequirement.requirement_date >= start_date,
                SupplyRequirement.requirement_date <= end_date
            ).delete()
            
            for _, row in demand_df.iterrows():
                drug_name = row.get('DrugName', '')
                qty = int(row.get('total_safety', row.get('total_predicted', 0)))
                
                # Find supply_id
                supply = db.query(MedicalSupply).filter(MedicalSupply.name == drug_name).first()
                supply_id = supply.id if supply else None
                
                if supply_id and qty > 0:
                    daily_qty = max(1, qty // max(1, days))
                    for d in range(min(days, 7)):  # Only first 7 days to avoid too many records
                        req = SupplyRequirement(
                            supply_id=supply_id,
                            required_quantity=daily_qty,
                            requirement_date=start_date + timedelta(days=d),
                        )
                        db.add(req)
        
        db.commit()
        logger.info("Forecast saved to database for Dashboard")
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving forecast to DB: {e}")


@router.post("/predict")
async def predict_next_month(
    request: PredictRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Dự báo số ca bệnh tháng tới.
    
    Bước 3-4 trong pipeline:
    3. Kết hợp thời tiết tháng trước + dự báo thời tiết tháng tới
    4. Dự báo số ca bệnh + nhu cầu vật tư
    
    Input:
    - Nhiệt độ, độ ẩm, lượng mưa tháng trước (actual)
    - Dự báo thời tiết tháng tới
    - Tháng mục tiêu
    
    Output:
    - Số ca bệnh dự kiến theo nhóm bệnh
    - Nhu cầu vật tư/thuốc cụ thể
    """
    logger.info(f"Predict request by user {current_user.username} for month {request.target_month}")
    
    service = get_forecasting_service()
    
    if not service.is_trained:
        raise HTTPException(
            status_code=400, 
            detail="Models chưa được train. Gọi POST /train trước."
        )
    
    try:
        # Forecast cases
        forecast_result = service.forecast_next_month(
            prev_month_weather=request.prev_month_weather.model_dump(),
            forecast_weather=request.forecast_weather.model_dump(),
            target_month=request.target_month,
            target_year=request.target_year
        )
        
        # Scale predictions based on forecast period
        period = request.forecast_period or 'month'
        scale_factor = 1.0
        period_label = 'tháng'
        if period == 'tomorrow':
            scale_factor = 1.0 / 30.0  # 1 day out of 30
            period_label = 'ngày mai'
        elif period == '7days':
            scale_factor = 7.0 / 30.0  # 7 days out of 30
            period_label = '7 ngày tới'
        
        # Scale the predictions
        if scale_factor != 1.0:
            forecast_result['total_predicted_cases'] = int(forecast_result['total_predicted_cases'] * scale_factor)
            for disease_type, pred in forecast_result['predictions'].items():
                if isinstance(pred, dict) and 'predicted_cases' in pred:
                    pred['predicted_cases'] = int(pred['predicted_cases'] * scale_factor)
                    pred['confidence_lower'] = int(pred['confidence_lower'] * scale_factor)
                    pred['confidence_upper'] = int(pred['confidence_upper'] * scale_factor)
        
        forecast_result['forecast_period'] = period
        forecast_result['period_label'] = period_label
        
        # Calculate supply demand (also scaled)
        demand_df = service.calculate_supply_demand(forecast_result)
        
        # Scale supply demand
        if scale_factor != 1.0 and not demand_df.empty:
            demand_df['total_predicted'] = demand_df['total_predicted'] * scale_factor
            demand_df['total_safety'] = demand_df['total_safety'] * scale_factor
        
        # Save forecast to database for Dashboard
        _save_forecast_to_db(forecast_result, demand_df, scale_factor, db)
        
        return {
            "status": "success",
            "forecast": forecast_result,
            "supply_demand": demand_df.to_dict('records') if not demand_df.empty else []
        }
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/full-pipeline")
async def run_full_pipeline(
    request: FullPipelineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Chạy toàn bộ pipeline từ đầu đến cuối.
    
    1. Load CSV → Trích xuất dữ liệu
    2. Train models
    3. Dự báo số ca bệnh
    4. Tính nhu cầu vật tư
    5. So sánh với tồn kho
    6. Đề xuất nhập hàng / duy trì / giảm nhập
    7. Tự động tạo cảnh báo cho vật tư thiếu hụt
    """
    logger.info(f"Full pipeline request by user {current_user.username}")
    
    try:
        service = get_forecasting_service()
        
        result = service.run_full_pipeline(
            prev_month_weather=request.prev_month_weather.model_dump(),
            forecast_weather=request.forecast_weather.model_dump(),
            target_month=request.target_month,
            target_year=request.target_year,
            current_inventory=request.current_inventory
        )
        
        # Persist forecast result so other modules (Báo cáo, Cảnh báo) có data
        forecast_ids = _persist_disease_forecasts(result, db)
        requirements_created = _persist_supply_requirements(result, forecast_ids, db)

        # Auto-generate alerts for critical/warning items
        alerts_created = _generate_alerts_from_comparison(result, db)
        result['alerts_created'] = alerts_created
        result['forecasts_persisted'] = len(forecast_ids)
        result['requirements_persisted'] = requirements_created
        
        return {
            "status": "success",
            "result": result
        }
        
    except Exception as e:
        logger.error(f"Pipeline error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")


def _generate_alerts_from_comparison(pipeline_result: dict, db: Session) -> int:
    """
    Tự động tạo cảnh báo từ kết quả so sánh tồn kho.
    Vật tư 'Nguy hiểm' → alert severity 'critical'
    Vật tư 'Cảnh báo' → alert severity 'high'
    """
    from app.models.alert import Alert
    from app.models.medical_supply import MedicalSupply
    from datetime import date, timedelta
    
    inv_comparison = pipeline_result.get('inventory_comparison')
    if not inv_comparison:
        return 0
    
    suggestions = inv_comparison.get('suggestions', [])
    if not suggestions:
        return 0
    
    alerts_created = 0
    
    for item in suggestions:
        status = item.get('status', '')
        if status not in ('Nguy hiểm', 'Cảnh báo'):
            continue
        
        drug_name = item.get('DrugName', '')
        if not drug_name:
            continue
        
        # Find supply in database
        supply = db.query(MedicalSupply).filter(MedicalSupply.name == drug_name).first()
        if not supply:
            continue
        
        # Check if unresolved alert already exists
        existing = db.query(Alert).filter(
            Alert.supply_id == supply.id,
            Alert.is_resolved == False
        ).first()
        
        severity = 'critical' if status == 'Nguy hiểm' else 'high'
        current_stock = int(item.get('current_stock', 0))
        required_stock = int(item.get('safety_demand', 0))
        shortage_date = date.today() + timedelta(days=3 if severity == 'critical' else 7)
        message = item.get('note', f'{drug_name}: {status}')
        
        if existing:
            # Update existing alert
            existing.severity = severity
            existing.current_stock = current_stock
            existing.required_stock = required_stock
            existing.shortage_date = shortage_date
            existing.message = message
        else:
            # Create new alert
            alert = Alert(
                supply_id=supply.id,
                alert_type='shortage',
                severity=severity,
                current_stock=current_stock,
                required_stock=required_stock,
                shortage_date=shortage_date,
                message=message,
                is_resolved=False,
            )
            db.add(alert)
            alerts_created += 1
    
    try:
        db.commit()
        logger.info(f"Generated {alerts_created} alerts from pipeline comparison")
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating alerts: {e}")
    
    return alerts_created


def _persist_disease_forecasts(pipeline_result: dict, db: Session) -> dict[str, int]:
    """Persist forecast result into disease_forecasts table.

    Trả về mapping {disease_type: forecast_id} để liên kết supply_requirements.
    """
    from app.models.disease_forecast import DiseaseForecast
    from datetime import date

    forecast_section = pipeline_result.get('forecast') or {}
    predictions = forecast_section.get('predictions') or {}
    target_month = forecast_section.get('target_month')
    target_year = forecast_section.get('target_year')

    if not predictions or target_month is None or target_year is None:
        return {}

    try:
        forecast_date = date(int(target_year), int(target_month), 1)
    except Exception:
        forecast_date = date.today()

    ids: dict[str, int] = {}
    for disease_type, pred in predictions.items():
        try:
            row = DiseaseForecast(
                forecast_date=forecast_date,
                disease_type=disease_type,
                predicted_cases=int(pred.get('predicted_cases', 0)),
                confidence_lower=int(pred.get('confidence_lower', 0)) if pred.get('confidence_lower') is not None else None,
                confidence_upper=int(pred.get('confidence_upper', 0)) if pred.get('confidence_upper') is not None else None,
                model_used='ensemble',
                forecast_period_days=30,
            )
            db.add(row)
            db.flush()
            ids[disease_type] = row.id
        except Exception as exc:
            logger.warning(f"Skip forecast persist for {disease_type}: {exc}")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to persist forecasts: {exc}")
        return {}

    logger.info(f"Persisted {len(ids)} disease forecasts")
    return ids


def _persist_supply_requirements(
    pipeline_result: dict,
    forecast_ids: dict[str, int],
    db: Session,
) -> int:
    """Persist supply demand result into supply_requirements table.

    Mỗi item trong supply_demand → một record SupplyRequirement, gắn vào
    forecast tương ứng nếu có (lấy disease_groups đầu tiên).
    """
    from app.models.supply_requirement import SupplyRequirement
    from app.models.medical_supply import MedicalSupply
    from datetime import date

    supply_demand = pipeline_result.get('supply_demand') or []
    if not supply_demand:
        return 0

    forecast_section = pipeline_result.get('forecast') or {}
    target_month = forecast_section.get('target_month')
    target_year = forecast_section.get('target_year')
    try:
        requirement_date = date(int(target_year), int(target_month), 1)
    except Exception:
        requirement_date = date.today()

    created = 0
    for item in supply_demand:
        drug_name = item.get('DrugName')
        if not drug_name:
            continue

        # Find or create supply record
        supply = db.query(MedicalSupply).filter(MedicalSupply.name == drug_name).first()
        if not supply:
            short = drug_name[:50]
            supply = (
                db.query(MedicalSupply)
                .filter(MedicalSupply.name.contains(short))
                .first()
            )
        if not supply:
            supply = MedicalSupply(
                name=drug_name,
                category='general',
                unit=item.get('UnitOfMeasure', ''),
                description='Auto-created by forecast pipeline',
            )
            db.add(supply)
            db.flush()

        # Map to forecast id by disease_groups (first group only)
        disease_groups = (item.get('disease_groups') or '').split(',')
        primary_disease = disease_groups[0].strip() if disease_groups else None
        forecast_id = forecast_ids.get(primary_disease) if primary_disease else None

        # Avoid duplicates: replace existing same-day record
        existing = (
            db.query(SupplyRequirement)
            .filter(
                SupplyRequirement.supply_id == supply.id,
                SupplyRequirement.requirement_date == requirement_date,
            )
            .first()
        )
        required_qty = int(round(float(item.get('total_safety') or item.get('total_predicted') or 0)))
        if existing:
            existing.required_quantity = required_qty
            existing.forecast_id = forecast_id
            existing.disease_type = primary_disease
        else:
            db.add(
                SupplyRequirement(
                    forecast_id=forecast_id,
                    supply_id=supply.id,
                    required_quantity=required_qty,
                    requirement_date=requirement_date,
                    disease_type=primary_disease,
                )
            )
            created += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to persist supply requirements: {exc}")
        return 0

    logger.info(f"Persisted {created} new supply requirements")
    return created


@router.get("/ratios")
async def get_conversion_ratios(
    nhom_benh: Optional[str] = Query(None, description="Filter by nhóm bệnh"),
    top_n: int = Query(20, description="Top N items"),
    current_user: User = Depends(get_current_user)
):
    """
    Xem conversion ratios thực tế (học từ dữ liệu CSV).
    
    Hiển thị: Mỗi ca bệnh nhóm X trung bình dùng bao nhiêu vật tư Y.
    """
    service = get_forecasting_service()
    
    if not service.is_data_loaded:
        raise HTTPException(
            status_code=400,
            detail="Data chưa load. Gọi POST /train trước."
        )
    
    ratios = service.supply_calculator.ratios
    
    if nhom_benh:
        ratios = ratios[ratios['NhomBenh'] == nhom_benh]
    
    ratios = ratios.head(top_n)
    
    return {
        "status": "success",
        "ratios": ratios.to_dict('records'),
        "total": len(ratios)
    }


@router.get("/monthly-data")
async def get_monthly_data(
    current_user: User = Depends(get_current_user)
):
    """
    Xem dữ liệu tháng đã trích xuất từ CSV.
    
    Hiển thị số ca bệnh theo tháng cho từng nhóm bệnh.
    """
    service = get_forecasting_service()
    
    if not service.is_data_loaded:
        raise HTTPException(
            status_code=400,
            detail="Data chưa load. Gọi POST /train trước."
        )
    
    monthly = service.monthly_summary.copy()
    # Convert Period to string for JSON serialization
    monthly['YearMonth'] = monthly['YearMonth'].astype(str)
    
    return {
        "status": "success",
        "monthly_data": monthly.to_dict('records'),
        "total_months": len(monthly)
    }


@router.get("/status")
async def get_service_status(
    current_user: User = Depends(get_current_user)
):
    """Kiểm tra trạng thái service."""
    service = get_forecasting_service()
    
    return {
        "is_data_loaded": service.is_data_loaded,
        "is_trained": service.is_trained,
        "models_available": list(service.forecasters.keys()),
        "csv_dir": str(service.csv_dir),
    }


@router.post("/upload-inventory-csv")
async def upload_inventory_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload file CSV tồn kho hiện tại.
    
    File CSV cần có cột: DrugName, CurrentStock (hoặc TenThuoc, TonKho)
    Hệ thống sẽ đọc và dùng cho bước so sánh.
    """
    import csv
    import io
    
    logger.info(f"Inventory CSV upload by user {current_user.username}")
    
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File phải có định dạng .csv")
    
    try:
        content = await file.read()
        text = content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(text))
        
        inventory = {}
        rows_read = 0
        
        for row in reader:
            # Support multiple column name formats
            name = (row.get('DrugName') or row.get('TenThuoc') or 
                   row.get('drug_name') or row.get('name') or '').strip()
            stock = (row.get('CurrentStock') or row.get('TonKho') or 
                    row.get('current_stock') or row.get('stock') or '0')
            
            if name:
                try:
                    inventory[name] = float(stock)
                    rows_read += 1
                except ValueError:
                    pass
        
        # Store in service for later use
        service = get_forecasting_service()
        service._uploaded_inventory = inventory
        
        return {
            "status": "success",
            "message": f"Đã đọc {rows_read} vật tư từ file tồn kho",
            "items_count": rows_read,
            "sample": dict(list(inventory.items())[:5])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file: {str(e)}")


class ImportToInventoryRequest(BaseModel):
    items: list = Field(..., description="Danh sách vật tư cần nhập")


@router.post("/import-to-inventory")
async def import_to_inventory(
    request: ImportToInventoryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Nhập số lượng đề xuất vào tồn kho (database).
    
    Tạo hoặc cập nhật medical_supplies + inventory records.
    Sau khi nhập, tự động resolve các cảnh báo thiếu hụt cho các vật tư
    vừa được nhập.
    """
    from app.models.medical_supply import MedicalSupply
    from app.models.inventory import Inventory
    from app.models.alert import Alert
    from datetime import datetime, timezone
    
    logger.info(f"Import to inventory by user {current_user.username}: {len(request.items)} items")
    
    imported = 0
    updated = 0
    affected_supply_ids: list[int] = []
    
    for item in request.items:
        drug_name = item.get('drug_name', '')
        quantity = int(item.get('quantity', 0))
        unit = item.get('unit', '')
        
        if not drug_name or quantity <= 0:
            continue
        
        # Find or create medical supply (try exact match first, then partial)
        supply = db.query(MedicalSupply).filter(MedicalSupply.name == drug_name).first()
        if not supply:
            # Try partial match (first 50 chars)
            short_name = drug_name[:50] if len(drug_name) > 50 else drug_name
            supply = db.query(MedicalSupply).filter(MedicalSupply.name.contains(short_name)).first()
        
        if not supply:
            supply = MedicalSupply(
                name=drug_name,
                category='general',
                unit=unit,
                description='Auto-imported from forecast suggestion',
            )
            db.add(supply)
            db.flush()
            imported += 1
        
        affected_supply_ids.append(supply.id)
        
        # Find or create inventory record
        inv = db.query(Inventory).filter(Inventory.supply_id == supply.id).first()
        if inv:
            inv.current_stock = (inv.current_stock or 0) + quantity
            updated += 1
        else:
            inv = Inventory(
                supply_id=supply.id,
                current_stock=quantity,
                safety_stock=int(quantity * 0.2),  # 20% safety stock
            )
            db.add(inv)
            imported += 1
    
    # Auto-resolve open alerts for the supplies that were just topped up.
    # Người dùng đã chủ động nhập số đề xuất, coi như đã xử lý xong các cảnh báo
    # liên quan đến những vật tư đó.
    alerts_resolved = 0
    if affected_supply_ids:
        open_alerts = (
            db.query(Alert)
            .filter(
                Alert.supply_id.in_(affected_supply_ids),
                Alert.is_resolved == False,  # noqa: E712
            )
            .all()
        )
        now = datetime.now(timezone.utc)
        for alert in open_alerts:
            alert.is_resolved = True
            alert.resolved_at = now
            alerts_resolved += 1
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi lưu database: {str(e)}")
    
    return {
        "status": "success",
        "message": (
            f"Đã nhập {imported} vật tư mới, cập nhật {updated} vật tư"
            + (f", xử lý {alerts_resolved} cảnh báo" if alerts_resolved else "")
        ),
        "imported": imported,
        "updated": updated,
        "alerts_resolved": alerts_resolved,
        "total_items": len(request.items)
    }


@router.get("/correlation")
async def get_correlation_analysis(
    disease_type: str = Query("total_cases", description="Column ca bệnh (total_cases, cases_respiratory, etc.)"),
    current_user: User = Depends(get_current_user)
):
    """
    Phân tích tương quan thời tiết - số ca bệnh.
    
    Trả về:
    - Hệ số tương quan Pearson & Spearman cho từng yếu tố (nhiệt độ, độ ẩm, mưa, AQI)
    - Phân tích độ trễ (lag): thời tiết tháng trước ảnh hưởng tháng sau?
    - Yếu tố ảnh hưởng mạnh nhất
    - Data cho biểu đồ scatter
    """
    service = get_forecasting_service()
    
    if not service.is_data_loaded:
        raise HTTPException(
            status_code=400,
            detail="Data chưa load. Gọi POST /train trước."
        )
    
    try:
        from app.ai_engine.correlation_analyzer import CorrelationAnalyzer
        from app.ai_engine.weather_forecast import WeatherForecast
        
        # Build weather data for the months we have
        weather_service = WeatherForecast()
        months = service.monthly_summary['YearMonth'].tolist()
        weather_df = weather_service.build_weather_dataframe(months)
        
        # Run correlation analysis
        analyzer = CorrelationAnalyzer()
        results = analyzer.analyze(
            monthly_cases=service.monthly_summary,
            weather_data=weather_df,
            disease_type=disease_type
        )
        
        # Also get seasonal analysis (no weather needed)
        seasonal = analyzer.analyze_without_weather_api(
            monthly_cases=service.monthly_summary,
            disease_type=disease_type
        )
        
        return {
            "status": "success",
            "correlation_analysis": results,
            "seasonal_analysis": seasonal
        }
        
    except Exception as e:
        logger.error(f"Correlation analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/weather-forecast")
async def get_weather_forecast(
    target_month: int = Query(..., ge=1, le=12, description="Tháng cần dự báo"),
    target_year: Optional[int] = Query(None, description="Năm"),
    current_user: User = Depends(get_current_user)
):
    """
    Lấy dự báo thời tiết tháng tiếp theo.
    
    Thử gọi OpenWeatherMap API, nếu không có key thì dùng 
    dữ liệu climate trung bình lịch sử TP.HCM.
    """
    try:
        from app.ai_engine.weather_forecast import WeatherForecast
        
        weather_service = WeatherForecast()
        
        forecast = weather_service.get_forecast(
            target_month=target_month,
            target_year=target_year
        )
        
        # Also get previous month weather
        prev_month = target_month - 1 if target_month > 1 else 12
        prev_weather = weather_service.get_current_month_weather(prev_month)
        
        return {
            "status": "success",
            "target_month": target_month,
            "forecast_weather": forecast,
            "prev_month_weather": prev_weather,
            "note": "Dùng dữ liệu này làm input cho /predict endpoint"
        }
        
    except Exception as e:
        logger.error(f"Weather forecast error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Weather forecast failed: {str(e)}")
