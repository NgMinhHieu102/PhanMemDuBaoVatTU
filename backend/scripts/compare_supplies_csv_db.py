"""So sánh danh sách vật tư trong CSV với bảng inventory hiện có."""

from pathlib import Path
import pandas as pd

from app.database import SessionLocal
from app.models.inventory import Inventory
from app.models.medical_supply import MedicalSupply

CSV_DIR = Path("/Users/nguyenminhhieu/Desktop/webyte")
CSV_FILES = [
    "data.csv",
    "data_HM_2025_1.csv",
    "data_HM_2025_2.csv",
    "data_HM_2026_1.csv",
    "data_test.csv",
]


def main() -> None:
    # Gom tất cả tên thuốc từ CSV
    csv_drugs: dict[str, int] = {}
    for fname in CSV_FILES:
        path = CSV_DIR / fname
        if not path.exists():
            print(f"⚠️  Bỏ qua {fname} (không tồn tại)")
            continue
        try:
            df = pd.read_csv(
                path,
                usecols=["DrugName", "TotalQuantityUsed"],
                dtype={"DrugName": str},
                low_memory=False,
            )
        except ValueError:
            df = pd.read_csv(path, low_memory=False)
            if "DrugName" not in df.columns:
                print(f"⚠️  {fname}: không có cột DrugName")
                continue

        names = df["DrugName"].dropna().str.strip()
        for name in names.unique():
            csv_drugs[name] = csv_drugs.get(name, 0) + int((names == name).sum())
        print(f"   {fname}: {len(names.unique()):>5} vật tư duy nhất, {len(names):>9} dòng")

    print()
    print(f"==> Tổng số vật tư duy nhất trong tất cả CSV: {len(csv_drugs):,}")

    # So sánh với DB
    db = SessionLocal()
    try:
        supply_names = {row[0] for row in db.query(MedicalSupply.name).all()}
        inv_supply_ids = {
            row[0] for row in db.query(Inventory.supply_id).distinct().all()
        }
        inv_names = {
            row[0]
            for row in db.query(MedicalSupply.name)
            .filter(MedicalSupply.id.in_(inv_supply_ids))
            .all()
        }
    finally:
        db.close()

    print(f"   medical_supplies: {len(supply_names):,}")
    print(f"   inventory       : {len(inv_names):,}")

    only_in_csv_not_in_supply = set(csv_drugs.keys()) - supply_names
    only_in_csv_not_in_inventory = set(csv_drugs.keys()) - inv_names

    print()
    print(f"📦 Có trong CSV nhưng CHƯA có trong medical_supplies: {len(only_in_csv_not_in_supply):,}")
    print(f"📦 Có trong CSV nhưng CHƯA có trong inventory       : {len(only_in_csv_not_in_inventory):,}")

    if only_in_csv_not_in_inventory:
        print()
        print("Ví dụ 20 vật tư có trong CSV chưa được đưa vào inventory:")
        for name in list(only_in_csv_not_in_inventory)[:20]:
            print(f"  - {name[:80]}  (gặp {csv_drugs[name]} dòng trong CSV)")


if __name__ == "__main__":
    main()
