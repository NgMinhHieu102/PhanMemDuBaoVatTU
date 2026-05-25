"""Forecast Analysis API — Module Phân tích & Dự báo theo Smart Medical spec.

Cung cấp endpoints:
- GET  /api/v1/forecast/diseases         danh sách bệnh có data
- GET  /api/v1/forecast/regions          danh sách khu vực có data
- POST /api/v1/forecast/analyze          chạy phân tích + dự báo cho 1 (bệnh, khu vực, tháng)
- GET  /api/v1/forecast/history          lịch sử dự báo gần đây kèm độ lệch
- POST /api/v1/forecast/{id}/actual      cập nhật số ca thực tế để tính sai số
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from statistics import mean, pstdev
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.disease_case import DiseaseCase
from app.models.disease_forecast import DiseaseForecast
from app.models.environmental_data import EnvironmentalData
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["forecast-analysis"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    disease_type: str = Field(..., description="Loại bệnh (key hoặc tiếng Việt)")
    region: Optional[str] = Field(None, description="Khu vực, None = toàn thành phố")
    target_month: int = Field(..., ge=1, le=12)
    target_year: int = Field(..., ge=2020, le=2100)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _norm_disease(d: str) -> str:
    """Map Vietnamese disease name → key if needed."""
    map_vi = {
        "Sốt xuất huyết": "dengue_fever",
        "Cúm mùa": "seasonal_flu",
        "Cúm A": "seasonal_flu",
        "Bệnh hô hấp": "respiratory_disease",
        "Bệnh lý hô hấp": "respiratory_disease",
        "Nhiễm virus": "viral_infection",
    }
    return map_vi.get(d.strip(), d.strip())


def _disease_label(d: str) -> str:
    labels = {
        "dengue_fever": "Sốt xuất huyết",
        "seasonal_flu": "Cúm mùa",
        "respiratory_disease": "Bệnh hô hấp",
        "viral_infection": "Nhiễm virus",
    }
    return labels.get(d, d)


def _classify_risk(predicted: int, baseline: float) -> tuple[str, float]:
    """Trả về (risk_level, increase_pct) theo spec 5.6."""
    if baseline <= 0:
        return "low", 0.0
    increase = (predicted - baseline) / baseline * 100
    if increase > 50:
        return "very_high", increase
    if increase > 25:
        return "high", increase
    if increase >= 10:
        return "medium", increase
    return "low", increase


def _risk_label(level: str) -> str:
    return {
        "low": "Thấp",
        "medium": "Trung bình",
        "high": "Cao",
        "very_high": "Rất cao",
    }.get(level, "—")


def _query_cases(
    db: Session,
    disease: str,
    region: Optional[str],
    year: int,
    month: int,
) -> int:
    """Tổng ca bệnh trong tháng cho disease + region."""
    q = db.query(func.coalesce(func.sum(DiseaseCase.case_count), 0)).filter(
        DiseaseCase.disease_type == disease,
        extract("year", DiseaseCase.recorded_at) == year,
        extract("month", DiseaseCase.recorded_at) == month,
    )
    if region:
        q = q.filter(DiseaseCase.location == region)
    return int(q.scalar() or 0)


def _query_weather(
    db: Session,
    region: Optional[str],
    year: int,
    month: int,
) -> Dict[str, Optional[float]]:
    """Trung bình các yếu tố thời tiết tháng đó."""
    q = db.query(
        func.avg(EnvironmentalData.temperature),
        func.avg(EnvironmentalData.humidity),
        func.avg(EnvironmentalData.rainfall),
        func.avg(EnvironmentalData.air_quality_index),
        func.avg(EnvironmentalData.pm25),
    ).filter(
        extract("year", EnvironmentalData.recorded_at) == year,
        extract("month", EnvironmentalData.recorded_at) == month,
    )
    if region:
        q = q.filter(
            (EnvironmentalData.location == region)
            | (EnvironmentalData.district_ward == region)
        )
    row = q.first()

    def f(v):
        try:
            return float(v) if v is not None else None
        except Exception:
            return None

    return {
        "temp": f(row[0]) if row else None,
        "humidity": f(row[1]) if row else None,
        "rainfall": f(row[2]) if row else None,
        "aqi": f(row[3]) if row else None,
        "pm25": f(row[4]) if row else None,
    }


def _weather_factor(
    forecast_w: Dict[str, Optional[float]],
    history_w: Dict[str, Optional[float]],
) -> tuple[float, list[str]]:
    """Tính hệ số thời tiết và sinh các bullet giải thích.

    Logic đơn giản: mỗi yếu tố lệch >10% so với lịch sử → ảnh hưởng ±5-15% lên hệ số.
    """
    factor = 1.0
    bullets: list[str] = []

    def diff_pct(curr: Optional[float], hist: Optional[float]) -> Optional[float]:
        if curr is None or hist is None or hist == 0:
            return None
        return (curr - hist) / hist * 100

    # Mưa
    rain_d = diff_pct(forecast_w.get("rainfall"), history_w.get("rainfall"))
    if rain_d is not None and abs(rain_d) >= 10:
        factor *= 1 + (rain_d / 100) * 0.15
        sign = "tăng" if rain_d > 0 else "giảm"
        bullets.append(
            f"Lượng mưa {sign} {abs(rain_d):.0f}% so với cùng kỳ — "
            f"{'thuận lợi cho lăng quăng phát triển.' if rain_d > 0 else 'giảm môi trường sinh sản muỗi.'}"
        )

    # Nhiệt độ + độ ẩm
    temp = forecast_w.get("temp")
    hum = forecast_w.get("humidity")
    if temp is not None and hum is not None:
        if 26 <= temp <= 30 and 75 <= hum <= 85:
            factor *= 1.1
            bullets.append(
                f"Độ ẩm & Nhiệt độ lý tưởng — Độ ẩm {hum:.0f}% và nhiệt độ {temp:.0f}°C "
                "tối ưu cho vòng đời muỗi vằn."
            )
        elif temp > 35:
            factor *= 0.9
            bullets.append(f"Nhiệt độ cao {temp:.0f}°C — bất lợi cho vector truyền bệnh.")

    # AQI / PM2.5
    aqi = forecast_w.get("aqi")
    if aqi is not None and aqi > 100:
        factor *= 1.05
        bullets.append(
            f"AQI {aqi:.0f} ở mức cao — có thể làm tăng các ca hô hấp & dị ứng."
        )

    return round(factor, 3), bullets


def _pearson_coefficients(correlation_rows: list[dict]) -> Dict[str, Optional[float]]:
    """Tính hệ số tương quan Pearson giữa số ca và mỗi yếu tố thời tiết.

    Trả về dict có 5 key: temp, humidity, rainfall, aqi, pm25.
    Mỗi value là số trong [-1, 1] (làm tròn 3 chữ số), hoặc None nếu thiếu data.
    """
    factors = ("temp", "humidity", "rainfall", "aqi", "pm25")
    result: Dict[str, Optional[float]] = {}

    for f in factors:
        # Cặp (cases, factor) — bỏ qua điểm thiếu dữ liệu
        pairs = [
            (float(r["cases"]), float(r[f]))
            for r in correlation_rows
            if r.get(f) is not None and r.get("cases") is not None
        ]
        if len(pairs) < 2:
            result[f] = None
            continue

        n = len(pairs)
        x_vals = [p[0] for p in pairs]
        y_vals = [p[1] for p in pairs]
        mean_x = sum(x_vals) / n
        mean_y = sum(y_vals) / n
        num = sum((x - mean_x) * (y - mean_y) for x, y in pairs)
        den_x = (sum((x - mean_x) ** 2 for x in x_vals)) ** 0.5
        den_y = (sum((y - mean_y) ** 2 for y in y_vals)) ** 0.5
        denom = den_x * den_y
        result[f] = round(num / denom, 3) if denom > 0 else None

    return result


def _trend_factor(
    db: Session, disease: str, region: Optional[str], target_year: int, target_month: int
) -> tuple[float, Optional[str]]:
    """Hệ số xu hướng = ca tháng gần nhất / TB 3 tháng trước đó."""
    months_back = []
    for i in range(1, 7):
        y = target_year
        m = target_month - i
        while m <= 0:
            m += 12
            y -= 1
        months_back.append((y, m))

    counts = [_query_cases(db, disease, region, y, m) for (y, m) in months_back]
    last1 = counts[0]
    avg_prev = mean(counts[1:4]) if len(counts) >= 4 and any(c > 0 for c in counts[1:4]) else 0

    if avg_prev <= 0:
        return 1.0, None

    factor = last1 / avg_prev
    factor = max(0.5, min(2.5, factor))  # clamp

    explanation: Optional[str] = None
    # Chuỗi 3 tháng tăng liên tiếp?
    if all(counts[i] > counts[i + 1] for i in range(3)):
        change = (counts[0] - counts[2]) / max(counts[2], 1) * 100
        explanation = (
            f"Xu hướng 3 tháng tăng mạnh — Tốc độ lây lan gia tăng {change:.0f}% "
            f"so với 3 tháng trước."
        )

    return round(factor, 3), explanation


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/diseases")
async def list_diseases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, str]]:
    """Danh sách bệnh có dữ liệu trong DB (kèm label tiếng Việt)."""
    rows = db.query(DiseaseCase.disease_type).distinct().all()
    seen = {r[0] for r in rows if r[0]}
    return [{"key": k, "label": _disease_label(k)} for k in sorted(seen)]


@router.get("/regions")
async def list_regions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[str]:
    rows = db.query(DiseaseCase.location).distinct().order_by(DiseaseCase.location).all()
    return [r[0] for r in rows if r[0]]


@router.post("/analyze")
async def analyze_forecast(
    payload: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Chạy pipeline dự báo theo công thức 5.5.

    Output trả về đủ data cho 4 biểu đồ + giải thích.
    """
    disease = _norm_disease(payload.disease_type)
    region = payload.region.strip() if payload.region and payload.region != "all" else None

    # 1. Ca nền = TB cùng tháng các năm trước (tối đa 5 năm)
    baseline_years: list[int] = []
    baseline_counts: list[int] = []
    for back in range(1, 6):
        y = payload.target_year - back
        c = _query_cases(db, disease, region, y, payload.target_month)
        if c > 0:
            baseline_years.append(y)
            baseline_counts.append(c)
    baseline = mean(baseline_counts) if baseline_counts else 0.0

    # 2. Hệ số thời tiết
    forecast_w = _query_weather(db, region, payload.target_year, payload.target_month)
    history_w_list = [
        _query_weather(db, region, y, payload.target_month) for y in baseline_years
    ]

    def avg_field(field: str) -> Optional[float]:
        vals = [w[field] for w in history_w_list if w[field] is not None]
        return mean(vals) if vals else None

    history_w_avg = {f: avg_field(f) for f in ("temp", "humidity", "rainfall", "aqi", "pm25")}
    weather_factor, weather_bullets = _weather_factor(forecast_w, history_w_avg)

    # 3. Hệ số xu hướng
    trend_factor, trend_bullet = _trend_factor(
        db, disease, region, payload.target_year, payload.target_month
    )

    # 4. Số ca dự báo
    predicted = int(round(baseline * weather_factor * trend_factor)) if baseline else 0

    risk_level, increase_pct = _classify_risk(predicted, baseline)

    # 5. Build các series cho biểu đồ
    # 5a. Forecast vs actual qua các năm: data theo từng tháng (T1..T_target) cho mỗi năm
    years_to_show = sorted(set(baseline_years + [payload.target_year]))
    chart_main: list[dict] = []
    for m in range(1, payload.target_month + 1):
        row: Dict[str, Any] = {"month": f"T{m}"}
        for y in years_to_show:
            # Tháng target của năm dự báo dùng số ca dự báo, các tháng còn lại dùng dữ liệu thực
            if y == payload.target_year and m == payload.target_month:
                row[str(y)] = predicted
            else:
                row[str(y)] = _query_cases(db, disease, region, y, m)
        chart_main.append(row)

    # 5b. So sánh cùng kỳ (bar chart) — số ca tháng target qua các năm
    comparison: list[dict] = []
    for y in years_to_show:
        if y == payload.target_year:
            comparison.append({"year": y, "value": predicted, "is_forecast": True})
        else:
            comparison.append(
                {
                    "year": y,
                    "value": _query_cases(db, disease, region, y, payload.target_month),
                    "is_forecast": False,
                }
            )

    # 5c. Xu hướng năm hiện tại đến tháng trước
    trend_curr_year: list[dict] = []
    for m in range(1, payload.target_month):
        trend_curr_year.append(
            {
                "month": f"T{m}",
                "value": _query_cases(db, disease, region, payload.target_year, m),
            }
        )

    # 5d. Tương quan thời tiết & dịch bệnh — qua các năm cho cùng tháng
    correlation: list[dict] = []
    for y in years_to_show:
        cases = (
            predicted if y == payload.target_year
            else _query_cases(db, disease, region, y, payload.target_month)
        )
        w = (
            forecast_w if y == payload.target_year
            else _query_weather(db, region, y, payload.target_month)
        )
        correlation.append(
            {
                "year": y,
                "cases": cases,
                "temp": w.get("temp"),
                "humidity": w.get("humidity"),
                "rainfall": w.get("rainfall"),
                "aqi": w.get("aqi"),
                "pm25": w.get("pm25"),
                "is_forecast": y == payload.target_year,
            }
        )

    # 5e. Hệ số tương quan Pearson giữa số ca và mỗi yếu tố thời tiết.
    # Dùng để hiển thị bên cạnh biểu đồ (spec 5.2 #4 — Phân tích tương quan).
    correlation_coefficients = _pearson_coefficients(correlation)

    # 6. Giải thích mô hình (bullets)
    explanation_bullets = list(weather_bullets)
    if trend_bullet:
        explanation_bullets.append(trend_bullet)
    if not explanation_bullets:
        explanation_bullets.append(
            "Không phát hiện yếu tố bất thường — dự báo ổn định theo xu hướng cơ sở."
        )

    explanation_text = " | ".join(explanation_bullets)[:1000]

    # 7. Lưu lịch sử dự báo
    forecast_date = date(payload.target_year, payload.target_month, 1)
    saved = DiseaseForecast(
        forecast_date=forecast_date,
        disease_type=disease,
        location=region,
        predicted_cases=predicted,
        confidence_lower=int(predicted * 0.85),
        confidence_upper=int(predicted * 1.15),
        model_used="multivariate_v1",
        baseline_cases=int(baseline),
        weather_factor=weather_factor,
        trend_factor=trend_factor,
        risk_level=risk_level,
        explanation=explanation_text,
        forecast_period_days=30,
        created_by=current_user.username,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)

    # Spec 5 → Bước 5: tự sinh supply_requirements để Module 7 (/alerts) có data
    try:
        from app.services.supply_requirement_service import SupplyRequirementService

        SupplyRequirementService(db).generate_requirements_for_forecast(saved.id)
    except Exception as exc:
        # Không block kết quả forecast nếu việc sinh requirement gặp lỗi
        logger.warning(
            "Failed to auto-generate supply requirements for forecast %s: %s",
            saved.id,
            exc,
        )

    return {
        "forecast": {
            "id": saved.id,
            "predicted_cases": predicted,
            "baseline": int(baseline),
            "increase_pct": round(increase_pct, 1),
            "risk_level": risk_level,
            "risk_label": _risk_label(risk_level),
            "weather_factor": weather_factor,
            "trend_factor": trend_factor,
            "disease_type": disease,
            "disease_label": _disease_label(disease),
            "region": region or "Toàn thành phố",
            "target_month": payload.target_month,
            "target_year": payload.target_year,
        },
        "explanation_bullets": explanation_bullets,
        "weather": {
            "forecast": forecast_w,
            "history_avg": history_w_avg,
        },
        "charts": {
            "main": chart_main,            # T1..T_target qua các năm
            "comparison": comparison,      # Bar chart — số ca tháng target qua các năm
            "trend_current_year": trend_curr_year,  # Line — xu hướng tháng đầu năm
            "correlation": correlation,    # Combo — số ca + thời tiết qua các năm
            "correlation_coefficients": correlation_coefficients,  # Pearson r cho 5 yếu tố
            "years": years_to_show,
        },
    }


@router.get("/history")
async def get_forecast_history(
    limit: int = Query(10, ge=1, le=100),
    disease_type: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Lịch sử dự báo gần đây kèm độ lệch (nếu đã có actual)."""
    q = db.query(DiseaseForecast).order_by(DiseaseForecast.created_at.desc())
    if disease_type:
        q = q.filter(DiseaseForecast.disease_type == _norm_disease(disease_type))
    if region:
        q = q.filter(DiseaseForecast.location == region)
    rows = q.limit(limit).all()

    out = []
    for r in rows:
        actual = r.actual_cases
        deviation = None
        if actual is not None and actual > 0:
            deviation = round((r.predicted_cases - actual) / actual * 100, 1)
        out.append(
            {
                "id": r.id,
                "month": r.forecast_date.strftime("%m/%Y"),
                "disease_type": r.disease_type,
                "disease_label": _disease_label(r.disease_type),
                "region": r.location or "Toàn thành phố",
                "predicted_cases": r.predicted_cases,
                "actual_cases": actual,
                "deviation_pct": deviation,
                "risk_level": r.risk_level,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return out


class ActualUpdateRequest(BaseModel):
    actual_cases: int = Field(..., ge=0)


@router.post("/{forecast_id}/actual")
async def update_actual(
    forecast_id: int,
    payload: ActualUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Nhập số ca thực tế để tính độ lệch dự báo."""
    fc = db.query(DiseaseForecast).filter(DiseaseForecast.id == forecast_id).first()
    if not fc:
        raise HTTPException(status_code=404, detail="Forecast not found")

    fc.actual_cases = payload.actual_cases
    if payload.actual_cases > 0:
        fc.deviation_pct = round(
            (fc.predicted_cases - payload.actual_cases) / payload.actual_cases * 100, 2
        )
    db.commit()
    db.refresh(fc)
    return {
        "id": fc.id,
        "predicted_cases": fc.predicted_cases,
        "actual_cases": fc.actual_cases,
        "deviation_pct": float(fc.deviation_pct) if fc.deviation_pct is not None else None,
    }


@router.post("/{forecast_id}/export")
async def export_forecast_pdf(
    forecast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Xuất PDF báo cáo dự báo cho 1 bản ghi đã lưu (spec 5.2 #10)."""
    from datetime import datetime as _dt
    from fastapi.responses import Response
    import io

    fc = db.query(DiseaseForecast).filter(DiseaseForecast.id == forecast_id).first()
    if not fc:
        raise HTTPException(status_code=404, detail="Forecast not found")

    # Dùng helper từ reports module để có font Unicode
    from app.api.v1 import reports as _reports

    _reports._register_unicode_fonts()
    PDF_FONT_BOLD = _reports.PDF_FONT_BOLD
    _get_reportlab = _reports._get_reportlab
    _patch_styles_for_unicode = _reports._patch_styles_for_unicode
    _base_table_style = _reports._base_table_style

    colors, A4, _landscape, getSampleStyleSheet, cm, SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer = _get_reportlab()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    _patch_styles_for_unicode(styles)
    base_style = _base_table_style(colors)

    risk_label_map = {"low": "Thấp", "medium": "Trung bình", "high": "Cao", "very_high": "Rất cao"}
    disease_label = _disease_label(fc.disease_type)
    region_text = fc.location or "Toàn thành phố"
    month_label = fc.forecast_date.strftime("%m/%Y") if fc.forecast_date else "—"

    story = [
        Paragraph(f"Báo cáo dự báo dịch bệnh - {month_label}", styles["Title"]),
        Paragraph(
            f"Tạo lúc: {_dt.now().strftime('%d/%m/%Y %H:%M')} | "
            f"Người tạo: {fc.created_by or current_user.username}",
            styles["Italic"],
        ),
        Spacer(1, 0.5 * cm),
    ]

    # I. Thông tin dự báo
    story.append(Paragraph("<b>I. Thông tin dự báo</b>", styles["Heading2"]))
    info_table = Table(
        [
            ["Trường", "Giá trị"],
            ["Bệnh", disease_label],
            ["Khu vực", region_text],
            ["Kỳ dự báo", month_label],
            ["Số ca dự báo", f"{fc.predicted_cases:,}"],
            ["Ca nền (TB cùng kỳ)", f"{int(fc.baseline_cases or 0):,}"],
            ["Hệ số thời tiết", f"{float(fc.weather_factor or 1):.3f}"],
            ["Hệ số xu hướng", f"{float(fc.trend_factor or 1):.3f}"],
            ["Mức nguy cơ", risk_label_map.get(fc.risk_level or "", "—")],
            [
                "Khoảng tin cậy",
                f"{int(fc.confidence_lower or 0):,} - {int(fc.confidence_upper or 0):,}",
            ],
        ],
        colWidths=[6 * cm, 11 * cm],
        repeatRows=1,
    )
    style_info = list(base_style)
    # Highlight risk row
    risk_row = 8  # 0=header, 1..7 above, risk = row 8
    risk_color = {
        "low": colors.HexColor("#16A34A"),
        "medium": colors.HexColor("#D97706"),
        "high": colors.HexColor("#DC2626"),
        "very_high": colors.HexColor("#B91C1C"),
    }.get(fc.risk_level or "", colors.black)
    style_info.append(("TEXTCOLOR", (1, risk_row), (1, risk_row), risk_color))
    style_info.append(("FONTNAME", (1, risk_row), (1, risk_row), PDF_FONT_BOLD))
    info_table.setStyle(TableStyle(style_info))
    story.append(info_table)
    story.append(Spacer(1, 0.4 * cm))

    # II. Giải thích mô hình
    story.append(Paragraph("<b>II. Giải thích mô hình</b>", styles["Heading2"]))
    explanation = fc.explanation or "Không có giải thích."
    # Nếu có nhiều bullet ngăn cách " | " thì tách
    bullets = [b.strip() for b in (explanation or "").split("|") if b.strip()]
    if not bullets:
        bullets = [explanation]
    for b in bullets:
        story.append(Paragraph(f"• {b}", styles["Normal"]))
    story.append(Spacer(1, 0.4 * cm))

    # III. So sánh thực tế (nếu đã có)
    story.append(Paragraph("<b>III. Đánh giá độ chính xác</b>", styles["Heading2"]))
    if fc.actual_cases is not None:
        cmp_table = Table(
            [
                ["Số ca dự báo", "Số ca thực tế", "Độ lệch"],
                [
                    f"{fc.predicted_cases:,}",
                    f"{int(fc.actual_cases):,}",
                    f"{float(fc.deviation_pct or 0):+.1f}%",
                ],
            ],
            colWidths=[5 * cm, 5 * cm, 4 * cm],
            repeatRows=1,
        )
        cmp_table.setStyle(TableStyle(base_style))
        story.append(cmp_table)
    else:
        story.append(Paragraph(
            "Chưa có số ca thực tế để đánh giá. Hãy nhập số ca thực tế "
            "để hệ thống tính độ lệch.",
            styles["Normal"],
        ))

    doc.build(story)
    buf.seek(0)
    filename = f"forecast_{fc.id}_{_dt.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
