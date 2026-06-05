"""
Script test import file HMSG_2023_2026.csv
Validate logic xử lý trước khi import thật
"""
import csv
from datetime import datetime
from collections import defaultdict

# Mapping từ API
ICD_TO_NAME = {
    "J20": "Viêm phế quản cấp",
    "J06": "Nhiễm trùng đường hô hấp trên cấp",
    "J02": "Viêm họng cấp",
    "J01": "Viêm xoang cấp",
}

NHOM_BENH_MAPPING = {
    "Viêm phế quản cấp": "J20",
    "Nhiễm trùng đường hô hấp trên cấp": "J06",
    "Nhiễm trùng hô hấp trên cấp": "J06",
    "Viêm họng cấp": "J02",
    "Viêm xoang cấp": "J01",
    # Hỗ trợ nhập trực tiếp mã ICD
    "J20": "J20",
    "J06": "J06",
    "J02": "J02",
    "J01": "J01",
}

def test_import():
    file_path = "/Users/nguyenminhhieu/Desktop/webyte/test_data/HMSG_2023_2026.csv"
    
    print(f"📂 Đọc file: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = list(csv.DictReader(f))
    
    print(f"✓ Đọc được {len(reader)} dòng")
    
    headers = set(reader[0].keys()) if reader else set()
    print(f"✓ Headers: {', '.join(sorted(headers))}")
    
    # Check format
    has_simple_format = (
        "month" in headers and 
        "region" in headers and 
        "cases" in headers and 
        ("disease_name" in headers or "disease_code" in headers)
    )
    
    if not has_simple_format:
        print("❌ File không đúng format simple template")
        return
    
    print("✓ File đúng format simple template")
    
    # Phân tích dữ liệu
    errors = []
    grouped = defaultdict(lambda: {
        "cases": 0,
        "supplies": [],
        "count": 0
    })
    
    valid_records = 0
    
    for idx, row in enumerate(reader, start=2):
        month_str = (row.get("month") or "").strip()
        disease_code = (row.get("disease_code") or "").strip().upper()
        disease_name = (row.get("disease_name") or "").strip()
        disease = disease_code if disease_code else disease_name
        region = (row.get("region") or "").strip()
        cases_raw = (row.get("cases") or "").strip()
        
        # Validate required fields
        if not month_str or not disease or not region or not cases_raw:
            errors.append({
                "row": idx,
                "reason": "Thiếu thông tin bắt buộc",
                "data": f"month={month_str}, disease={disease}, region={region}, cases={cases_raw}"
            })
            continue
        
        # Parse month
        parsed = None
        for fmt in ("%m/%Y", "%Y-%m", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
            try:
                parsed = datetime.strptime(month_str, fmt)
                break
            except ValueError:
                continue
        
        if parsed is None:
            errors.append({
                "row": idx,
                "reason": f"Không parse được tháng: '{month_str}'"
            })
            continue
        
        recorded_at = datetime(parsed.year, parsed.month, 1)
        
        # Parse cases
        try:
            cases_int = int(float(cases_raw))
        except ValueError:
            errors.append({
                "row": idx,
                "reason": f"Số ca không hợp lệ: '{cases_raw}'"
            })
            continue
        
        if cases_int < 0:
            errors.append({
                "row": idx,
                "reason": f"Số ca phải >= 0: {cases_int}"
            })
            continue
        
        # Map disease to ICD code
        if disease in ICD_TO_NAME:
            disease_key = disease
        else:
            disease_key = NHOM_BENH_MAPPING.get(disease, disease)
        
        if disease_key not in ICD_TO_NAME:
            errors.append({
                "row": idx,
                "reason": f"Mã bệnh không hợp lệ: '{disease}' (mapped: '{disease_key}')"
            })
            continue
        
        disease_name_std = ICD_TO_NAME[disease_key]
        
        # Group by (recorded_at, disease_key, region)
        key = (recorded_at, disease_key, region)
        entry = grouped[key]
        entry["cases"] = max(entry["cases"], cases_int)
        entry["count"] += 1
        
        valid_records += 1
    
    print(f"\n📊 Kết quả phân tích:")
    print(f"  - Tổng dòng trong file: {len(reader)}")
    print(f"  - Dòng hợp lệ: {valid_records}")
    print(f"  - Dòng lỗi: {len(errors)}")
    print(f"  - Số ca bệnh unique (sau gộp): {len(grouped)}")
    
    if errors:
        print(f"\n⚠️  Hiển thị 20 lỗi đầu tiên:")
        for err in errors[:20]:
            print(f"  Dòng {err['row']}: {err['reason']}")
            if 'data' in err:
                print(f"    → {err['data']}")
    
    # Thống kê theo bệnh và khu vực
    print(f"\n📈 Thống kê theo bệnh:")
    disease_stats = defaultdict(int)
    region_stats = defaultdict(int)
    
    for (recorded_at, disease_key, region), entry in grouped.items():
        disease_stats[disease_key] += 1
        region_stats[region] += 1
    
    for disease_key, count in sorted(disease_stats.items()):
        print(f"  {ICD_TO_NAME[disease_key]} ({disease_key}): {count} records")
    
    print(f"\n📍 Top 10 khu vực:")
    for region, count in sorted(region_stats.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {region}: {count} records")
    
    # Phân tích thời gian
    months = set()
    for (recorded_at, _, _), _ in grouped.items():
        months.add(recorded_at.strftime("%Y-%m"))
    
    print(f"\n📅 Khoảng thời gian:")
    print(f"  Từ {min(months)} đến {max(months)}")
    print(f"  Tổng số tháng: {len(months)}")
    
    if len(errors) == 0:
        print(f"\n✅ File hoàn toàn hợp lệ! Sẵn sàng import.")
    elif len(errors) < len(reader) * 0.01:  # < 1% lỗi
        print(f"\n⚠️  File có một số lỗi nhỏ ({len(errors)}/{len(reader)} = {len(errors)/len(reader)*100:.2f}%). Có thể import được.")
    else:
        print(f"\n❌ File có quá nhiều lỗi ({len(errors)}/{len(reader)} = {len(errors)/len(reader)*100:.2f}%). Cần kiểm tra lại!")

if __name__ == "__main__":
    test_import()
