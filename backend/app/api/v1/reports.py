"""
Reports API endpoints.

Provides analytical reports for the MedForecast AI system, including
consumption analytics, forecast accuracy over time, inventory turnover,
and PDF export functionality.

All report endpoints support date range and location filtering.

Routes
------
GET  /api/v1/reports/consumption         – Consumption report by supply category
GET  /api/v1/reports/forecast-accuracy   – Forecast accuracy metrics over time
GET  /api/v1/reports/inventory-turnover  – Inventory turnover rates
POST /api/v1/reports/export              – Export any report to PDF
"""

import io
import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.disease_forecast import DiseaseForecast
from app.models.inventory import Inventory
from app.models.medical_supply import MedicalSupply
from app.models.supply_requirement import SupplyRequirement
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reports"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _default_date_range(
    start_date: Optional[date],
    end_date: Optional[date],
    default_days_back: int = 30,
    default_days_forward: int = 60,
):
    """Return (start, end) dates spanning past consumption + future forecast.

    Mặc định mở rộng đến ngày hiện tại + 60 ngày để bao gồm cả các yêu cầu vật
    tư đã được dự báo cho tương lai (supply_requirements / disease_forecasts).
    """
    today = date.today()
    end = end_date or (today + timedelta(days=default_days_forward))
    start = start_date or (today - timedelta(days=default_days_back))
    return start, end


# ── Consumption Report ────────────────────────────────────────────────────────

@router.get("/consumption")
async def get_consumption_report(
    start_date: Optional[date] = Query(None, description="Report start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Report end date (YYYY-MM-DD)"),
    location: Optional[str] = Query(None, description="Filter by inventory location"),
    category: Optional[str] = Query(None, description="Filter by supply category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Return a consumption report showing supply usage aggregated by category.

    The report is built from ``supply_requirements`` records, which represent
    forecasted demand (i.e., how much of each supply is expected to be consumed).

    Filters
    -------
    start_date : beginning of the reporting period (default: 30 days ago)
    end_date   : end of the reporting period (default: today)
    location   : filter inventory by warehouse / location field
    category   : filter supplies by category
    """
    start, end = _default_date_range(start_date, end_date)

    logger.info(
        "Consumption report requested by user=%s period=%s to %s location=%s category=%s",
        current_user.username, start, end, location, category,
    )

    # Aggregate required quantities grouped by category and supply
    query = (
        db.query(
            MedicalSupply.category,
            MedicalSupply.name.label("supply_name"),
            MedicalSupply.unit,
            func.sum(SupplyRequirement.required_quantity).label("total_required"),
            func.count(func.distinct(SupplyRequirement.requirement_date)).label("active_days"),
        )
        .join(SupplyRequirement, SupplyRequirement.supply_id == MedicalSupply.id)
        .filter(
            SupplyRequirement.requirement_date >= start,
            SupplyRequirement.requirement_date <= end,
        )
    )

    if category:
        query = query.filter(MedicalSupply.category == category)

    # Location filter: join inventory if location is provided
    if location:
        query = query.join(
            Inventory,
            Inventory.supply_id == MedicalSupply.id,
        ).filter(Inventory.location == location)

    rows = (
        query
        .group_by(MedicalSupply.category, MedicalSupply.name, MedicalSupply.unit)
        .order_by(MedicalSupply.category, MedicalSupply.name)
        .all()
    )

    # Group into category buckets
    category_map: Dict[str, Dict] = {}
    for row in rows:
        cat = row.category
        if cat not in category_map:
            category_map[cat] = {
                "category": cat,
                "total_required": 0,
                "supplies": [],
            }
        item = {
            "supply_name": row.supply_name,
            "unit": row.unit,
            "total_required": int(row.total_required or 0),
            "active_days": int(row.active_days or 0),
            "avg_daily_consumption": round(
                (row.total_required or 0) / max(int(row.active_days or 1), 1), 2
            ),
        }
        category_map[cat]["supplies"].append(item)
        category_map[cat]["total_required"] += item["total_required"]

    categories_list = sorted(category_map.values(), key=lambda c: -c["total_required"])
    grand_total = sum(c["total_required"] for c in categories_list)

    return {
        "report_type": "consumption",
        "period": {"start_date": str(start), "end_date": str(end)},
        "filters": {"location": location, "category": category},
        "summary": {
            "total_required_across_all_categories": grand_total,
            "categories_count": len(categories_list),
        },
        "categories": categories_list,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ── Forecast Accuracy Report ──────────────────────────────────────────────────

@router.get("/forecast-accuracy")
async def get_forecast_accuracy_report(
    start_date: Optional[date] = Query(None, description="Report start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Report end date (YYYY-MM-DD)"),
    disease_type: Optional[str] = Query(
        None,
        description="Filter by disease type: dengue_fever, seasonal_flu, respiratory_disease",
    ),
    model_used: Optional[str] = Query(
        None,
        description="Filter by model: xgboost, lstm, prophet, ensemble",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Return forecast accuracy metrics over time.

    Shows MAE, RMSE, and MAPE trends for each model, broken down by disease
    type.  Useful for monitoring model performance degradation over time.

    Filters
    -------
    start_date   : start of the reporting period (default: 30 days ago)
    end_date     : end of the reporting period (default: today)
    disease_type : restrict to a specific disease
    model_used   : restrict to a specific model name
    """
    start, end = _default_date_range(start_date, end_date)

    logger.info(
        "Forecast accuracy report requested by user=%s period=%s to %s "
        "disease_type=%s model_used=%s",
        current_user.username, start, end, disease_type, model_used,
    )

    query = (
        db.query(
            DiseaseForecast.forecast_date,
            DiseaseForecast.disease_type,
            DiseaseForecast.model_used,
            DiseaseForecast.model_accuracy_mae,
            DiseaseForecast.model_accuracy_rmse,
            DiseaseForecast.model_accuracy_mape,
            DiseaseForecast.predicted_cases,
            DiseaseForecast.confidence_lower,
            DiseaseForecast.confidence_upper,
        )
        .filter(
            DiseaseForecast.forecast_date >= start,
            DiseaseForecast.forecast_date <= end,
        )
    )

    if disease_type:
        query = query.filter(DiseaseForecast.disease_type == disease_type)
    if model_used:
        query = query.filter(DiseaseForecast.model_used == model_used)

    rows = query.order_by(DiseaseForecast.forecast_date).all()

    # Aggregate per model
    model_stats: Dict[str, Dict] = {}
    time_series: List[Dict] = []

    for row in rows:
        model = row.model_used or "unknown"
        if model not in model_stats:
            model_stats[model] = {
                "model": model,
                "sample_count": 0,
                "mae_values": [],
                "rmse_values": [],
                "mape_values": [],
            }
        stats = model_stats[model]
        stats["sample_count"] += 1
        if row.model_accuracy_mae is not None:
            stats["mae_values"].append(float(row.model_accuracy_mae))
        if row.model_accuracy_rmse is not None:
            stats["rmse_values"].append(float(row.model_accuracy_rmse))
        if row.model_accuracy_mape is not None:
            stats["mape_values"].append(float(row.model_accuracy_mape))

        time_series.append({
            "date": str(row.forecast_date),
            "disease_type": row.disease_type,
            "model": model,
            "predicted_cases": row.predicted_cases,
            "confidence_lower": row.confidence_lower,
            "confidence_upper": row.confidence_upper,
            "mae": float(row.model_accuracy_mae) if row.model_accuracy_mae is not None else None,
            "rmse": float(row.model_accuracy_rmse) if row.model_accuracy_rmse is not None else None,
            "mape": float(row.model_accuracy_mape) if row.model_accuracy_mape is not None else None,
        })

    # Compute averages per model
    model_summary = []
    for model, stats in model_stats.items():
        mae_vals = stats["mae_values"]
        rmse_vals = stats["rmse_values"]
        mape_vals = stats["mape_values"]
        model_summary.append({
            "model": model,
            "sample_count": stats["sample_count"],
            "avg_mae": round(sum(mae_vals) / len(mae_vals), 4) if mae_vals else None,
            "avg_rmse": round(sum(rmse_vals) / len(rmse_vals), 4) if rmse_vals else None,
            "avg_mape": round(sum(mape_vals) / len(mape_vals), 4) if mape_vals else None,
            "min_mae": round(min(mae_vals), 4) if mae_vals else None,
            "min_rmse": round(min(rmse_vals), 4) if rmse_vals else None,
        })

    # Best model by lowest avg MAPE
    best_model = None
    if model_summary:
        ranked = sorted(
            [m for m in model_summary if m["avg_mape"] is not None],
            key=lambda m: m["avg_mape"],
        )
        if ranked:
            best_model = ranked[0]["model"]

    return {
        "report_type": "forecast-accuracy",
        "period": {"start_date": str(start), "end_date": str(end)},
        "filters": {"disease_type": disease_type, "model_used": model_used},
        "summary": {
            "total_forecasts": len(rows),
            "models_evaluated": len(model_stats),
            "best_model_by_mape": best_model,
        },
        "model_performance": model_summary,
        "time_series": time_series,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ── Inventory Turnover Report ─────────────────────────────────────────────────

@router.get("/inventory-turnover")
async def get_inventory_turnover_report(
    start_date: Optional[date] = Query(None, description="Report start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Report end date (YYYY-MM-DD)"),
    location: Optional[str] = Query(None, description="Filter by inventory location"),
    category: Optional[str] = Query(None, description="Filter by supply category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Return inventory turnover rates for all (or filtered) supplies.

    Turnover rate is calculated as:
        turnover_rate = total_required / avg_current_stock

    A higher value means the supply is consumed faster relative to on-hand
    stock.  Supplies with zero stock are marked as "out_of_stock".

    Filters
    -------
    start_date : start of the demand period used for the numerator (default: 30 days ago)
    end_date   : end of the demand period (default: today)
    location   : filter by inventory location
    category   : filter by supply category
    """
    start, end = _default_date_range(start_date, end_date)
    period_days = max((end - start).days, 1)

    logger.info(
        "Inventory turnover report requested by user=%s period=%s to %s "
        "location=%s category=%s",
        current_user.username, start, end, location, category,
    )

    # Build base query: join inventory → supply, optionally filter location
    inv_query = (
        db.query(
            Inventory.supply_id,
            Inventory.current_stock,
            Inventory.safety_stock,
            Inventory.location,
            MedicalSupply.name.label("supply_name"),
            MedicalSupply.category,
            MedicalSupply.unit,
            MedicalSupply.unit_price,
        )
        .join(MedicalSupply, MedicalSupply.id == Inventory.supply_id)
    )

    if location:
        inv_query = inv_query.filter(Inventory.location == location)
    if category:
        inv_query = inv_query.filter(MedicalSupply.category == category)

    inventory_rows = inv_query.all()

    # Get total demand per supply over the period
    demand_query = (
        db.query(
            SupplyRequirement.supply_id,
            func.sum(SupplyRequirement.required_quantity).label("total_required"),
        )
        .filter(
            SupplyRequirement.requirement_date >= start,
            SupplyRequirement.requirement_date <= end,
        )
        .group_by(SupplyRequirement.supply_id)
    )
    demand_map: Dict[int, int] = {
        row.supply_id: int(row.total_required or 0) for row in demand_query.all()
    }

    items = []
    for row in inventory_rows:
        sid = row.supply_id
        total_required = demand_map.get(sid, 0)
        current_stock = row.current_stock or 0
        safety_stock = row.safety_stock or 0
        unit_price = float(row.unit_price) if row.unit_price else 0.0

        if current_stock > 0:
            turnover_rate = round(total_required / current_stock, 4)
        else:
            turnover_rate = None  # out of stock

        days_of_supply = None
        if total_required > 0 and current_stock > 0:
            daily_demand = total_required / period_days
            days_of_supply = round(current_stock / daily_demand, 1)

        stock_status = "out_of_stock" if current_stock <= 0 else (
            "critical" if current_stock < safety_stock else "safe"
        )

        items.append({
            "supply_id": sid,
            "supply_name": row.supply_name,
            "category": row.category,
            "unit": row.unit,
            "location": row.location,
            "current_stock": current_stock,
            "safety_stock": safety_stock,
            "total_required_in_period": total_required,
            "turnover_rate": turnover_rate,
            "days_of_supply": days_of_supply,
            "stock_value": round(current_stock * unit_price, 2),
            "stock_status": stock_status,
        })

    # Sort: highest turnover first (None at end)
    items.sort(
        key=lambda x: (x["turnover_rate"] is None, -(x["turnover_rate"] or 0))
    )

    high_turnover = [i for i in items if i["turnover_rate"] is not None and i["turnover_rate"] > 1.0]
    out_of_stock = [i for i in items if i["stock_status"] == "out_of_stock"]
    avg_turnover = (
        round(sum(i["turnover_rate"] for i in items if i["turnover_rate"] is not None)
              / max(len([i for i in items if i["turnover_rate"] is not None]), 1), 4)
        if items else 0.0
    )

    return {
        "report_type": "inventory-turnover",
        "period": {"start_date": str(start), "end_date": str(end), "period_days": period_days},
        "filters": {"location": location, "category": category},
        "summary": {
            "total_items": len(items),
            "avg_turnover_rate": avg_turnover,
            "high_turnover_items": len(high_turnover),
            "out_of_stock_items": len(out_of_stock),
        },
        "items": items,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ── Export Report ─────────────────────────────────────────────────────────────

class ReportExportRequest:
    """Simple holder – we use a Pydantic model below."""


from pydantic import BaseModel


class ExportReportRequest(BaseModel):
    """Request body for PDF report export."""

    report_type: str
    """One of: consumption, forecast-accuracy, inventory-turnover."""

    start_date: Optional[date] = None
    end_date: Optional[date] = None
    location: Optional[str] = None
    category: Optional[str] = None
    disease_type: Optional[str] = None
    model_used: Optional[str] = None


@router.post("/export")
async def export_report(
    payload: ExportReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """
    Generate a formatted PDF report for the requested report type.

    Supported report types
    ----------------------
    - ``consumption``         – usage by supply category
    - ``forecast-accuracy``   – model performance metrics over time
    - ``inventory-turnover``  – turnover rates per supply

    The same date / location / category filters apply as in the individual
    GET endpoints.  Returns a binary PDF download.
    """
    SUPPORTED_TYPES = {"consumption", "forecast-accuracy", "inventory-turnover"}
    if payload.report_type not in SUPPORTED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported report_type '{payload.report_type}'. "
                   f"Must be one of: {sorted(SUPPORTED_TYPES)}",
        )

    logger.info(
        "Export report type=%s requested by user=%s",
        payload.report_type, current_user.username,
    )

    start, end = _default_date_range(payload.start_date, payload.end_date)

    if payload.report_type == "consumption":
        data = await _build_consumption_data(
            db, start, end, payload.location, payload.category
        )
        return _render_consumption_pdf(data, start, end)

    elif payload.report_type == "forecast-accuracy":
        data = await _build_accuracy_data(
            db, start, end, payload.disease_type, payload.model_used
        )
        return _render_accuracy_pdf(data, start, end)

    else:  # inventory-turnover
        data = await _build_turnover_data(
            db, start, end, payload.location, payload.category
        )
        return _render_turnover_pdf(data, start, end)


# ── Internal data-fetching helpers (reused by export) ────────────────────────

async def _build_consumption_data(
    db: Session,
    start: date,
    end: date,
    location: Optional[str],
    category: Optional[str],
) -> List[Dict]:
    query = (
        db.query(
            MedicalSupply.category,
            MedicalSupply.name.label("supply_name"),
            MedicalSupply.unit,
            func.sum(SupplyRequirement.required_quantity).label("total_required"),
        )
        .join(SupplyRequirement, SupplyRequirement.supply_id == MedicalSupply.id)
        .filter(
            SupplyRequirement.requirement_date >= start,
            SupplyRequirement.requirement_date <= end,
        )
    )
    if category:
        query = query.filter(MedicalSupply.category == category)
    if location:
        query = query.join(Inventory, Inventory.supply_id == MedicalSupply.id).filter(
            Inventory.location == location
        )
    return query.group_by(
        MedicalSupply.category, MedicalSupply.name, MedicalSupply.unit
    ).order_by(MedicalSupply.category, MedicalSupply.name).all()


async def _build_accuracy_data(
    db: Session,
    start: date,
    end: date,
    disease_type: Optional[str],
    model_used: Optional[str],
) -> list:
    query = db.query(DiseaseForecast).filter(
        DiseaseForecast.forecast_date >= start,
        DiseaseForecast.forecast_date <= end,
    )
    if disease_type:
        query = query.filter(DiseaseForecast.disease_type == disease_type)
    if model_used:
        query = query.filter(DiseaseForecast.model_used == model_used)
    return query.order_by(DiseaseForecast.forecast_date).all()


async def _build_turnover_data(
    db: Session,
    start: date,
    end: date,
    location: Optional[str],
    category: Optional[str],
) -> list:
    inv_query = (
        db.query(
            Inventory.supply_id,
            Inventory.current_stock,
            Inventory.safety_stock,
            Inventory.location,
            MedicalSupply.name.label("supply_name"),
            MedicalSupply.category,
            MedicalSupply.unit,
        )
        .join(MedicalSupply, MedicalSupply.id == Inventory.supply_id)
    )
    if location:
        inv_query = inv_query.filter(Inventory.location == location)
    if category:
        inv_query = inv_query.filter(MedicalSupply.category == category)

    rows = inv_query.all()

    demand_map: Dict[int, int] = {
        row.supply_id: int(row.total_required or 0)
        for row in db.query(
            SupplyRequirement.supply_id,
            func.sum(SupplyRequirement.required_quantity).label("total_required"),
        )
        .filter(
            SupplyRequirement.requirement_date >= start,
            SupplyRequirement.requirement_date <= end,
        )
        .group_by(SupplyRequirement.supply_id)
        .all()
    }

    period_days = max((end - start).days, 1)
    result = []
    for row in rows:
        total_req = demand_map.get(row.supply_id, 0)
        cs = row.current_stock or 0
        turnover = round(total_req / cs, 4) if cs > 0 else None
        result.append({
            "supply_name": row.supply_name,
            "category": row.category,
            "unit": row.unit,
            "location": row.location or "",
            "current_stock": cs,
            "safety_stock": row.safety_stock or 0,
            "total_required": total_req,
            "turnover_rate": turnover,
        })
    result.sort(key=lambda x: (x["turnover_rate"] is None, -(x["turnover_rate"] or 0)))
    return result


# ── PDF rendering helpers ─────────────────────────────────────────────────────

def _get_reportlab():
    """Import reportlab or raise a clean 500 error."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Table,
            TableStyle,
            Paragraph,
            Spacer,
        )
        return colors, A4, landscape, getSampleStyleSheet, cm, SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="reportlab library not available for PDF export",
        )


def _base_table_style(colors):
    """Return a shared base TableStyle list."""
    return [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#EBF3FB")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]


def _render_consumption_pdf(rows: list, start: date, end: date) -> Response:
    colors, A4, landscape, getSampleStyleSheet, cm, SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer = _get_reportlab()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=1 * cm,
        rightMargin=1 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(
            f"Consumption Report – {start} to {end}  "
            f"(Generated {datetime.now().strftime('%Y-%m-%d %H:%M')})",
            styles["Title"],
        ),
        Spacer(1, 0.4 * cm),
    ]

    table_data = [["Category", "Supply Name", "Unit", "Total Required"]]
    for row in rows:
        table_data.append([
            row.category,
            row.supply_name,
            row.unit,
            str(int(row.total_required or 0)),
        ])

    if len(table_data) == 1:
        story.append(Paragraph("No consumption data found for the selected period.", styles["Normal"]))
    else:
        col_widths = [5 * cm, 8 * cm, 3 * cm, 4 * cm]
        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle(_base_table_style(colors)))
        story.append(tbl)

    doc.build(story)
    buf.seek(0)
    filename = f"consumption_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _render_accuracy_pdf(forecasts: list, start: date, end: date) -> Response:
    colors, A4, landscape, getSampleStyleSheet, cm, SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer = _get_reportlab()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=1 * cm,
        rightMargin=1 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(
            f"Forecast Accuracy Report – {start} to {end}  "
            f"(Generated {datetime.now().strftime('%Y-%m-%d %H:%M')})",
            styles["Title"],
        ),
        Spacer(1, 0.4 * cm),
    ]

    table_data = [["Date", "Disease Type", "Model", "Predicted Cases", "MAE", "RMSE", "MAPE (%)"]]
    for fc in forecasts:
        table_data.append([
            str(fc.forecast_date),
            fc.disease_type or "",
            fc.model_used or "",
            str(fc.predicted_cases),
            f"{float(fc.model_accuracy_mae):.2f}" if fc.model_accuracy_mae is not None else "-",
            f"{float(fc.model_accuracy_rmse):.2f}" if fc.model_accuracy_rmse is not None else "-",
            f"{float(fc.model_accuracy_mape):.2f}" if fc.model_accuracy_mape is not None else "-",
        ])

    if len(table_data) == 1:
        story.append(Paragraph("No forecast accuracy data found for the selected period.", styles["Normal"]))
    else:
        col_widths = [3 * cm, 4.5 * cm, 3.5 * cm, 4 * cm, 3 * cm, 3 * cm, 3.5 * cm]
        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle(_base_table_style(colors)))
        story.append(tbl)

    doc.build(story)
    buf.seek(0)
    filename = f"forecast_accuracy_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _render_turnover_pdf(items: list, start: date, end: date) -> Response:
    colors, A4, landscape, getSampleStyleSheet, cm, SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer = _get_reportlab()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=1 * cm,
        rightMargin=1 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(
            f"Inventory Turnover Report – {start} to {end}  "
            f"(Generated {datetime.now().strftime('%Y-%m-%d %H:%M')})",
            styles["Title"],
        ),
        Spacer(1, 0.4 * cm),
    ]

    table_data = [["Supply Name", "Category", "Unit", "Location", "Current Stock", "Safety Stock", "Required", "Turnover Rate"]]
    for item in items:
        turnover = f"{item['turnover_rate']:.4f}" if item["turnover_rate"] is not None else "N/A"
        table_data.append([
            item["supply_name"],
            item["category"],
            item["unit"],
            item["location"],
            str(item["current_stock"]),
            str(item["safety_stock"]),
            str(item["total_required"]),
            turnover,
        ])

    if len(table_data) == 1:
        story.append(Paragraph("No inventory data found for the selected filters.", styles["Normal"]))
    else:
        col_widths = [5 * cm, 3.5 * cm, 2 * cm, 3 * cm, 3 * cm, 3 * cm, 3 * cm, 3.5 * cm]
        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        style = _base_table_style(colors)
        # Colour turnover column: green > 1, orange 0.5-1, red < 0.5
        for row_num, item in enumerate(items, 1):
            rate = item["turnover_rate"]
            if rate is not None:
                if rate >= 1.0:
                    c = colors.green
                elif rate >= 0.5:
                    c = colors.orange
                else:
                    c = colors.red
                style.append(("TEXTCOLOR", (7, row_num), (7, row_num), c))
                style.append(("FONTNAME", (7, row_num), (7, row_num), "Helvetica-Bold"))
        tbl.setStyle(TableStyle(style))
        story.append(tbl)

    doc.build(story)
    buf.seek(0)
    filename = f"inventory_turnover_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
