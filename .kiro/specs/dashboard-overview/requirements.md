# Requirements Document

## Introduction

Module Dashboard tổng quan là màn hình đầu tiên người dùng nhìn thấy sau khi đăng nhập vào hệ thống Smart Medical System. Module này tổng hợp 4 chỉ số KPI quan trọng (số ca hiện tại, dự báo tháng tới, vật tư thiếu hụt, mức nguy cơ chung), 2 biểu đồ phân tích (xu hướng ca bệnh, nhu cầu vs tồn kho), bảng cảnh báo thiếu hụt vật tư và bản đồ dịch bệnh để người dùng nắm nhanh tình hình và điều hướng tới các module xử lý chi tiết.

Phạm vi spec này tập trung vào **logic chức năng (functional behavior)** của Dashboard, không bao gồm thiết kế lại giao diện (UI hiện tại đã được duyệt). Cụ thể: định nghĩa rõ logic tính toán các chỉ số, hành vi điều hướng khi click, công thức "Mức nguy cơ chung", chức năng xuất báo cáo, cơ chế làm mới dữ liệu và xử lý trạng thái rỗng.

## Glossary

- **Dashboard**: Trang `/dashboard` của ứng dụng frontend, được render bởi `frontend/src/pages/Dashboard.tsx`.
- **Backend_API**: Tập hợp các REST endpoint dưới prefix `/api/v1/dashboard/*` và `/api/v1/reports/*` chạy trên FastAPI.
- **Authenticated_User**: Người dùng đã đăng nhập thành công và có JWT access token hợp lệ. Bao gồm 3 vai trò: `Administrator`, `Pharmacist`, `Inventory_Manager`.
- **Kỳ hiện tại (Current_Period)**: Tháng dương lịch hiện tại, tính từ ngày 1 đến ngày cuối tháng theo timezone máy chủ.
- **Kỳ trước (Previous_Period)**: Tháng dương lịch liền trước Kỳ hiện tại.
- **Kỳ kế tiếp (Next_Period)**: Tháng dương lịch liền sau Kỳ hiện tại.
- **Tổng số ca hiện tại**: Tổng `case_count` trong bảng `disease_cases` có `recorded_at` thuộc Kỳ hiện tại.
- **Số ca dự báo Kỳ kế tiếp**: Tổng `predicted_cases` trong bảng `disease_forecasts` có `forecast_date` thuộc Kỳ kế tiếp.
- **Vật tư thiếu hụt (Shortage_Supply)**: Vật tư có bản ghi trong bảng `alerts` với `is_resolved = false` (gồm các severity `critical`, `high`, `medium`).
- **Vật tư thiếu nghiêm trọng (Critical_Shortage_Supply)**: Vật tư thiếu hụt có `severity = 'critical'`.
- **Mức nguy cơ chung (Overall_Risk)**: Một trong 3 giá trị enum: `Cao`, `Trung bình`, `Thấp`, được tính theo công thức trong Requirement 4.
- **Xu hướng tăng ca (Cases_Trend_Pct)**: Phần trăm chênh lệch giữa Số ca dự báo Kỳ kế tiếp và Tổng số ca hiện tại, làm tròn 1 chữ số thập phân. Bằng `0` khi Tổng số ca hiện tại bằng 0.
- **Khoảng làm mới (Refresh_Interval)**: 5 phút (300 giây), đồng bộ với hằng số `DASHBOARD_REFRESH_INTERVAL_MS` ở frontend và `CACHE_TTL` ở backend.
- **Báo cáo Dashboard (Dashboard_Report)**: Tệp PDF tổng hợp toàn bộ chỉ số đang hiển thị trên Dashboard tại thời điểm xuất.

## Requirements

### Requirement 1: Quyền truy cập Dashboard

**User Story:** Là một người dùng đã đăng nhập, tôi muốn truy cập Dashboard ngay sau khi đăng nhập thành công, để có thể xem nhanh tình hình tổng quan của hệ thống.

#### Acceptance Criteria

1. WHEN một Authenticated_User truy cập route `/dashboard`, THE Dashboard SHALL render trong cùng một phiên không yêu cầu đăng nhập lại.
2. IF người dùng chưa đăng nhập (không có JWT hợp lệ) cố truy cập `/dashboard`, THEN THE Dashboard SHALL điều hướng người dùng tới route `/login`.
3. THE Dashboard SHALL chỉ cho phép truy cập đối với người dùng có `role` thuộc tập `{Administrator, Pharmacist, Inventory_Manager}` và cung cấp cùng một bộ chỉ số cho cả 3 vai trò này.
4. IF người dùng đã đăng nhập nhưng có `role` không thuộc tập trên, THEN THE Dashboard SHALL điều hướng người dùng tới route `/login` kèm thông báo "Tài khoản không có quyền truy cập Dashboard".
5. WHEN Authenticated_User mở Dashboard, THE Dashboard SHALL đặt tiêu đề trang là `Dashboard Tổng quan`.

### Requirement 2: Hiển thị tổng số ca hiện tại

**User Story:** Là người dùng, tôi muốn biết tổng số ca bệnh trong tháng hiện tại, để nắm tình hình dịch bệnh đang diễn ra.

#### Acceptance Criteria

1. WHEN Dashboard tải lần đầu, THE Backend_API SHALL trả về `total_cases_current` bằng tổng `case_count` của các bản ghi `disease_cases` có `recorded_at` thuộc Kỳ hiện tại.
2. WHEN Backend_API tính `cases_trend_pct`, THE Backend_API SHALL trả về phần trăm chênh lệch giữa `total_cases_current` và tổng số ca của Kỳ trước, làm tròn 1 chữ số thập phân.
3. IF tổng số ca của Kỳ trước bằng 0, THEN THE Backend_API SHALL trả về `cases_trend_pct = 0.0`.
4. THE Dashboard SHALL hiển thị `total_cases_current` trên KPI card "TỔNG SỐ CA HIỆN TẠI" với định dạng số tiếng Việt (dấu chấm phân cách hàng nghìn).
5. WHEN `cases_trend_pct >= 0`, THE Dashboard SHALL hiển thị mũi tên hướng lên màu xanh kèm giá trị `|cases_trend_pct|%` trên KPI card này.
6. WHEN `cases_trend_pct < 0`, THE Dashboard SHALL hiển thị mũi tên hướng xuống màu đỏ kèm giá trị `|cases_trend_pct|%` trên KPI card này.
7. IF không có bản ghi `disease_cases` nào trong Kỳ hiện tại, THEN THE Dashboard SHALL hiển thị giá trị `0` thay vì để trống KPI card.

### Requirement 3: Hiển thị số ca dự báo Kỳ kế tiếp

**User Story:** Là người dùng, tôi muốn biết số ca dự báo cho tháng tới, để chuẩn bị nguồn lực kịp thời.

#### Acceptance Criteria

1. WHEN Dashboard tải lần đầu, THE Backend_API SHALL trả về `predicted_cases_next_month` bằng tổng `predicted_cases` của các bản ghi `disease_forecasts` có `forecast_date` thuộc Kỳ kế tiếp.
2. WHEN Backend_API tính `predicted_trend_pct`, THE Backend_API SHALL trả về phần trăm chênh lệch giữa `predicted_cases_next_month` và `total_cases_current`, làm tròn 1 chữ số thập phân.
3. IF `total_cases_current` bằng 0, THEN THE Backend_API SHALL trả về `predicted_trend_pct = 0.0`.
4. THE Dashboard SHALL hiển thị `predicted_cases_next_month` trên KPI card "DỰ BÁO THÁNG TỚI" với định dạng số tiếng Việt.
5. THE Dashboard SHALL hiển thị `predicted_trend_pct` với cùng quy ước mũi tên/màu sắc như Requirement 2.
6. IF không có bản ghi `disease_forecasts` nào trong Kỳ kế tiếp, THEN THE Dashboard SHALL hiển thị giá trị `0` trên KPI card này.

### Requirement 4: Tính và hiển thị Mức nguy cơ chung

**User Story:** Là người dùng, tôi muốn nhìn ngay được mức nguy cơ chung của hệ thống, để biết có cần hành động khẩn cấp hay không.

#### Acceptance Criteria

1. WHEN Backend_API tính Mức nguy cơ chung, THE Backend_API SHALL áp dụng công thức sau theo thứ tự ưu tiên:
   - Trả về `Cao` IF `predicted_trend_pct >= 15.0` AND `shortage_supplies_count >= 5`.
   - NGƯỢC LẠI trả về `Trung bình` IF `predicted_trend_pct >= 5.0` OR `shortage_supplies_count >= 2`.
   - NGƯỢC LẠI trả về `Thấp`.
2. THE Dashboard SHALL hiển thị giá trị Overall_Risk trên KPI card "MỨC NGUY CƠ CHUNG" với màu sắc:
   - `Cao` hiển thị màu đỏ (`text-red-600`).
   - `Trung bình` hiển thị màu vàng (`text-amber-700`).
   - `Thấp` hiển thị màu xanh lá (`text-emerald-600`).
3. WHEN không có dữ liệu để tính (không có `disease_cases` lẫn `disease_forecasts`), THE Backend_API SHALL trả về `Thấp` và `predicted_trend_pct = 0.0`.

### Requirement 5: Hiển thị số vật tư thiếu hụt

**User Story:** Là người dùng, tôi muốn biết có bao nhiêu vật tư đang thiếu hụt, để ưu tiên xử lý.

#### Acceptance Criteria

1. WHEN Dashboard tải lần đầu, THE Backend_API SHALL trả về `shortage_supplies_count` bằng số bản ghi `alerts` có `is_resolved = false`.
2. THE Dashboard SHALL hiển thị `shortage_supplies_count` kèm chữ "mục" trên KPI card "VẬT TƯ THIẾU HỤT".
3. WHEN `shortage_supplies_count > 0`, THE Dashboard SHALL hiển thị badge `⚠ Cần nhập` màu đỏ trên KPI card này.
4. WHEN `shortage_supplies_count = 0`, THE Dashboard SHALL hiển thị badge `✓ Đầy đủ` màu xanh lá trên KPI card này.

### Requirement 6: Biểu đồ xu hướng ca bệnh

**User Story:** Là người dùng, tôi muốn xem biểu đồ xu hướng ca bệnh của 6 tháng gần nhất so với cùng kỳ năm trước, để nhận diện xu hướng dài hạn.

#### Acceptance Criteria

1. WHEN Dashboard tải biểu đồ "Xu hướng ca bệnh", THE Backend_API SHALL trả về 2 chuỗi dữ liệu (`this_year`, `last_year`), mỗi chuỗi gồm `months` điểm dữ liệu (mặc định `months = 6`), được sắp xếp tăng dần theo tháng và kết thúc ở Kỳ hiện tại.
2. WHEN Backend_API tính giá trị mỗi tháng của `this_year`, THE Backend_API SHALL trả về tổng `case_count` của bảng `disease_cases` có `recorded_at` trong tháng đó của duy nhất năm hiện tại (loại trừ dữ liệu các năm khác).
3. WHEN Backend_API tính giá trị mỗi tháng của `last_year`, THE Backend_API SHALL trả về tổng `case_count` của bảng `disease_cases` có `recorded_at` trong cùng tháng đó của duy nhất năm trước (year - 1).
4. THE Dashboard SHALL render đường liền màu xanh (`#2563eb`) cho `this_year` và đường nét đứt màu xám (`#cbd5e1`) cho `last_year`.
5. IF chuỗi `this_year` không có điểm dữ liệu nào (mảng rỗng) HOẶC tổng tất cả giá trị bằng 0, THEN THE Dashboard SHALL hiển thị thông báo "Chưa có dữ liệu xu hướng" trong khu vực biểu đồ.
6. WHERE tham số `months` được truyền vào, THE Backend_API SHALL chấp nhận giá trị nguyên trong khoảng `[3, 24]`.
7. IF `months` nằm ngoài khoảng `[3, 24]`, THEN THE Backend_API SHALL trả về mã lỗi HTTP 422.

### Requirement 7: Biểu đồ Nhu cầu vs Tồn kho

**User Story:** Là người dùng, tôi muốn so sánh nhu cầu dự báo với tồn kho hiện tại của các vật tư chính, để biết vật tư nào sắp thiếu.

#### Acceptance Criteria

1. WHEN Dashboard tải biểu đồ "Nhu cầu vs Tồn kho", THE Backend_API SHALL trả về tối đa `top_n` vật tư có tổng `required_quantity` cao nhất trong khoảng từ ngày hiện tại đến 60 ngày sau (mặc định `top_n = 5`).
2. THE Backend_API SHALL trả về cho mỗi vật tư các trường: `supply_id`, `supply_name`, `unit`, `demand` (tổng `required_quantity`), `stock` (tổng `current_stock` của tất cả các kho), bao gồm cả các vật tư có `demand = 0` hoặc `stock = 0` nếu vẫn nằm trong top `top_n` theo `demand`.
3. THE Dashboard SHALL render mỗi vật tư là một cặp cột: cột màu xanh (`#2563eb`) cho `stock` và cột màu cam (`#b45309`) cho `demand`.
4. IF tên vật tư dài quá 18 ký tự, THEN THE Dashboard SHALL cắt ngắn còn 16 ký tự đầu kèm "…" trên trục X, nhưng giữ nguyên tên đầy đủ trong tooltip.
5. IF danh sách trả về rỗng, THEN THE Dashboard SHALL hiển thị thông báo "Chưa có dữ liệu nhu cầu" trong khu vực biểu đồ.
6. WHERE tham số `top_n` được truyền vào, THE Backend_API SHALL chấp nhận giá trị nguyên trong khoảng `[1, 20]`.

### Requirement 8: Bảng cảnh báo thiếu hụt vật tư

**User Story:** Là người dùng, tôi muốn xem danh sách các cảnh báo thiếu hụt vật tư đang cần xử lý, để đi đến thao tác chi tiết nhanh chóng.

#### Acceptance Criteria

1. WHEN Dashboard tải bảng cảnh báo, THE Backend_API SHALL trả về tối đa `limit` bản ghi `alerts` có `is_resolved = false` và `severity` thuộc tập `{critical, high}`, mặc định `limit = 5`.
2. THE Backend_API SHALL sắp xếp danh sách cảnh báo: `critical` trước `high`, trong cùng severity sắp xếp `created_at` giảm dần.
3. THE Dashboard SHALL hiển thị 4 cột: "Tên Vật Tư", "Kho hiện tại", "Định mức an toàn", "Trạng thái".
4. THE Dashboard SHALL hiển thị badge severity với mapping:
   - `critical` → nhãn `Nguy hiểm`, màu đỏ.
   - `high` → nhãn `Cần nhập`, màu cam.
   - `medium` → nhãn `Cảnh báo`, màu vàng.
5. IF danh sách cảnh báo rỗng, THEN THE Dashboard SHALL hiển thị thông báo "Không có cảnh báo" trong khu vực bảng.
6. THE Dashboard SHALL hiển thị link "Xem tất cả" điều hướng tới route `/alerts`.
7. WHERE tham số `limit` được truyền vào, THE Backend_API SHALL chấp nhận giá trị nguyên trong khoảng `[1, 50]`.

### Requirement 9: Điều hướng từ KPI card

**User Story:** Là người dùng, tôi muốn click vào từng KPI card để chuyển sang module chi tiết, để xem dữ liệu sâu hơn mà không phải vào sidebar.

#### Acceptance Criteria

1. WHEN Authenticated_User click vào KPI card "TỔNG SỐ CA HIỆN TẠI", THE Dashboard SHALL điều hướng tới route `/epidemiology`.
2. WHEN Authenticated_User click vào KPI card "DỰ BÁO THÁNG TỚI", THE Dashboard SHALL điều hướng tới route `/forecasting`.
3. WHEN Authenticated_User click vào KPI card "VẬT TƯ THIẾU HỤT", THE Dashboard SHALL điều hướng tới route `/alerts`.
4. WHEN Authenticated_User click vào KPI card "MỨC NGUY CƠ CHUNG", THE Dashboard SHALL điều hướng tới route `/alerts`.
5. THE Dashboard SHALL hiển thị con trỏ `cursor: pointer` khi hover trên các KPI card có hành vi điều hướng.
6. WHEN Authenticated_User click vào một dòng trong bảng "Cảnh báo thiếu hụt vật tư", THE Dashboard SHALL điều hướng tới route `/alerts`.

### Requirement 10: Tự động làm mới dữ liệu

**User Story:** Là người dùng, tôi muốn Dashboard tự cập nhật dữ liệu định kỳ, để luôn nhìn thấy thông tin mới mà không cần tự refresh trang.

#### Acceptance Criteria

1. WHILE Dashboard đang được hiển thị và Authenticated_User vẫn còn phiên đăng nhập hợp lệ, THE Dashboard SHALL tự động gọi lại các endpoint summary, case-trend, demand-vs-stock, critical-alerts mỗi Refresh_Interval (300 giây).
2. WHEN Dashboard kết thúc một chu kỳ làm mới (bất kể request thành công hay thất bại), THE Dashboard SHALL cập nhật chuỗi "Dữ liệu cập nhật lúc {HH:mm dd/MM/yyyy}" trên header với thời điểm vừa thực hiện request.
3. WHEN tab trình duyệt mất focus, THE Dashboard SHALL tiếp tục lịch làm mới định kỳ mà không tăng tần suất khi tab quay lại focus.
4. IF một lần làm mới gặp lỗi mạng hoặc lỗi HTTP, THEN THE Dashboard SHALL giữ nguyên dữ liệu hiển thị từ lần thành công gần nhất và không hiển thị màn hình lỗi toàn trang.
5. WHEN một lần làm mới gặp lỗi, THE Dashboard SHALL tiếp tục lập lịch lần làm mới kế tiếp sau Refresh_Interval mà không tạm dừng chu kỳ.

### Requirement 11: Trạng thái loading và rỗng

**User Story:** Là người dùng, tôi muốn thấy trạng thái loading rõ ràng và thông báo khi không có dữ liệu, để biết hệ thống đang xử lý hay thực sự trống.

#### Acceptance Criteria

1. WHILE Dashboard đang đợi response từ Backend_API cho từng khối, THE Dashboard SHALL hiển thị spinner trong khối đó (KPI cards, biểu đồ, bảng cảnh báo).
2. WHEN tất cả request đầu tiên hoàn thành, THE Dashboard SHALL gỡ bỏ tất cả spinner và render dữ liệu thật.
3. IF KPI summary trả về tất cả các trường dạng `null` hoặc `0`, THEN THE Dashboard SHALL vẫn render KPI cards với giá trị mặc định (`0` hoặc `—`) thay vì ẩn các cards.

### Requirement 12: Xuất báo cáo nhanh từ Dashboard

**User Story:** Là người dùng, tôi muốn xuất báo cáo PDF tổng hợp toàn bộ chỉ số trên Dashboard, để chia sẻ hoặc lưu trữ.

#### Acceptance Criteria

1. WHEN Authenticated_User click nút "Xuất báo cáo" trên header Dashboard, THE Dashboard SHALL gọi endpoint `POST /api/v1/reports/export` với `report_type = "dashboard-summary"`.
2. THE Backend_API SHALL hỗ trợ thêm giá trị `dashboard-summary` trong tập `report_type` của endpoint export hiện có.
3. WHEN Backend_API xử lý `report_type = "dashboard-summary"`, THE Backend_API SHALL sinh ra một tệp PDF chứa các phần sau theo thứ tự:
   - Tiêu đề báo cáo và thời điểm xuất.
   - Bảng 4 KPI: Tổng số ca hiện tại, Số ca dự báo Kỳ kế tiếp, Số vật tư thiếu hụt, Mức nguy cơ chung.
   - Bảng dữ liệu xu hướng ca bệnh 6 tháng (2 cột: Năm nay, Năm trước).
   - Bảng dữ liệu Nhu cầu vs Tồn kho cho top 5 vật tư.
   - Bảng cảnh báo thiếu hụt vật tư đang hiển thị (tối đa 5 dòng đầu).
4. THE Backend_API SHALL trả response với header `Content-Type: application/pdf` và `Content-Disposition: attachment; filename="dashboard_summary_{YYYYMMDD_HHMMSS}.pdf"`.
5. WHILE một request export đang được xử lý, THE Dashboard SHALL hiển thị trạng thái loading trên nút "Xuất báo cáo" để báo hiệu tiến độ.
6. WHEN Authenticated_User click nút "Xuất báo cáo" trong khi một request export trước đó đang xử lý, THE Dashboard SHALL xếp request mới vào hàng đợi và xử lý tuần tự sau khi request hiện tại hoàn tất.
7. WHEN PDF được trả về thành công, THE Dashboard SHALL kích hoạt tải file xuống trình duyệt với tên đúng từ header `Content-Disposition` và giữ nút "Xuất báo cáo" ở trạng thái sẵn sàng cho lần xuất tiếp theo.
8. IF Backend_API trả về mã lỗi HTTP khác 200, THEN THE Dashboard SHALL hiển thị thông báo lỗi (toast/notification) "Không thể xuất báo cáo, vui lòng thử lại" và giữ nút "Xuất báo cáo" ở trạng thái sẵn sàng.
9. WHEN dữ liệu Dashboard rỗng (không có KPI lẫn cảnh báo), THE Backend_API SHALL vẫn sinh PDF hợp lệ với các bảng có dòng "Không có dữ liệu" tương ứng.

### Requirement 13: Toàn vẹn dữ liệu giữa các khối Dashboard

**User Story:** Là người dùng, tôi muốn các con số trên KPI card khớp với dữ liệu chi tiết trong biểu đồ và bảng, để tin tưởng vào hệ thống.

#### Acceptance Criteria

1. THE Backend_API SHALL đảm bảo `total_cases_current` trong response `summary` bằng giá trị tháng cuối cùng của chuỗi `this_year` trong response `case-trend` khi cùng được gọi trong một Refresh_Interval và tham số `months` đủ để bao hàm Kỳ hiện tại.
2. THE Backend_API SHALL đảm bảo `shortage_supplies_count` trong response `summary` lớn hơn hoặc bằng tổng số dòng trả về bởi `critical-alerts` (vì critical-alerts chỉ trả về severity `critical` + `high`, summary bao gồm cả `medium`).
3. WHEN Backend_API tính các chỉ số trên trong cùng một request, THE Backend_API SHALL sử dụng cùng một giá trị `today` để tránh sai lệch khi request rơi vào ranh giới ngày.
