# Tài liệu Yêu cầu - Hệ thống Dự báo Nhu cầu Vật tư Y tế

## Giới thiệu

Hệ thống Dự báo Nhu cầu Vật tư Y tế là một giải pháp AI/ML giúp các bệnh viện và cơ sở y tế dự báo nhu cầu vật tư y tế dựa trên dữ liệu môi trường, dữ liệu dịch tễ và tồn kho hiện tại. Hệ thống phục vụ khu vực TP.HCM và các tỉnh lân cận, tập trung vào các nhóm bệnh: sốt xuất huyết, cúm mùa, và bệnh hô hấp.

## Bảng thuật ngữ

- **Forecasting_System**: Hệ thống Dự báo Nhu cầu Vật tư Y tế
- **AI_Engine**: Bộ máy AI/ML thực hiện dự báo số ca bệnh (sử dụng XGBoost, LSTM, Prophet)
- **Conversion_Module**: Mô-đun quy đổi từ số ca bệnh sang nhu cầu vật tư cụ thể
- **Alert_Module**: Mô-đun cảnh báo thiếu hụt vật tư
- **Procurement_Planner**: Bộ lập kế hoạch nhập hàng
- **Data_Collector**: Bộ thu thập dữ liệu từ các nguồn bên ngoài
- **Environmental_Data**: Dữ liệu môi trường bao gồm nhiệt độ, độ ẩm, lượng mưa, chất lượng không khí
- **Epidemiological_Data**: Dữ liệu dịch tễ bao gồm số ca bệnh sốt xuất huyết, cúm mùa, bệnh hô hấp
- **Inventory_Data**: Dữ liệu tồn kho hiện tại của vật tư y tế
- **Medical_Supply**: Vật tư y tế bao gồm khẩu trang, găng tay, thuốc, dịch truyền, kit xét nghiệm, dung dịch sát khuẩn
- **Forecast_Period**: Khoảng thời gian dự báo từ 7 đến 30 ngày
- **Disease_Case**: Ca bệnh được ghi nhận trong hệ thống
- **Supply_Requirement**: Nhu cầu vật tư được tính toán từ số ca bệnh dự báo
- **Shortage_Threshold**: Ngưỡng cảnh báo thiếu hụt vật tư
- **Procurement_Plan**: Kế hoạch nhập hàng được đề xuất bởi hệ thống
- **User**: Người dùng hệ thống bao gồm nhân viên quản lý kho, dược sĩ, và lãnh đạo bệnh viện
- **Database**: Cơ sở dữ liệu SQL Server lưu trữ dữ liệu hệ thống
- **API**: Giao diện lập trình ứng dụng (FastAPI/Flask) để giao tiếp giữa frontend và backend
- **Dashboard**: Giao diện hiển thị thông tin dự báo và cảnh báo
- **Historical_Data**: Dữ liệu lịch sử về ca bệnh, môi trường và tồn kho
- **Model_Accuracy**: Độ chính xác của mô hình AI được đo bằng các chỉ số như MAE, RMSE, MAPE
- **Data_Source**: Nguồn dữ liệu bên ngoài cung cấp thông tin môi trường và dịch tễ
- **Notification**: Thông báo gửi đến người dùng về cảnh báo thiếu hụt
- **Configuration**: Cấu hình hệ thống bao gồm ngưỡng cảnh báo, tỷ lệ quy đổi, tham số mô hình

## Yêu cầu

### Yêu cầu 1: Thu thập và lưu trữ dữ liệu môi trường

**User Story:** Là một nhân viên quản lý kho vật tư, tôi muốn hệ thống tự động thu thập dữ liệu môi trường, để có cơ sở dữ liệu đầu vào cho việc dự báo.

#### Tiêu chí chấp nhận

1. WHEN Environmental_Data is available from Data_Source, THE Data_Collector SHALL retrieve temperature, humidity, rainfall, and air quality data within 5 minutes
2. THE Data_Collector SHALL store Environmental_Data in the Database with timestamp and location information
3. WHEN Environmental_Data retrieval fails, THE Data_Collector SHALL retry up to 3 times with 1 minute intervals
4. IF Environmental_Data retrieval fails after 3 retries, THEN THE Data_Collector SHALL log the error and notify the User
5. THE Data_Collector SHALL validate Environmental_Data for completeness and reasonable value ranges before storage
6. WHEN invalid Environmental_Data is detected, THE Data_Collector SHALL reject the data and log the validation error

### Yêu cầu 2: Thu thập và lưu trữ dữ liệu dịch tễ

**User Story:** Là một dược sĩ, tôi muốn hệ thống tự động thu thập dữ liệu dịch tễ, để theo dõi xu hướng bệnh tật trong khu vực.

#### Tiêu chí chấp nhận

1. WHEN Epidemiological_Data is available from Data_Source, THE Data_Collector SHALL retrieve Disease_Case counts for dengue fever, seasonal flu, and respiratory diseases within 5 minutes
2. THE Data_Collector SHALL store Epidemiological_Data in the Database with timestamp, disease type, and location information
3. WHEN Epidemiological_Data retrieval fails, THE Data_Collector SHALL retry up to 3 times with 1 minute intervals
4. IF Epidemiological_Data retrieval fails after 3 retries, THEN THE Data_Collector SHALL log the error and notify the User
5. THE Data_Collector SHALL validate Epidemiological_Data for non-negative case counts before storage
6. WHEN invalid Epidemiological_Data is detected, THE Data_Collector SHALL reject the data and log the validation error

### Yêu cầu 3: Quản lý dữ liệu tồn kho

**User Story:** Là một nhân viên quản lý kho vật tư, tôi muốn cập nhật dữ liệu tồn kho hiện tại, để hệ thống có thông tin chính xác về số lượng vật tư sẵn có.

#### Tiêu chí chấp nhận

1. WHEN a User submits Inventory_Data, THE Forecasting_System SHALL validate the data for completeness and non-negative quantities
2. THE Forecasting_System SHALL store validated Inventory_Data in the Database with timestamp and Medical_Supply type
3. WHEN Inventory_Data update is successful, THE Forecasting_System SHALL confirm the update to the User within 2 seconds
4. IF Inventory_Data validation fails, THEN THE Forecasting_System SHALL return a descriptive error message to the User
5. THE Forecasting_System SHALL support batch updates of Inventory_Data for multiple Medical_Supply types
6. WHEN a User requests current Inventory_Data, THE Forecasting_System SHALL retrieve and display the data within 3 seconds

### Yêu cầu 4: Dự báo số ca bệnh bằng AI

**User Story:** Là một lãnh đạo bệnh viện, tôi muốn hệ thống dự báo số ca bệnh trong tương lai, để lập kế hoạch chuẩn bị vật tư y tế.

#### Tiêu chí chấp nhận

1. WHEN a User requests a forecast, THE AI_Engine SHALL generate Disease_Case predictions for the specified Forecast_Period using Historical_Data
2. THE AI_Engine SHALL use Environmental_Data and Epidemiological_Data as input features for the prediction models
3. THE AI_Engine SHALL support Forecast_Period from 7 to 30 days
4. WHEN generating forecasts, THE AI_Engine SHALL use ensemble methods combining XGBoost, LSTM, and Prophet models
5. THE AI_Engine SHALL calculate and store Model_Accuracy metrics including MAE, RMSE, and MAPE for each forecast
6. WHEN forecast generation is complete, THE AI_Engine SHALL return predictions with confidence intervals within 30 seconds for 7-day forecasts and within 2 minutes for 30-day forecasts
7. IF insufficient Historical_Data is available, THEN THE AI_Engine SHALL return an error message indicating the minimum data requirement
8. THE AI_Engine SHALL retrain models automatically when new Historical_Data exceeds 10% of the training dataset size

### Yêu cầu 5: Quy đổi số ca bệnh sang nhu cầu vật tư

**User Story:** Là một dược sĩ, tôi muốn hệ thống tự động quy đổi số ca bệnh dự báo sang nhu cầu vật tư cụ thể, để biết cần chuẩn bị bao nhiêu vật tư.

#### Tiêu chí chấp nhận

1. WHEN Disease_Case forecasts are available, THE Conversion_Module SHALL calculate Supply_Requirement for each Medical_Supply type
2. THE Conversion_Module SHALL use configurable conversion ratios for each disease type and Medical_Supply combination
3. THE Conversion_Module SHALL apply conversion ratios: masks (2 per case), gloves (4 per case), test kits (1 per case), disinfectant (0.5 liters per case)
4. WHEN calculating Supply_Requirement, THE Conversion_Module SHALL account for disease type, severity, and treatment protocols
5. THE Conversion_Module SHALL store calculated Supply_Requirement in the Database with timestamp and forecast reference
6. WHEN conversion is complete, THE Conversion_Module SHALL return Supply_Requirement within 5 seconds
7. WHERE a User modifies conversion ratios in Configuration, THE Conversion_Module SHALL use the updated ratios for subsequent calculations

### Yêu cầu 6: Cảnh báo thiếu hụt vật tư

**User Story:** Là một nhân viên quản lý kho vật tư, tôi muốn nhận cảnh báo khi vật tư có nguy cơ thiếu hụt, để kịp thời đặt hàng bổ sung.

#### Tiêu chí chấp nhận

1. WHEN Supply_Requirement exceeds current Inventory_Data by the Shortage_Threshold, THE Alert_Module SHALL generate a shortage alert
2. THE Alert_Module SHALL calculate projected shortage date based on current Inventory_Data and Supply_Requirement
3. THE Alert_Module SHALL classify alerts into three severity levels: critical (shortage within 3 days), high (shortage within 7 days), medium (shortage within 14 days)
4. WHEN a shortage alert is generated, THE Alert_Module SHALL send Notification to relevant Users within 1 minute
5. THE Alert_Module SHALL display active alerts on the Dashboard with Medical_Supply type, severity, and projected shortage date
6. WHERE a User configures Shortage_Threshold in Configuration, THE Alert_Module SHALL use the updated threshold for subsequent alerts
7. WHEN Inventory_Data is updated and shortage is resolved, THE Alert_Module SHALL automatically clear the corresponding alert

### Yêu cầu 7: Đề xuất kế hoạch nhập hàng

**User Story:** Là một nhân viên quản lý kho vật tư, tôi muốn hệ thống đề xuất kế hoạch nhập hàng, để tối ưu hóa việc đặt hàng và tránh thiếu hụt.

#### Tiêu chí chấp nhận

1. WHEN Supply_Requirement and Inventory_Data are available, THE Procurement_Planner SHALL generate a Procurement_Plan
2. THE Procurement_Planner SHALL calculate optimal order quantities considering lead time, minimum order quantities, and storage capacity
3. THE Procurement_Planner SHALL suggest order timing to maintain Inventory_Data above Shortage_Threshold throughout the Forecast_Period
4. WHEN generating Procurement_Plan, THE Procurement_Planner SHALL prioritize Medical_Supply types with critical or high severity alerts
5. THE Procurement_Planner SHALL calculate estimated costs for the Procurement_Plan based on unit prices in Configuration
6. WHEN Procurement_Plan generation is complete, THE Procurement_Planner SHALL display the plan on the Dashboard within 10 seconds
7. WHERE a User modifies lead time or minimum order quantities in Configuration, THE Procurement_Planner SHALL use the updated values for subsequent plans
8. THE Procurement_Planner SHALL allow Users to export Procurement_Plan in PDF and Excel formats

### Yêu cầu 8: Hiển thị dashboard và báo cáo

**User Story:** Là một lãnh đạo bệnh viện, tôi muốn xem tổng quan về dự báo và tình trạng vật tư trên dashboard, để đưa ra quyết định quản lý.

#### Tiêu chí chấp nhận

1. THE Dashboard SHALL display current Inventory_Data for all Medical_Supply types
2. THE Dashboard SHALL display Disease_Case forecasts for the selected Forecast_Period with visualization charts
3. THE Dashboard SHALL display Supply_Requirement calculations with comparison to current Inventory_Data
4. THE Dashboard SHALL display active alerts with severity indicators and projected shortage dates
5. THE Dashboard SHALL display the current Procurement_Plan with order quantities and timing
6. WHEN a User selects a Forecast_Period, THE Dashboard SHALL update all displays within 5 seconds
7. THE Dashboard SHALL display Model_Accuracy metrics for the latest forecasts
8. THE Dashboard SHALL allow Users to filter data by location, disease type, and Medical_Supply type
9. THE Dashboard SHALL refresh automatically every 5 minutes to show updated data
10. WHERE a User requests a detailed report, THE Dashboard SHALL generate and export the report in PDF format within 15 seconds

### Yêu cầu 9: Quản lý cấu hình hệ thống

**User Story:** Là một lãnh đạo bệnh viện, tôi muốn cấu hình các tham số hệ thống, để điều chỉnh hệ thống phù hợp với nhu cầu cụ thể của bệnh viện.

#### Tiêu chí chấp nhận

1. WHERE a User has administrator privileges, THE Forecasting_System SHALL allow modification of Shortage_Threshold values
2. WHERE a User has administrator privileges, THE Forecasting_System SHALL allow modification of conversion ratios in the Conversion_Module
3. WHERE a User has administrator privileges, THE Forecasting_System SHALL allow modification of lead times and minimum order quantities
4. WHERE a User has administrator privileges, THE Forecasting_System SHALL allow modification of unit prices for Medical_Supply types
5. WHEN Configuration changes are submitted, THE Forecasting_System SHALL validate the changes for reasonable value ranges
6. WHEN Configuration changes are validated, THE Forecasting_System SHALL save the changes to the Database and apply them immediately
7. IF Configuration validation fails, THEN THE Forecasting_System SHALL return a descriptive error message to the User
8. THE Forecasting_System SHALL maintain a history of Configuration changes with timestamp and User information

### Yêu cầu 10: Xác thực và phân quyền người dùng

**User Story:** Là một lãnh đạo bệnh viện, tôi muốn kiểm soát quyền truy cập hệ thống, để đảm bảo bảo mật thông tin và phân quyền phù hợp.

#### Tiêu chí chấp nhận

1. WHEN a User attempts to access the Forecasting_System, THE Forecasting_System SHALL require authentication with username and password
2. THE Forecasting_System SHALL support three user roles: Administrator, Pharmacist, and Inventory_Manager
3. WHERE a User has Administrator role, THE Forecasting_System SHALL grant access to all features including Configuration management
4. WHERE a User has Pharmacist role, THE Forecasting_System SHALL grant access to view forecasts, Supply_Requirement, and Procurement_Plan
5. WHERE a User has Inventory_Manager role, THE Forecasting_System SHALL grant access to update Inventory_Data and view alerts
6. WHEN authentication fails, THE Forecasting_System SHALL return an error message and deny access
7. WHEN a User session is inactive for 30 minutes, THE Forecasting_System SHALL automatically log out the User
8. THE Forecasting_System SHALL log all User access attempts with timestamp, username, and access result

### Yêu cầu 11: API cho tích hợp hệ thống

**User Story:** Là một nhà phát triển, tôi muốn sử dụng API để tích hợp hệ thống với các ứng dụng khác, để mở rộng khả năng sử dụng dữ liệu dự báo.

#### Tiêu chí chấp nhận

1. THE API SHALL provide endpoints for retrieving Disease_Case forecasts with parameters for Forecast_Period and location
2. THE API SHALL provide endpoints for retrieving Supply_Requirement calculations with parameters for Medical_Supply type and Forecast_Period
3. THE API SHALL provide endpoints for retrieving current Inventory_Data with parameters for Medical_Supply type
4. THE API SHALL provide endpoints for updating Inventory_Data with authentication and authorization checks
5. THE API SHALL provide endpoints for retrieving active alerts with parameters for severity level
6. WHEN an API request is received, THE API SHALL validate the request parameters and return appropriate error messages for invalid requests
7. WHEN an API request is authenticated, THE API SHALL return responses in JSON format within 3 seconds
8. THE API SHALL implement rate limiting of 100 requests per minute per User to prevent abuse
9. THE API SHALL return appropriate HTTP status codes for success, client errors, and server errors
10. THE API SHALL provide comprehensive documentation with request/response examples for all endpoints

### Yêu cầu 12: Xử lý lỗi và ghi log

**User Story:** Là một nhà phát triển, tôi muốn hệ thống ghi log chi tiết và xử lý lỗi đúng cách, để dễ dàng bảo trì và khắc phục sự cố.

#### Tiêu chí chấp nhận

1. WHEN an error occurs in any module, THE Forecasting_System SHALL log the error with timestamp, module name, error type, and error message
2. THE Forecasting_System SHALL classify errors into three levels: ERROR (critical failures), WARNING (recoverable issues), INFO (informational messages)
3. WHEN a critical error occurs, THE Forecasting_System SHALL send Notification to administrators within 2 minutes
4. THE Forecasting_System SHALL store logs in the Database with retention period of 90 days
5. WHERE a User has administrator privileges, THE Forecasting_System SHALL provide a log viewer interface with filtering by date, module, and error level
6. WHEN an API error occurs, THE API SHALL return descriptive error messages without exposing sensitive system information
7. THE Forecasting_System SHALL implement graceful degradation when non-critical components fail
8. IF the Database connection fails, THEN THE Forecasting_System SHALL attempt to reconnect up to 5 times with exponential backoff

### Yêu cầu 13: Sao lưu và phục hồi dữ liệu

**User Story:** Là một lãnh đạo bệnh viện, tôi muốn hệ thống tự động sao lưu dữ liệu, để đảm bảo không mất dữ liệu quan trọng.

#### Tiêu chí chấp nhận

1. THE Forecasting_System SHALL perform automatic backup of the Database daily at 2:00 AM
2. THE Forecasting_System SHALL retain backup files for 30 days
3. WHEN a backup operation completes successfully, THE Forecasting_System SHALL log the backup completion with timestamp and file size
4. IF a backup operation fails, THEN THE Forecasting_System SHALL retry once and notify administrators if the retry fails
5. WHERE a User has administrator privileges, THE Forecasting_System SHALL provide a manual backup trigger
6. WHERE a User has administrator privileges, THE Forecasting_System SHALL provide a restore function to recover data from backup files
7. WHEN a restore operation is initiated, THE Forecasting_System SHALL require confirmation and display the backup date before proceeding
8. THE Forecasting_System SHALL verify backup file integrity before performing restore operations

### Yêu cầu 14: Hiệu năng và khả năng mở rộng

**User Story:** Là một lãnh đạo bệnh viện, tôi muốn hệ thống hoạt động nhanh và ổn định, để phục vụ nhiều người dùng đồng thời.

#### Tiêu chí chấp nhận

1. THE Forecasting_System SHALL support at least 50 concurrent Users without performance degradation
2. WHEN a User requests Dashboard data, THE Forecasting_System SHALL respond within 3 seconds under normal load
3. WHEN the AI_Engine generates forecasts, THE Forecasting_System SHALL complete the operation within 2 minutes for 30-day forecasts
4. THE Database SHALL handle at least 1000 transactions per minute
5. THE Forecasting_System SHALL maintain 99.5% uptime during business hours (8:00 AM to 6:00 PM)
6. WHEN system load exceeds 80% capacity, THE Forecasting_System SHALL log a warning and notify administrators
7. THE Forecasting_System SHALL support horizontal scaling by adding additional application servers
8. THE Forecasting_System SHALL optimize database queries to execute within 1 second for 95% of queries

### Yêu cầu 15: Bảo mật dữ liệu

**User Story:** Là một lãnh đạo bệnh viện, tôi muốn đảm bảo dữ liệu hệ thống được bảo mật, để tuân thủ quy định về bảo vệ thông tin y tế.

#### Tiêu chí chấp nhận

1. THE Forecasting_System SHALL encrypt all data transmissions using TLS 1.2 or higher
2. THE Forecasting_System SHALL store User passwords using bcrypt hashing with salt
3. THE Forecasting_System SHALL encrypt sensitive data in the Database using AES-256 encryption
4. WHEN a User accesses sensitive data, THE Forecasting_System SHALL log the access with timestamp and User information
5. THE API SHALL require authentication tokens for all endpoints except public documentation
6. WHEN an authentication token is issued, THE API SHALL set token expiration to 24 hours
7. THE Forecasting_System SHALL implement protection against common vulnerabilities including SQL injection, XSS, and CSRF
8. WHERE a User has administrator privileges, THE Forecasting_System SHALL provide an audit log viewer showing all data access and modifications

