"""Seed mock data cho Module Phân tích & Dự báo (Module 5).

Tạo:
- 7 năm (2020 → 2026) dữ liệu disease_cases theo tháng cho 4 loại bệnh
  với xu hướng tăng dần qua các năm và xu hướng tăng mạnh trong 3 tháng gần nhất.
- Dữ liệu environmental tương ứng để công thức dự báo cho ra:
  + Lượng mưa cao hơn 15% so với cùng kỳ
  + Nhiệt độ ~28°C, độ ẩm ~82% (lý tưởng cho muỗi vằn)
  + AQI < 100 (không trigger bullet ô nhiễm để giữ bộ giải thích sạch)
- 3 bản ghi forecast cũ (T3, T4, T5/2026) kèm số ca thực tế để demo bảng "Lịch sử dự báo gần đây"

Đặt data_source = "demo_seed_v1" để dễ xoá / tái seed.

Sau khi chạy, vào trang Phân tích & Dự báo, chọn:
- Bệnh: Sốt xuất huyết
- Tỉnh: Toàn thành phố (Phường/Xã: Tất cả)
- Tháng: 06/2026 (hoặc 06/2024)
→ sẽ ra ~450 ca, mức nguy cơ CAO, đầy đủ giải thích & biểu đồ.

Chạy:
    cd backend && venv/bin/python scripts/seed_forecast_demo.py
    cd backend && venv/bin/python scripts/seed_forecast_demo.py --clean
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime
from pathlib import Path

# Cho phép chạy `python scripts/seed_forecast_demo.py` lẫn `python -m scripts.seed_forecast_demo`
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.disease_case import DiseaseCase
from app.models.disease_forecast import DiseaseForecast
from app.models.environmental_data import EnvironmentalData

DATA_SOURCE = "demo_seed_v1"
PROVINCE = "TP. Hồ Chí Minh"
DEFAULT_LOCATION = "Toàn thành phố"

DISEASES = {
    "dengue_fever": 150,
    "respiratory_disease": 110,
    "seasonal_flu": 85,
    "viral_infection": 70,
}

YEAR_GROWTH = {
    2020: 1.00,
    2021: 1.10,
    2022: 1.22,
    2023: 1.35,
    2024: 1.55,
    2025: 1.85,
    2026: 2.15,
}

SEASONALITY = {
    1: 0.40,
    2: 0.50,
    3: 0.70,
    4: 0.85,
    5: 1.00,
    6: 1.20,
    7: 1.18,
    8: 1.10,
    9: 0.98,
    10: 0.85,
    11: 0.70,
    12: 0.55,
}


def _round_with_jitter(base: float, year: int, month: int) -> int:
    jitter = ((year * 7 + month * 11) % 7) - 3
    return max(0, int(round(base)) + jitter)


def clean_existing(db) -> tuple[int, int]:
    deleted_disease = (
        db.query(DiseaseCase)
        .filter(DiseaseCase.location == DEFAULT_LOCATION)
        .delete(synchronize_session=False)
    )
    deleted_env = (
        db.query(EnvironmentalData)
        .filter(EnvironmentalData.location == PROVINCE)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted_disease, deleted_env


def seed_disease_cases(db) -> tuple[int, int]:
    added, updated = 0, 0
    for disease, base_value in DISEASES.items():
        for year, year_factor in YEAR_GROWTH.items():
            for month, season in SEASONALITY.items():
                value = _round_with_jitter(base_value * year_factor * season, year, month)
                recorded_at = datetime(year, month, 15)

                existing = (
                    db.query(DiseaseCase)
                    .filter(
                        DiseaseCase.disease_type == disease,
                        DiseaseCase.location == DEFAULT_LOCATION,
                        DiseaseCase.recorded_at == recorded_at,
                    )
                    .first()
                )
                if existing:
                    existing.case_count = value
                    existing.data_source = DATA_SOURCE
                    updated += 1
                else:
                    db.add(
                        DiseaseCase(
                            disease_type=disease,
                            location=DEFAULT_LOCATION,
                            recorded_at=recorded_at,
                            case_count=value,
                            severity="medium",
                            data_source=DATA_SOURCE,
                        )
                    )
                    added += 1
    db.commit()
    return added, updated


def seed_environmental(db) -> tuple[int, int]:
    added, updated = 0, 0

    for year in YEAR_GROWTH.keys():
        for month in range(1, 13):
            is_target_month = month == 6

            if is_target_month:
                rainfall = 140.0 if year in (2024, 2026) else 120.0
                temperature = 28.0
                humidity = 82.0
            else:
                rainfall = 30.0 + (month % 6) * 12
                if month in (4, 5, 7, 8):
                    temperature, humidity = 30.0, 78.0
                elif month in (3, 9, 10):
                    temperature, humidity = 29.0, 74.0
                else:
                    temperature, humidity = 26.0, 70.0

            aqi = 65 + ((year - 2020) * 3)
            pm25 = 18 + ((year - 2020) * 1.2)

            recorded_at = datetime(year, month, 15)

            existing = (
                db.query(EnvironmentalData)
                .filter(
                    EnvironmentalData.recorded_at == recorded_at,
                    EnvironmentalData.location == PROVINCE,
                )
                .first()
            )
            values = dict(
                recorded_at=recorded_at,
                location=PROVINCE,
                district_ward=None,
                temperature=temperature,
                humidity=humidity,
                rainfall=rainfall,
                air_quality_index=aqi,
                pm25=round(pm25, 1),
                data_source=DATA_SOURCE,
            )
            if existing:
                for k, v in values.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(EnvironmentalData(**values))
                added += 1
    db.commit()
    return added, updated


def seed_forecast_history(db) -> tuple[int, int]:
    """Tạo 3 bản ghi forecast cũ (T3, T4, T5/2026) có cả số ca thực tế để minh hoạ độ lệch."""
    samples = [
        (2026, 3, 150, 142),
        (2026, 4, 210, 235),
        (2026, 5, 320, 315),
    ]
    added, updated = 0, 0
    for y, m, predicted, actual in samples:
        forecast_date = date(y, m, 1)
        existing = (
            db.query(DiseaseForecast)
            .filter(
                DiseaseForecast.forecast_date == forecast_date,
                DiseaseForecast.disease_type == "dengue_fever",
                DiseaseForecast.location.is_(None),
                DiseaseForecast.created_by == "demo_seed",
            )
            .first()
        )
        deviation = round((predicted - actual) / actual * 100, 2)
        values = dict(
            forecast_date=forecast_date,
            disease_type="dengue_fever",
            location=None,
            predicted_cases=predicted,
            confidence_lower=int(predicted * 0.85),
            confidence_upper=int(predicted * 1.15),
            model_used="multivariate_v1",
            baseline_cases=int(predicted * 0.8),
            weather_factor=1.0,
            trend_factor=1.0,
            risk_level="medium",
            explanation="Seed demo cho bảng lịch sử dự báo.",
            forecast_period_days=30,
            actual_cases=actual,
            deviation_pct=deviation,
            created_by="demo_seed",
        )
        if existing:
            for k, v in values.items():
                setattr(existing, k, v)
            updated += 1
        else:
            db.add(DiseaseForecast(**values))
            added += 1
    db.commit()
    return added, updated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Xoá data cũ ở phạm vi 'Toàn thành phố' / 'TP. Hồ Chí Minh' trước khi seed.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        print(f"[seed_forecast_demo] data_source={DATA_SOURCE}")
        if args.clean:
            d, e = clean_existing(db)
            print(f"  cleaned:         disease_cases={d}  environmental={e}")

        d_added, d_updated = seed_disease_cases(db)
        e_added, e_updated = seed_environmental(db)
        h_added, h_updated = seed_forecast_history(db)
        print(f"  disease_cases:   added={d_added}  updated={d_updated}")
        print(f"  environmental:   added={e_added}  updated={e_updated}")
        print(f"  forecast_history added={h_added}  updated={h_updated}")
        print("Done. Hãy thử dự báo Sốt xuất huyết - Toàn thành phố - tháng 06/2026.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
