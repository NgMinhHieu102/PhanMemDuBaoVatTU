# Implementation Plan

## Overview

Hệ thống Dự báo Nhu cầu Vật tư Y tế (MedForecast AI) là một giải pháp AI/ML toàn diện giúp các bệnh viện dự báo nhu cầu vật tư y tế. Implementation plan này chia nhỏ công việc thành 70+ tasks được tổ chức thành 13 phases, từ project setup đến deployment và training.

**Tech Stack:**
- Backend: FastAPI + Python 3.11+ + SQLite
- Frontend: React + TypeScript + Tailwind CSS (Stitch Design)
- AI/ML: XGBoost + LSTM + Prophet (Ensemble)
- DevOps: Docker + Docker Compose + Nginx

**Estimated Timeline:** 12-16 weeks
**Team Size:** 3-5 developers (Backend, Frontend, ML Engineer, QA, DevOps)

## Tasks

**Phase 1: Project Setup & Infrastructure**

- [x] 1.1. Initialize Project Structure
  - Create backend folder with FastAPI structure
  - Create frontend folder with React + TypeScript + Vite
  - Set up Docker and docker-compose.yml
  - Create .gitignore and README.md
  - Set up environment variable templates (.env.example)
  - **Acceptance Criteria:** Project folders created with proper structure, Docker compose file configured for all services, README with setup instructions, Environment templates documented
  - **Dependencies:** None

- [x] 1.2. Setup Database
  - Create SQLite database file (data/medforecast.db)
  - Create database schema with all tables (users, medical_supplies, inventory, environmental_data, disease_cases, disease_forecasts, supply_requirements, alerts, procurement_plans, conversion_ratios, system_config, audit_logs, system_logs)
  - Set up Alembic for migrations
  - Create initial migration
  - Add indexes for performance
  - **Acceptance Criteria:** SQLite database file created, All 13 tables created with proper relationships, Alembic configured and initial migration applied, Indexes created on frequently queried columns
  - **Dependencies:** 1.1

- [x] 1.3. Setup Backend Core
  - Install FastAPI and dependencies (SQLAlchemy, Pydantic, python-jose, bcrypt, etc.)
  - Configure database connection with SQLAlchemy
  - Set up logging configuration
  - Create base models and schemas structure
  - Configure CORS for frontend
  - **Acceptance Criteria:** FastAPI app runs successfully, Database connection established, Logging configured with file rotation, CORS configured for localhost:3000
  - **Dependencies:** 1.2

- [x] 1.4. Setup Frontend Core
  - Initialize React + TypeScript with Vite
  - Install Tailwind CSS and configure
  - Install dependencies (React Router, React Query, Zustand, Axios, Recharts)
  - Create base layout structure (Sidebar, Header, Layout)
  - Set up routing for main pages
  - Configure API client with Axios
  - **Acceptance Criteria:** React app runs successfully, Tailwind CSS working with Stitch design colors, Basic layout renders with sidebar navigation, Axios configured with base URL
  - **Dependencies:** 1.1

**Phase 2: Authentication & User Management**

- [x] 2.1. Backend - Authentication System
  - Create User model and schema
  - Implement JWT token generation and validation
  - Create password hashing utilities (bcrypt)
  - Implement login endpoint (POST /api/v1/auth/login)
  - Implement logout endpoint (POST /api/v1/auth/logout)
  - Implement get current user endpoint (GET /api/v1/auth/me)
  - Implement refresh token endpoint (POST /api/v1/auth/refresh)
  - Add authentication dependency for protected routes
  - **Acceptance Criteria:** User can login with username/password, JWT token generated with 24-hour expiration, Protected routes require valid token, Password hashed with bcrypt, Refresh token mechanism works
  - **Dependencies:** 1.3

- [x] 2.2. Backend - User Management
  - Implement create user endpoint (POST /api/v1/users) - Admin only
  - Implement list users endpoint (GET /api/v1/users) - Admin only
  - Implement get user by ID (GET /api/v1/users/{id})
  - Implement update user (PUT /api/v1/users/{id})
  - Implement delete user (DELETE /api/v1/users/{id}) - Admin only
  - Implement role-based access control (RBAC) middleware
  - Create seed data for initial admin user
  - **Acceptance Criteria:** Admin can create/update/delete users, RBAC enforces role permissions (Administrator, Pharmacist, Inventory_Manager), Initial admin user created via seed script, All user operations logged in audit_logs
  - **Dependencies:** 2.1

- [x] 2.3. Frontend - Authentication UI
  - Create Login page with form (username, password)
  - Create useAuth hook for authentication state
  - Implement authStore with Zustand
  - Create authService for API calls
  - Implement protected route wrapper
  - Add authentication token to Axios interceptor
  - Handle token expiration and refresh
  - **Acceptance Criteria:** User can login via UI, Token stored in localStorage, Protected routes redirect to login if not authenticated, Token automatically refreshed before expiration, Logout clears token and redirects to login
  - **Dependencies:** 2.1, 1.4

**Phase 3: Master Data Management**

- [x] 3.1. Backend - Medical Supplies API
  - Create MedicalSupply model and schema
  - Implement list supplies endpoint (GET /api/v1/supplies)
  - Implement create supply (POST /api/v1/supplies) - Admin only
  - Implement get supply by ID (GET /api/v1/supplies/{id})
  - Implement update supply (PUT /api/v1/supplies/{id}) - Admin only
  - Implement delete supply (DELETE /api/v1/supplies/{id}) - Admin only
  - Implement get categories (GET /api/v1/supplies/categories)
  - Add filtering by category, search by name
  - **Acceptance Criteria:** CRUD operations for medical supplies work, Filtering and search functional, Only admins can create/update/delete, Categories endpoint returns unique categories
  - **Dependencies:** 2.2

- [x] 3.2. Backend - Inventory Management API
  - Create Inventory model and schema
  - Implement list inventory (GET /api/v1/inventory)
  - Implement get inventory by ID (GET /api/v1/inventory/{id})
  - Implement update inventory (PUT /api/v1/inventory/{id})
  - Implement batch update (POST /api/v1/inventory/batch-update)
  - Implement get low stock items (GET /api/v1/inventory/low-stock)
  - Implement get expiring items (GET /api/v1/inventory/expiring)
  - Add validation for non-negative quantities
  - **Acceptance Criteria:** Inventory_Manager can update stock levels, Batch update works for multiple items, Low stock and expiring items endpoints work, Updates logged in audit_logs, Validation prevents negative quantities
  - **Dependencies:** 3.1

- [x] 3.3. Frontend - Inventory Management UI
  - Create Inventory page with table
  - Create InventoryTable component with columns (Supply Name, Category, Stock Status, On-Hand, Safety Stock, Forecasted Demand, Lead Time, Risk Status, Actions)
  - Create StockStatusBadge component (Critical, Low Stock, Safe)
  - Create inventory filters (Category, Risk Level)
  - Create update stock modal
  - Implement useInventory hook
  - Create inventoryService for API calls
  - Add AI Insight Panel for demand predictions
  - **Acceptance Criteria:** Inventory table displays all items with proper styling, Stock status badges show correct colors, Filters work correctly, User can update stock via modal, AI Insight panel shows relevant predictions, Table matches Stitch design mockup
  - **Dependencies:** 3.2, 2.3

**Phase 4: Data Collection**

- [x] 4.1. Backend - Environmental Data API
  - Create EnvironmentalData model and schema
  - Implement list environmental data (GET /api/v1/environmental)
  - Implement create environmental data (POST /api/v1/environmental)
  - Implement get latest data (GET /api/v1/environmental/latest)
  - Implement get data for date range (GET /api/v1/environmental/range)
  - Add validation for reasonable value ranges
  - Create data collector service for external API integration (OpenWeather)
  - **Acceptance Criteria:** Environmental data CRUD works, Data collector retrieves temperature, humidity, rainfall, AQI, Retry mechanism (3 attempts, 1 minute intervals), Invalid data rejected with validation errors, Data stored with timestamp and location
  - **Dependencies:** 1.3

- [x] 4.2. Backend - Disease Cases API
  - Create DiseaseCase model and schema
  - Implement list disease cases (GET /api/v1/disease-cases)
  - Implement create disease case (POST /api/v1/disease-cases)
  - Implement get statistics (GET /api/v1/disease-cases/stats)
  - Implement get trends (GET /api/v1/disease-cases/trends)
  - Add validation for non-negative case counts
  - Create data collector service for health department API
  - **Acceptance Criteria:** Disease case CRUD works, Statistics endpoint returns counts by disease type, Trends endpoint returns time series data, Data collector retrieves dengue fever, seasonal flu, respiratory disease cases, Retry mechanism implemented, Invalid data rejected
  - **Dependencies:** 1.3

- [x] 4.3. Frontend - Epidemiology Page
  - Create Epidemiology page
  - Create disease cases chart (line chart showing trends)
  - Create statistics cards (total cases by disease type)
  - Create data table for recent cases
  - Implement useEpidemiology hook
  - Create epidemiologyService for API calls
  - **Acceptance Criteria:** Page displays disease trends chart, Statistics cards show current counts, Data table shows recent cases, Charts update when date range changes, Matches Stitch design style
  - **Dependencies:** 4.2, 2.3

**Phase 5: AI/ML Forecasting Engine**

- [x] 5.1. Setup ML Environment
  - Install ML dependencies (scikit-learn, xgboost, prophet, tensorflow, pandas, numpy)
  - Create ai_engine folder structure
  - Set up model storage directory
  - Create feature engineering utilities
  - Create model evaluation utilities
  - **Acceptance Criteria:** All ML libraries installed, Feature engineering functions work (lag features, rolling stats, seasonality), Model evaluation functions calculate MAE, RMSE, MAPE, Model storage directory configured
  - **Dependencies:** 1.3

- [x] 5.2. Implement XGBoost Forecaster
  - Create XGBoostForecaster class
  - Implement feature preparation for XGBoost
  - Implement model training method
  - Implement prediction method
  - Implement model saving/loading
  - Add hyperparameter configuration
  - Create unit tests for XGBoost model
  - **Acceptance Criteria:** XGBoost model trains on historical data, Predictions generated for 7-30 day periods, Model saved to disk after training, Hyperparameters configurable, Unit tests pass
  - **Dependencies:** 5.1

- [x] 5.3. Implement LSTM Forecaster
  - Create LSTMForecaster class
  - Build LSTM neural network architecture (2 LSTM layers + Dense)
  - Implement sequence preparation for LSTM
  - Implement model training method
  - Implement prediction method
  - Implement model saving/loading
  - Create unit tests for LSTM model
  - **Acceptance Criteria:** LSTM model architecture built correctly, Model trains on sequence data, Predictions generated with proper shape, Model saved in TensorFlow format, Unit tests pass
  - **Dependencies:** 5.1

- [x] 5.4. Implement Prophet Forecaster
  - Create ProphetForecaster class
  - Configure Prophet with seasonality settings
  - Add environmental regressors (temperature, humidity, rainfall, AQI)
  - Implement model training method
  - Implement prediction method
  - Implement model saving/loading
  - Create unit tests for Prophet model
  - **Acceptance Criteria:** Prophet model configured with yearly/weekly seasonality, Environmental regressors added, Predictions include confidence intervals, Model saved to disk, Unit tests pass
  - **Dependencies:** 5.1

- [x] 5.5. Implement Ensemble Forecaster
  - Create EnsembleForecaster class
  - Implement weighted average combination (XGBoost: 0.4, LSTM: 0.35, Prophet: 0.25)
  - Implement confidence interval calculation
  - Create model performance comparison
  - Add dynamic weight adjustment based on validation performance
  - Create unit tests for ensemble
  - **Acceptance Criteria:** Ensemble combines predictions from all 3 models, Weights configurable, Confidence intervals calculated correctly, Performance comparison shows individual model metrics, Unit tests pass
  - **Dependencies:** 5.2, 5.3, 5.4

- [x] 5.6. Implement Forecasting Pipeline
  - Create ForecastingPipeline class
  - Implement data retrieval from database
  - Implement feature engineering pipeline
  - Implement model training orchestration
  - Implement forecast generation
  - Implement automatic model retraining (when data exceeds 10% threshold)
  - Add error handling and logging
  - **Acceptance Criteria:** Pipeline retrieves historical data (90 days minimum), Features engineered correctly, All models trained and predictions generated, Ensemble forecast created, Model accuracy metrics calculated, Automatic retraining triggers correctly, Errors logged properly
  - **Dependencies:** 5.5

- [x] 5.7. Backend - Forecasting API
  - Create DiseaseForecast model and schema
  - Implement generate forecast endpoint (POST /api/v1/forecasts/generate)
  - Implement list forecasts (GET /api/v1/forecasts)
  - Implement get forecast by ID (GET /api/v1/forecasts/{id})
  - Implement get latest forecast (GET /api/v1/forecasts/latest)
  - Implement get accuracy metrics (GET /api/v1/forecasts/accuracy)
  - Integrate ForecastingPipeline
  - Add Celery task for async forecast generation
  - **Acceptance Criteria:** Forecast generation works for 7-30 day periods, Forecasts stored in database with accuracy metrics, Async task completes within 2 minutes for 30-day forecast, Latest forecast endpoint returns most recent by disease type, Accuracy metrics endpoint returns MAE, RMSE, MAPE
  - **Dependencies:** 5.6

- [x] 5.8. Frontend - Forecasting Page
  - Create Forecasting page
  - Create forecast request form (disease type, period selection)
  - Create forecast chart component (line chart with confidence intervals)
  - Create model accuracy cards (MAE, RMSE, MAPE)
  - Create forecast comparison chart (actual vs predicted)
  - Implement useForecast hook
  - Create forecastService for API calls
  - **Acceptance Criteria:** User can request forecast for disease type and period, Chart displays forecast with confidence intervals, Model accuracy metrics displayed, Comparison chart shows historical accuracy, Loading state during forecast generation, Matches Stitch design style
  - **Dependencies:** 5.7, 2.3

**Phase 6: Supply Requirements & Conversion**

- [x] 6.1. Backend - Conversion Module
  - Create ConversionModule class
  - Create ConversionRatio model and schema
  - Implement load conversion ratios from database
  - Implement calculate requirements method
  - Implement default ratios (masks: 2, gloves: 4, test kits: 1, disinfectant: 0.5)
  - Add support for disease-specific ratios
  - Create unit tests for conversion logic
  - **Acceptance Criteria:** Conversion ratios loaded from database, Requirements calculated correctly for each supply type, Default ratios applied when no custom ratio exists, Disease-specific ratios override defaults, Unit tests pass
  - **Dependencies:** 5.7

- [x] 6.2. Backend - Supply Requirements API
  - Create SupplyRequirement model and schema
  - Implement list supply requirements (GET /api/v1/supply-requirements)
  - Implement get requirements for forecast (GET /api/v1/supply-requirements/forecast/{forecast_id})
  - Implement get summary (GET /api/v1/supply-requirements/summary)
  - Integrate ConversionModule with forecast generation
  - Auto-calculate requirements when forecast created
  - **Acceptance Criteria:** Supply requirements auto-generated after forecast, Requirements stored with forecast reference, Summary endpoint aggregates by supply type, Requirements include current stock comparison
  - **Dependencies:** 6.1

**Phase 7: Alerts & Notifications**

- [x] 7.1. Backend - Alert Module
  - Create Alert model and schema
  - Create AlertModule class
  - Implement shortage detection logic
  - Implement severity classification (critical: 3 days, high: 7 days, medium: 14 days)
  - Implement projected shortage date calculation
  - Implement alert generation
  - Implement alert resolution logic
  - Create unit tests for alert logic
  - **Acceptance Criteria:** Alerts generated when requirements exceed inventory, Severity classified correctly based on shortage date, Projected shortage date calculated accurately, Alerts auto-resolve when inventory updated, Unit tests pass
  - **Dependencies:** 6.2

- [x] 7.2. Backend - Alerts API
  - Implement list alerts (GET /api/v1/alerts)
  - Implement get active alerts (GET /api/v1/alerts/active)
  - Implement get alert by ID (GET /api/v1/alerts/{id})
  - Implement resolve alert (PUT /api/v1/alerts/{id}/resolve)
  - Implement get critical alerts (GET /api/v1/alerts/critical)
  - Integrate AlertModule with inventory updates
  - Add notification service (email/SMS) for critical alerts
  - **Acceptance Criteria:** Alerts API endpoints work correctly, Active alerts filtered properly, Critical alerts sent to users within 1 minute, Alerts auto-resolve when shortage resolved, Notification service sends emails for critical alerts
  - **Dependencies:** 7.1

- [x] 7.3. Frontend - Alerts Page
  - Create Alerts page
  - Create AlertsList component
  - Create AlertCard component with severity indicators
  - Create alert filters (severity, date range)
  - Implement useAlerts hook
  - Create alertsService for API calls
  - Add resolve alert functionality
  - **Acceptance Criteria:** Alerts page displays all alerts, Severity badges show correct colors (critical: red, high: orange, medium: yellow), Filters work correctly, User can resolve alerts, Critical alerts highlighted prominently, Matches Stitch design style
  - **Dependencies:** 7.2, 2.3

**Phase 8: Procurement Planning**

- [x] 8.1. Backend - Procurement Planner
  - Create ProcurementPlanner class
  - Implement optimal order quantity calculation
  - Implement order timing optimization
  - Implement lead time consideration
  - Implement minimum order quantity handling
  - Implement storage capacity constraints
  - Implement cost estimation
  - Create unit tests for procurement logic
  - **Acceptance Criteria:** Order quantities calculated to maintain safety stock, Order timing optimized based on lead time, Minimum order quantities respected, Storage capacity not exceeded, Costs estimated based on unit prices, Unit tests pass
  - **Dependencies:** 7.1

- [x] 8.2. Backend - Procurement API
  - Create ProcurementPlan model and schema
  - Implement list procurement plans (GET /api/v1/procurement)
  - Implement generate plan (POST /api/v1/procurement/generate)
  - Implement get plan by ID (GET /api/v1/procurement/{id})
  - Implement update plan (PUT /api/v1/procurement/{id})
  - Implement delete plan (DELETE /api/v1/procurement/{id})
  - Implement approve plan (POST /api/v1/procurement/{id}/approve)
  - Implement export plan (GET /api/v1/procurement/export) - PDF/Excel
  - Integrate ProcurementPlanner
  - **Acceptance Criteria:** Procurement plans auto-generated for critical/high alerts, Plans include order quantities, timing, costs, Plans prioritize critical supplies, Export to PDF and Excel works, Approval workflow functional
  - **Dependencies:** 8.1

**Phase 9: Dashboard & Reporting**

- [x] 9.1. Backend - Dashboard API
  - Implement get overview metrics (GET /api/v1/dashboard/overview)
  - Implement get supply demand data (GET /api/v1/dashboard/supply-demand)
  - Implement get risk status (GET /api/v1/dashboard/risk-status)
  - Implement get critical alerts (GET /api/v1/dashboard/critical-alerts)
  - Add Redis caching for dashboard metrics (5-minute TTL)
  - Optimize queries for performance
  - **Acceptance Criteria:** Overview returns total supplies, value, high risk shortages, predicted demand, disease outbreaks, Supply demand returns time series data for chart, Risk status returns safe/low/critical stock counts, Critical alerts returns top alerts for dashboard, Responses cached in Redis, All queries execute within 3 seconds
  - **Dependencies:** 7.2, 6.2

- [x] 9.2. Frontend - Dashboard Page
  - Create Dashboard page (Overview)
  - Create MetricCard component (Total Supplies, High Risk Shortages, Predicted Demand, Disease Outbreaks)
  - Create SupplyDemandChart component (line chart)
  - Create RiskStatusChart component (donut chart)
  - Create CriticalAlertsTable component
  - Implement useDashboard hook
  - Create dashboardService for API calls
  - Add auto-refresh every 5 minutes
  - **Acceptance Criteria:** Dashboard displays all metric cards with correct data, Supply demand chart shows actual vs forecast, Risk status donut chart shows percentage breakdown, Critical alerts table shows top alerts with actions, Auto-refresh works every 5 minutes, Matches Stitch design mockup exactly
  - **Dependencies:** 9.1, 2.3

- [x] 9.3. Backend - Reports API
  - Implement get consumption report (GET /api/v1/reports/consumption)
  - Implement get forecast accuracy report (GET /api/v1/reports/forecast-accuracy)
  - Implement get inventory turnover report (GET /api/v1/reports/inventory-turnover)
  - Implement export report (POST /api/v1/reports/export) - PDF generation
  - Add date range filtering
  - Add location filtering
  - **Acceptance Criteria:** Consumption report shows usage by supply category, Forecast accuracy report shows model performance over time, Inventory turnover report shows turnover rates, PDF export generates formatted report, Filters work correctly
  - **Dependencies:** 9.1

- [x] 9.4. Frontend - Reports Page
  - Create Reports page
  - Create ConsumptionReport component with charts
  - Create PerformanceTable component (monthly summary)
  - Create report filters (date range, facility, category)
  - Create ExportButton component (PDF/Excel)
  - Implement useReports hook
  - Create reportsService for API calls
  - **Acceptance Criteria:** Reports page displays consumption analytics, Performance table shows monthly data, Charts visualize trends, Export button generates PDF, Filters update report data, Matches Stitch design mockup
  - **Dependencies:** 9.3, 2.3

**Phase 10: Configuration & Admin**

- [x] 10.1. Backend - Configuration API
  - Create SystemConfig model and schema
  - Implement get all configs (GET /api/v1/config)
  - Implement get config by key (GET /api/v1/config/{key})
  - Implement update config (PUT /api/v1/config/{key}) - Admin only
  - Implement get conversion ratios (GET /api/v1/config/conversion-ratios)
  - Implement update conversion ratios (PUT /api/v1/config/conversion-ratios) - Admin only
  - Implement get thresholds (GET /api/v1/config/thresholds)
  - Implement update thresholds (PUT /api/v1/config/thresholds) - Admin only
  - Log all config changes in audit_logs
  - **Acceptance Criteria:** Only admins can modify configurations, Conversion ratios updatable per disease/supply combination, Shortage thresholds configurable, Lead times and minimum order quantities configurable, Unit prices configurable, All changes logged with user and timestamp
  - **Dependencies:** 2.2

- [x] 10.2. Frontend - Settings Page
  - Create Settings page (Admin only)
  - Create configuration sections (Shortage Thresholds, Conversion Ratios, Lead Times, Unit Prices)
  - Create editable forms for each section
  - Add validation for reasonable value ranges
  - Implement useConfig hook
  - Create configService for API calls
  - Show configuration change history
  - **Acceptance Criteria:** Settings page only accessible to admins, Each configuration section editable, Validation prevents invalid values, Changes saved successfully, Change history displayed, Matches Stitch design style
  - **Dependencies:** 10.1, 2.3

- [x] 10.3. Backend - Audit & Logs API
  - Implement get audit logs (GET /api/v1/audit-logs) - Admin only
  - Implement get system logs (GET /api/v1/system-logs) - Admin only
  - Implement get error logs (GET /api/v1/system-logs/errors) - Admin only
  - Add filtering by date, user, action, module
  - Add pagination (50 items per page)
  - Implement log retention cleanup (90 days)
  - **Acceptance Criteria:** Audit logs show all data modifications, System logs show errors, warnings, info, Filters work correctly, Pagination functional, Logs older than 90 days auto-deleted
  - **Dependencies:** 2.2

**Phase 11: Testing & Quality Assurance**

- [x] 11.1. Backend Unit Tests
  - Write unit tests for all services
  - Write unit tests for AI/ML models
  - Write unit tests for conversion logic
  - Write unit tests for alert logic
  - Write unit tests for procurement logic
  - Achieve 80%+ code coverage
  - **Acceptance Criteria:** All service methods tested, All AI models tested, All business logic tested, Code coverage >= 80%, All tests pass
  - **Dependencies:** All backend tasks

- [x] 11.2. Backend Integration Tests
  - Write integration tests for all API endpoints
  - Test authentication and authorization
  - Test database transactions
  - Test error handling
  - Use test database for isolation
  - **Acceptance Criteria:** All API endpoints tested, Auth flows tested, Database operations tested, Error scenarios tested, Tests run in isolation
  - **Dependencies:** All backend tasks

- [x] 11.3. Frontend Unit Tests
  - Write unit tests for all components
  - Write unit tests for hooks
  - Write unit tests for services
  - Write unit tests for utilities
  - Achieve 70%+ code coverage
  - **Acceptance Criteria:** All components tested, All hooks tested, All services tested, Code coverage >= 70%, All tests pass
  - **Dependencies:** All frontend tasks

- [x] 11.4. End-to-End Testing
  - Set up Playwright for E2E tests
  - Write E2E tests for critical user flows (login, view dashboard, update inventory, generate forecast, view alerts)
  - Test cross-browser compatibility
  - Test responsive design
  - **Acceptance Criteria:** Critical user flows tested end-to-end, Tests pass in Chrome, Firefox, Safari, Mobile responsive design verified, All E2E tests pass
  - **Dependencies:** All frontend and backend tasks

**Phase 12: (REMOVED - không cần deploy, chạy local)**

**Phase 13: Training & Handover**

- [ ] 13.1. User Training
  - Conduct training sessions for administrators
  - Conduct training sessions for pharmacists
  - Conduct training sessions for inventory managers
  - Provide hands-on practice environment
  - Record training videos
  - **Acceptance Criteria:** All user roles trained, Training materials provided, Practice environment available, Training videos recorded, Users comfortable with system
  - **Dependencies:** All development tasks

- [ ] 13.2. System Handover
  - Transfer system credentials
  - Provide maintenance documentation
  - Conduct knowledge transfer sessions
  - Provide support contact information
  - **Acceptance Criteria:** Credentials transferred securely, Documentation provided, Knowledge transfer completed, Support plan established, Handover signed off
  - **Dependencies:** All tasks

---

## Notes

### Critical Path
Tasks on the critical path that must be completed sequentially:
1. Project Setup (Phase 1) → Authentication (Phase 2) → Master Data (Phase 3)
2. Data Collection (Phase 4) → AI/ML Engine (Phase 5) → Supply Requirements (Phase 6)
3. Alerts (Phase 7) → Dashboard (Phase 9) → Testing (Phase 11)

### Parallel Work Opportunities
- Frontend UI development can proceed in parallel with backend API development once contracts are defined
- AI/ML model development (Tasks 5.2, 5.3, 5.4) can be done in parallel
- Testing can begin incrementally as features are completed

### Key Milestones
- **Week 2:** Project infrastructure ready, authentication working
- **Week 4:** Master data and inventory management complete
- **Week 8:** AI/ML forecasting engine operational
- **Week 10:** Dashboard and all core features complete
- **Week 12:** Testing complete, ready for deployment
- **Week 14-16:** Deployment, training, and handover

### Technical Considerations
- **Data Requirements:** Minimum 90 days of historical data needed for AI model training
- **Performance:** System must support 50 concurrent users with <3s response time
- **Security:** RBAC, JWT authentication, TLS encryption, audit logging required
- **Scalability:** Horizontal scaling supported via Docker containers

### Risk Mitigation
- **ML Model Accuracy:** Start with ensemble approach, monitor and adjust weights based on performance
- **Data Quality:** Implement robust validation and retry mechanisms for external data sources
- **Performance:** Use Redis caching, database indexing, and query optimization from the start
- **User Adoption:** Provide comprehensive training and intuitive UI following Stitch design system



```
Phase 1: Project Setup & Infrastructure
├─ 1.1: Initialize Project Structure
├─ 1.2: Setup Database (depends on 1.1)
├─ 1.3: Setup Backend Core (depends on 1.2)
└─ 1.4: Setup Frontend Core (depends on 1.1)

Phase 2: Authentication & User Management
├─ 2.1: Backend - Authentication System (depends on 1.3)
├─ 2.2: Backend - User Management (depends on 2.1)
└─ 2.3: Frontend - Authentication UI (depends on 2.1, 1.4)

Phase 3: Master Data Management
├─ 3.1: Backend - Medical Supplies API (depends on 2.2)
├─ 3.2: Backend - Inventory Management API (depends on 3.1)
└─ 3.3: Frontend - Inventory Management UI (depends on 3.2, 2.3)

Phase 4: Data Collection
├─ 4.1: Backend - Environmental Data API (depends on 1.3)
├─ 4.2: Backend - Disease Cases API (depends on 1.3)
└─ 4.3: Frontend - Epidemiology Page (depends on 4.2, 2.3)

Phase 5: AI/ML Forecasting Engine
├─ 5.1: Setup ML Environment (depends on 1.3)
├─ 5.2: Implement XGBoost Forecaster (depends on 5.1)
├─ 5.3: Implement LSTM Forecaster (depends on 5.1)
├─ 5.4: Implement Prophet Forecaster (depends on 5.1)
├─ 5.5: Implement Ensemble Forecaster (depends on 5.2, 5.3, 5.4)
├─ 5.6: Implement Forecasting Pipeline (depends on 5.5)
├─ 5.7: Backend - Forecasting API (depends on 5.6)
└─ 5.8: Frontend - Forecasting Page (depends on 5.7, 2.3)

Phase 6: Supply Requirements & Conversion
├─ 6.1: Backend - Conversion Module (depends on 5.7)
└─ 6.2: Backend - Supply Requirements API (depends on 6.1)

Phase 7: Alerts & Notifications
├─ 7.1: Backend - Alert Module (depends on 6.2)
├─ 7.2: Backend - Alerts API (depends on 7.1)
└─ 7.3: Frontend - Alerts Page (depends on 7.2, 2.3)

Phase 8: Procurement Planning
├─ 8.1: Backend - Procurement Planner (depends on 7.1)
└─ 8.2: Backend - Procurement API (depends on 8.1)

Phase 9: Dashboard & Reporting
├─ 9.1: Backend - Dashboard API (depends on 7.2, 6.2)
├─ 9.2: Frontend - Dashboard Page (depends on 9.1, 2.3)
├─ 9.3: Backend - Reports API (depends on 9.1)
└─ 9.4: Frontend - Reports Page (depends on 9.3, 2.3)

Phase 10: Configuration & Admin
├─ 10.1: Backend - Configuration API (depends on 2.2)
├─ 10.2: Frontend - Settings Page (depends on 10.1, 2.3)
└─ 10.3: Backend - Audit & Logs API (depends on 2.2)

Phase 11: Testing & Quality Assurance
├─ 11.1: Backend Unit Tests (depends on all backend tasks)
├─ 11.2: Backend Integration Tests (depends on all backend tasks)
├─ 11.3: Frontend Unit Tests (depends on all frontend tasks)
└─ 11.4: End-to-End Testing (depends on all tasks)

Phase 12: (REMOVED - không cần deploy, chạy local)

Phase 13: Training & Handover
├─ 13.1: User Training (depends on all development tasks)
└─ 13.2: System Handover (depends on all tasks)
```

### Dependency Summary
- **No Dependencies:** 1.1, 4.1, 4.2
- **Critical Path:** 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 3.1 → 3.2 → 5.1 → 5.2/5.3/5.4 → 5.5 → 5.6 → 5.7 → 6.1 → 6.2 → 7.1 → 7.2 → 9.1 → 11.x
- **Parallel Tracks:** Frontend UI (2.3, 3.3, 4.3, 5.8, 7.3, 9.2, 9.4, 10.2) can be developed alongside backend APIs
- **ML Models:** Tasks 5.2, 5.3, 5.4 can be developed in parallel
