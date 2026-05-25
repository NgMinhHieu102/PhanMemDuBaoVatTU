"""
Dashboard API endpoints.

Provides aggregated metrics for the MedForecast AI dashboard, including
overview KPIs, supply/demand time-series data, risk status breakdown, and
critical alerts.

All responses are cached in Redis for 5 minutes (CACHE_TTL = 300 seconds).
If Redis is unavailable the endpoints fall back to live database queries
without raising an error.

Routes
------
GET /api/v1/dashboard/overview        – KPI summary (totals, risk counts)
GET /api/v1/dashboard/supply-demand   – Time-series data for chart
GET /api/v1/dashboard/risk-status     – Safe / low / critical stock counts
GET /api/v1/dashboard/critical-alerts – Top unresolved critical alerts
"""

import json
import logging
import os
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.alert import Alert
from app.models.disease_case import DiseaseCase
from app.models.disease_forecast import DiseaseForecast
from app.models.inventory import Inventory
from app.models.medical_supply import MedicalSupply
from app.models.supply_requirement import SupplyRequirement
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["dashboard"])

# ── Redis caching ─────────────────────────────────────────────────────────────

CACHE_TTL = 300  # 5 minutes
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client: Optional[Any] = None


def _get_redis() -> Optional[Any]:
    """
    Return a Redis client, or None if Redis is unavailable.

    Connection is attempted once; subsequent calls reuse the cached client.
    A failed connection (Redis not running) is swallowed so the API still works.
    """
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis  # type: ignore

        client = redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        client.ping()  # validate connectivity
        _redis_client = client
        logger.info("Redis connected for dashboard caching.")
    except Exception as exc:
        logger.warning("Redis unavailable – dashboard caching disabled. Reason: %s", exc)
        _redis_client = None
    return _redis_client


def _cache_get(key: str) -> Optional[Any]:
    """Return cached value for *key*, or None on cache miss / Redis unavailable."""
    client = _get_redis()
    if client is None:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.debug("Cache GET failed for key=%s: %s", key, exc)
        return None


def _cache_set(key: str, value: Any) -> None:
    """Store *value* under *key* with CACHE_TTL expiry.  Silently fails if Redis is down."""
    client = _get_redis()
    if client is None:
        return
    try:
        client.setex(key, CACHE_TTL, json.dumps(value, default=str))
    except Exception as exc:
        logger.debug("Cache SET failed for key=%s: %s", key, exc)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stock_risk_level(current_stock: int, safety_stock: int) -> str:
    """
    Classify a single inventory row into a risk level.

    critical  – current stock ≤ 0
    low       – current stock > 0 but < safety_stock
    safe      – current stock ≥ safety_stock
    """
    if current_stock <= 0:
        return "critical"
    if current_stock < safety_stock:
        return "low"
    return "safe"


def _enrich_alert(alert: Alert) -> Dict:
    """Serialize an Alert ORM object to a plain dict for JSON serialisation."""
    return {
        "id": alert.id,
        "supply_id": alert.supply_id,
        "supply_name": alert.supply.name if alert.supply else None,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "current_stock": alert.current_stock,
        "required_stock": alert.required_stock,
        "shortage_date": str(alert.shortage_date) if alert.shortage_date else None,
        "message": alert.message,
        "is_resolved": alert.is_resolved,
        "created_at": str(alert.created_at),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_dashboard_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Return high-level KPI metrics for the dashboard overview panel.

    Metrics
    -------
    - total_supplies         : total distinct medical supplies in the system
    - total_inventory_value  : sum of (current_stock × unit_price) across all inventory
    - high_risk_shortages    : count of unresolved critical + high severity alerts
    - predicted_demand_30d   : sum of forecast predicted_cases for the next 30 days
    - disease_outbreaks      : count of disease types with cases recorded in the last 7 days
    - safe_stock_items       : inventory rows with current_stock ≥ safety_stock
    - low_stock_items        : inventory rows with 0 < current_stock < safety_stock
    - critical_risk_items    : inventory rows with current_stock ≤ 0
    - supply_risk_percentage : percentage of items that are low or critical risk
    """
    cache_key = "dashboard:overview"
    cached = _cache_get(cache_key)
    if cached:
        logger.debug("Cache hit: %s", cache_key)
        return cached

    logger.info("Building dashboard overview for user=%s", current_user.username)

    # 1. Total distinct supplies
    total_supplies: int = db.query(func.count(MedicalSupply.id)).scalar() or 0

    # 2. Total inventory value — single JOIN query
    value_rows = (
        db.query(
            Inventory.current_stock,
            MedicalSupply.unit_price,
        )
        .join(MedicalSupply, Inventory.supply_id == MedicalSupply.id)
        .all()
    )
    total_inventory_value: float = sum(
        float(row.current_stock) * float(row.unit_price)
        for row in value_rows
        if row.unit_price is not None
    )

    # 3. High-risk shortages (critical + high unresolved alerts)
    high_risk_shortages: int = (
        db.query(func.count(Alert.id))
        .filter(
            Alert.is_resolved == False,  # noqa: E712
            Alert.severity.in_(["critical", "high"]),
        )
        .scalar()
        or 0
    )

    # 4. Predicted demand for the next 30 days (sum of predicted_cases)
    today = date.today()
    end_30d = today + timedelta(days=30)
    predicted_demand_30d: int = (
        db.query(func.coalesce(func.sum(DiseaseForecast.predicted_cases), 0))
        .filter(
            DiseaseForecast.forecast_date >= today,
            DiseaseForecast.forecast_date <= end_30d,
        )
        .scalar()
        or 0
    )

    # 5. Disease outbreaks — distinct disease types with cases in last 7 days
    week_ago = today - timedelta(days=7)
    disease_outbreaks: int = (
        db.query(func.count(func.distinct(DiseaseCase.disease_type)))
        .filter(DiseaseCase.recorded_at >= week_ago)
        .scalar()
        or 0
    )

    # 6. Risk classification across all inventory rows
    inventory_rows = (
        db.query(Inventory.current_stock, Inventory.safety_stock).all()
    )
    safe_count = low_count = critical_count = 0
    for row in inventory_rows:
        level = _stock_risk_level(row.current_stock, row.safety_stock)
        if level == "safe":
            safe_count += 1
        elif level == "low":
            low_count += 1
        else:
            critical_count += 1

    total_items = safe_count + low_count + critical_count
    risk_pct: float = (
        round(100.0 * (low_count + critical_count) / total_items, 2)
        if total_items > 0
        else 0.0
    )

    result = {
        "total_supplies": total_supplies,
        "total_inventory_value": round(total_inventory_value, 2),
        "high_risk_shortages": high_risk_shortages,
        "predicted_demand_30d": int(predicted_demand_30d),
        "disease_outbreaks": disease_outbreaks,
        "safe_stock_items": safe_count,
        "low_stock_items": low_count,
        "critical_risk_items": critical_count,
        "supply_risk_percentage": risk_pct,
    }

    _cache_set(cache_key, result)
    return result


@router.get("/supply-demand")
async def get_supply_demand_data(
    days_history: int = Query(30, ge=7, le=90, description="Days of historical data to include"),
    days_forecast: int = Query(30, ge=7, le=30, description="Days of forecast data to include"),
    supply_id: Optional[int] = Query(None, description="Filter to a specific supply ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Return time-series data for the supply/demand chart.

    The response includes:
    - A list of date points with actual supply requirement quantities (history)
    - A list of date points with forecast predicted case counts (future)

    This is suitable for rendering a combined historical + forecast line chart.

    Query Params
    ------------
    days_history  : how many past days of actual requirement data to return (default 30)
    days_forecast : how many future days of forecast data to return (default 30)
    supply_id     : optional filter to a single supply
    """
    cache_key = f"dashboard:supply-demand:{days_history}:{days_forecast}:{supply_id}"
    cached = _cache_get(cache_key)
    if cached:
        logger.debug("Cache hit: %s", cache_key)
        return cached

    logger.info(
        "Building supply-demand data for user=%s supply_id=%s",
        current_user.username,
        supply_id,
    )

    today = date.today()
    history_start = today - timedelta(days=days_history)
    forecast_end = today + timedelta(days=days_forecast)

    # ── Historical: aggregate supply requirements per day ─────────────────────
    hist_query = (
        db.query(
            SupplyRequirement.requirement_date.label("req_date"),
            func.sum(SupplyRequirement.required_quantity).label("total_required"),
        )
        .filter(
            SupplyRequirement.requirement_date >= history_start,
            SupplyRequirement.requirement_date <= today,
        )
    )
    if supply_id is not None:
        hist_query = hist_query.filter(SupplyRequirement.supply_id == supply_id)

    hist_rows = hist_query.group_by(SupplyRequirement.requirement_date).order_by(
        SupplyRequirement.requirement_date
    ).all()

    # ── Forecast: aggregate predicted cases per day ───────────────────────────
    forecast_query = (
        db.query(
            DiseaseForecast.forecast_date.label("fc_date"),
            func.sum(DiseaseForecast.predicted_cases).label("total_predicted"),
        )
        .filter(
            DiseaseForecast.forecast_date > today,
            DiseaseForecast.forecast_date <= forecast_end,
        )
    )
    forecast_rows = forecast_query.group_by(DiseaseForecast.forecast_date).order_by(
        DiseaseForecast.forecast_date
    ).all()

    # ── Merge into unified data_points list ───────────────────────────────────
    data_points: List[Dict] = []

    for row in hist_rows:
        data_points.append(
            {
                "date": str(row.req_date),
                "actual": int(row.total_required),
                "forecast": None,
            }
        )

    for row in forecast_rows:
        data_points.append(
            {
                "date": str(row.fc_date),
                "actual": None,
                "forecast": int(row.total_predicted),
            }
        )

    result = {
        "supply_id": supply_id,
        "days_history": days_history,
        "days_forecast": days_forecast,
        "data_points": data_points,
        "total_historical_points": len(hist_rows),
        "total_forecast_points": len(forecast_rows),
    }

    _cache_set(cache_key, result)
    return result


@router.get("/risk-status")
async def get_risk_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Return a breakdown of inventory items by stock risk level.

    Risk levels
    -----------
    safe     – current_stock ≥ safety_stock
    low      – 0 < current_stock < safety_stock
    critical – current_stock ≤ 0

    The response also includes per-supply details so the frontend can render
    a donut chart and a breakdown table.
    """
    cache_key = "dashboard:risk-status"
    cached = _cache_get(cache_key)
    if cached:
        logger.debug("Cache hit: %s", cache_key)
        return cached

    logger.info("Building risk-status for user=%s", current_user.username)

    # Single optimised JOIN — fetch all inventory rows with supply info
    rows = (
        db.query(
            Inventory.id.label("inv_id"),
            Inventory.current_stock,
            Inventory.safety_stock,
            MedicalSupply.id.label("supply_id"),
            MedicalSupply.name.label("supply_name"),
            MedicalSupply.category,
        )
        .join(MedicalSupply, Inventory.supply_id == MedicalSupply.id)
        .order_by(MedicalSupply.name)
        .all()
    )

    safe_items: List[Dict] = []
    low_items: List[Dict] = []
    critical_items: List[Dict] = []

    for row in rows:
        level = _stock_risk_level(row.current_stock, row.safety_stock)
        item = {
            "inventory_id": row.inv_id,
            "supply_id": row.supply_id,
            "supply_name": row.supply_name,
            "category": row.category,
            "current_stock": row.current_stock,
            "safety_stock": row.safety_stock,
            "risk_level": level,
        }
        if level == "safe":
            safe_items.append(item)
        elif level == "low":
            low_items.append(item)
        else:
            critical_items.append(item)

    total = len(rows)

    result = {
        "total_items": total,
        "safe_count": len(safe_items),
        "low_count": len(low_items),
        "critical_count": len(critical_items),
        "safe_percentage": round(100.0 * len(safe_items) / total, 2) if total else 0.0,
        "low_percentage": round(100.0 * len(low_items) / total, 2) if total else 0.0,
        "critical_percentage": round(100.0 * len(critical_items) / total, 2) if total else 0.0,
        # Detailed lists (useful for table rendering)
        "safe_items": safe_items,
        "low_items": low_items,
        "critical_items": critical_items,
    }

    _cache_set(cache_key, result)
    return result


@router.get("/critical-alerts")
async def get_critical_alerts_dashboard(
    limit: int = Query(10, ge=1, le=50, description="Maximum number of alerts to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Return the top unresolved critical and high-severity alerts for the dashboard.

    Alerts are ordered by severity (critical first) then by creation date
    (newest first), so the most urgent items always appear at the top.

    Query Params
    ------------
    limit : number of alerts to return (default 10, max 50)
    """
    cache_key = f"dashboard:critical-alerts:{limit}"
    cached = _cache_get(cache_key)
    if cached:
        logger.debug("Cache hit: %s", cache_key)
        return cached

    logger.info(
        "Building critical-alerts dashboard for user=%s limit=%d",
        current_user.username,
        limit,
    )

    # Fetch critical + high alerts in a single query with eager supply join
    alerts = (
        db.query(Alert)
        .options(joinedload(Alert.supply))
        .filter(
            Alert.is_resolved == False,  # noqa: E712
            Alert.severity.in_(["critical", "high"]),
        )
        .order_by(
            # critical before high
            Alert.severity.asc(),
            Alert.created_at.desc(),
        )
        .limit(limit)
        .all()
    )

    # Also fetch counts for all severity levels (unresolved)
    severity_counts = (
        db.query(Alert.severity, func.count(Alert.id).label("cnt"))
        .filter(Alert.is_resolved == False)  # noqa: E712
        .group_by(Alert.severity)
        .all()
    )
    counts_map = {row.severity: row.cnt for row in severity_counts}

    result = {
        "alerts": [_enrich_alert(a) for a in alerts],
        "total_returned": len(alerts),
        "limit": limit,
        "severity_summary": {
            "critical": counts_map.get("critical", 0),
            "high": counts_map.get("high", 0),
            "medium": counts_map.get("medium", 0),
        },
    }

    _cache_set(cache_key, result)
    return result


# ── Smart Medical Dashboard Summary ──────────────────────────────────────────

def _classify_risk(case_trend_pct: float, shortage_count: int) -> str:
    """Đánh giá mức nguy cơ chung dựa trên xu hướng ca và thiếu hụt vật tư."""
    if case_trend_pct >= 15 and shortage_count >= 5:
        return "Cao"
    if case_trend_pct >= 5 or shortage_count >= 2:
        return "Trung bình"
    return "Thấp"


@router.get("/summary")
async def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """KPI tổng hợp cho Dashboard theo Smart Medical System spec.

    Trả về:
    - total_cases_current: tổng số ca tháng hiện tại
    - cases_trend_pct: % thay đổi so với tháng trước
    - predicted_cases_next_month: số ca dự báo tháng tới
    - predicted_trend_pct: % thay đổi so với hiện tại
    - shortage_supplies_count: số vật tư cảnh báo / nguy hiểm
    - overall_risk: 'Thấp' | 'Trung bình' | 'Cao'
    """
    today = date.today()
    first_of_this_month = today.replace(day=1)
    if first_of_this_month.month == 1:
        first_of_last_month = first_of_this_month.replace(year=first_of_this_month.year - 1, month=12)
    else:
        first_of_last_month = first_of_this_month.replace(month=first_of_this_month.month - 1)

    # 1. Tổng ca tháng này
    total_current = (
        db.query(func.coalesce(func.sum(DiseaseCase.case_count), 0))
        .filter(DiseaseCase.recorded_at >= first_of_this_month)
        .scalar()
        or 0
    )
    total_last_month = (
        db.query(func.coalesce(func.sum(DiseaseCase.case_count), 0))
        .filter(
            DiseaseCase.recorded_at >= first_of_last_month,
            DiseaseCase.recorded_at < first_of_this_month,
        )
        .scalar()
        or 0
    )
    cases_trend_pct = (
        round(100.0 * (total_current - total_last_month) / total_last_month, 1)
        if total_last_month > 0
        else 0.0
    )

    # 2. Số ca dự báo tháng tới
    if first_of_this_month.month == 12:
        first_of_next_month = first_of_this_month.replace(year=first_of_this_month.year + 1, month=1)
        end_of_next_month = first_of_next_month.replace(month=2) - timedelta(days=1)
    else:
        first_of_next_month = first_of_this_month.replace(month=first_of_this_month.month + 1)
        if first_of_next_month.month == 12:
            end_of_next_month = first_of_next_month.replace(year=first_of_next_month.year + 1, month=1) - timedelta(days=1)
        else:
            end_of_next_month = first_of_next_month.replace(month=first_of_next_month.month + 1) - timedelta(days=1)

    predicted_next = (
        db.query(func.coalesce(func.sum(DiseaseForecast.predicted_cases), 0))
        .filter(
            DiseaseForecast.forecast_date >= first_of_next_month,
            DiseaseForecast.forecast_date <= end_of_next_month,
        )
        .scalar()
        or 0
    )
    predicted_trend_pct = (
        round(100.0 * (predicted_next - total_current) / total_current, 1)
        if total_current > 0
        else 0.0
    )

    # 3. Số vật tư thiếu hụt (alerts chưa xử lý)
    shortage_count = (
        db.query(func.count(Alert.id))
        .filter(Alert.is_resolved == False)  # noqa: E712
        .scalar()
        or 0
    )

    # 4. Mức nguy cơ chung
    overall_risk = _classify_risk(predicted_trend_pct, shortage_count)

    return {
        "total_cases_current": int(total_current),
        "cases_trend_pct": cases_trend_pct,
        "predicted_cases_next_month": int(predicted_next),
        "predicted_trend_pct": predicted_trend_pct,
        "shortage_supplies_count": int(shortage_count),
        "overall_risk": overall_risk,
        "as_of": today.isoformat(),
    }


@router.get("/case-trend")
async def get_case_trend(
    months: int = Query(6, ge=3, le=24),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """Xu hướng ca bệnh theo tháng cho năm nay vs năm trước."""
    today = date.today()
    series_this_year: list[dict] = []
    series_last_year: list[dict] = []

    for i in range(months - 1, -1, -1):
        # Compute month-start by going back i months from current month
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        start = date(year, month, 1)
        end = date(year + (1 if month == 12 else 0), (month % 12) + 1, 1) - timedelta(days=1)

        this_total = (
            db.query(func.coalesce(func.sum(DiseaseCase.case_count), 0))
            .filter(DiseaseCase.recorded_at >= start, DiseaseCase.recorded_at <= end)
            .scalar()
            or 0
        )
        last_total = (
            db.query(func.coalesce(func.sum(DiseaseCase.case_count), 0))
            .filter(
                DiseaseCase.recorded_at >= start.replace(year=start.year - 1),
                DiseaseCase.recorded_at <= end.replace(year=end.year - 1),
            )
            .scalar()
            or 0
        )
        label = f"T{month}"
        series_this_year.append({"month": label, "value": int(this_total)})
        series_last_year.append({"month": label, "value": int(last_total)})

    return {
        "this_year": series_this_year,
        "last_year": series_last_year,
    }


@router.get("/demand-vs-stock")
async def get_demand_vs_stock(
    top_n: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict]:
    """Top N vật tư có nhu cầu cao nhất, kèm tồn kho hiện tại."""
    today = date.today()
    end = today + timedelta(days=60)

    rows = (
        db.query(
            MedicalSupply.id,
            MedicalSupply.name,
            MedicalSupply.unit,
            func.coalesce(func.sum(SupplyRequirement.required_quantity), 0).label("demand"),
        )
        .join(SupplyRequirement, SupplyRequirement.supply_id == MedicalSupply.id)
        .filter(
            SupplyRequirement.requirement_date >= today,
            SupplyRequirement.requirement_date <= end,
        )
        .group_by(MedicalSupply.id, MedicalSupply.name, MedicalSupply.unit)
        .order_by(func.sum(SupplyRequirement.required_quantity).desc())
        .limit(top_n)
        .all()
    )

    result: list[dict] = []
    for row in rows:
        stock = (
            db.query(func.coalesce(func.sum(Inventory.current_stock), 0))
            .filter(Inventory.supply_id == row.id)
            .scalar()
            or 0
        )
        result.append(
            {
                "supply_id": row.id,
                "supply_name": row.name,
                "unit": row.unit,
                "demand": int(row.demand),
                "stock": int(stock),
            }
        )
    return result
