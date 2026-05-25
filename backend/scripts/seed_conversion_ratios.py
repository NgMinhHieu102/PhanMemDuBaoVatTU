"""Seed định mức vật tư theo bệnh (conversion_ratios) cho test 9 bước.

Yêu cầu: medical_supplies phải đã được import trước (qua /inventory).

Cách dùng:
    cd backend
    venv/bin/python scripts/seed_conversion_ratios.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.conversion_ratio import ConversionRatio
from app.models.medical_supply import MedicalSupply

# Mapping disease → list of (supply_name, ratio_per_case)
RATIOS = {
    "dengue_fever": [
        ("Dịch truyền NaCl 0.9% 500ml", 2.5),
        ("Paracetamol 500mg viên", 0.3),
        ("Kit test SXH NS1", 1.0),
        ("Kim tiêm vô trùng 5ml", 0.05),
        ("Cồn sát khuẩn 70 độ 500ml", 0.1),
    ],
    "seasonal_flu": [
        ("Paracetamol 500mg viên", 0.5),
        ("Kim tiêm vô trùng 5ml", 0.02),
    ],
    "respiratory_disease": [
        ("Paracetamol 500mg viên", 0.4),
        ("Cồn sát khuẩn 70 độ 500ml", 0.05),
    ],
}


def main() -> None:
    db = SessionLocal()
    try:
        added = 0
        updated = 0
        skipped = 0
        for disease, items in RATIOS.items():
            for name, ratio in items:
                supply = (
                    db.query(MedicalSupply)
                    .filter(MedicalSupply.name == name)
                    .first()
                )
                if not supply:
                    print(f"  - Không tìm thấy: {name} (bỏ qua)")
                    skipped += 1
                    continue
                existing = (
                    db.query(ConversionRatio)
                    .filter(
                        ConversionRatio.disease_type == disease,
                        ConversionRatio.supply_id == supply.id,
                    )
                    .first()
                )
                if existing:
                    existing.ratio = ratio
                    existing.unit = supply.unit
                    updated += 1
                    print(f"  ✓ {disease:20s} × {name:35s} = {ratio} {supply.unit} (UPDATE)")
                else:
                    db.add(
                        ConversionRatio(
                            disease_type=disease,
                            supply_id=supply.id,
                            ratio=ratio,
                            unit=supply.unit,
                        )
                    )
                    added += 1
                    print(f"  ✓ {disease:20s} × {name:35s} = {ratio} {supply.unit} (NEW)")
        db.commit()
        print(f"\nĐã: thêm {added}, cập nhật {updated}, bỏ qua {skipped}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
