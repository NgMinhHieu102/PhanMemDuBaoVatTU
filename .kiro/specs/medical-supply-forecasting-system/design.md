# Tài liệu Thiết kế - Hệ thống Dự báo Nhu cầu Vật tư Y tế (MedForecast AI)

## 1. Tổng quan Kiến trúc Hệ thống

### 1.1 Kiến trúc Tổng thể

Hệ thống được thiết kế theo kiến trúc **3-tier** với các thành phần chính:

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  React + TypeScript + Tailwind CSS + Recharts/Chart.js     │
│              (Stitch Design System UI)                       │
└─────────────────────────────────────────────────────────────┘
                            ↕ REST API
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│                    FastAPI (Python 3.11+)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ API Gateway  │  │ Auth Service │  │ Data Service │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ AI/ML Engine │  │ Alert Module │  │ Procurement  │      │
│  │ (XGBoost,    │  │              │  │ Planner      │      │
│  │  LSTM,       │  │              │  │              │      │
│  │  Prophet)    │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕ SQL
┌─────────────────────────────────────────────────────────────┐
│                       DATA LAYER                             │
│                    SQLite 3.35+                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Operational  │  │ Historical   │  │ ML Models    │      │
│  │ Database     │  │ Data Store   │  │ Storage      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Weather API  │  │ Health Dept  │  │ Email/SMS    │      │
│  │ (OpenWeather)│  │ API          │  │ Service      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Tech Stack

#### Frontend
- **Framework**: React 18+ với TypeScript
- **UI Library**: Tailwind CSS (Stitch Design System style)
- **Charts**: Recharts hoặc Chart.js
- **State Management**: React Query + Zustand
- **Routing**: React Router v6
- **Form Handling**: React Hook Form + Zod validation
- **HTTP Client**: Axios
- **Icons**: Lucide React hoặc Heroicons

#### Backend
- **Framework**: FastAPI 0.104+
- **Language**: Python 3.11+
- **ORM**: SQLAlchemy 2.0
- **Migration**: Alembic
- **Authentication**: JWT (python-jose)
- **Password Hashing**: bcrypt
- **Validation**: Pydantic v2
- **Task Queue**: Celery + Redis (cho background tasks)
- **Caching**: Redis

#### AI/ML
- **Forecasting Models**:
  - XGBoost 2.0+ (gradient boosting)
  - Prophet (Facebook's time series)
  - TensorFlow/Keras 2.14+ (LSTM networks)
- **Data Processing**: Pandas, NumPy
- **Model Evaluation**: scikit-learn
- **Model Storage**: MLflow hoặc pickle files

#### Database
- **Primary**: SQLite 3.35+
- **Schema**: Relational với time-series optimization
- **Backup**: File-based backup automated daily

#### DevOps
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx
- **Monitoring**: Prometheus + Grafana (optional)
- **Logging**: Python logging + file rotation

## 2. Data Models

### 2.1 Database Schema


#### Core Tables

```sql
-- Users and Authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('Administrator', 'Pharmacist', 'Inventory_Manager')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Medical Supplies Master Data
CREATE TABLE medical_supplies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    unit_price DECIMAL(10, 2),
    minimum_order_quantity INTEGER,
    lead_time_days INTEGER,
    storage_capacity INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Data
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    supply_id INTEGER REFERENCES medical_supplies(id),
    current_stock INTEGER NOT NULL,
    safety_stock INTEGER NOT NULL,
    location VARCHAR(100),
    batch_number VARCHAR(50),
    expiry_date DATE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- Environmental Data
CREATE TABLE environmental_data (
    id SERIAL PRIMARY KEY,
    recorded_at TIMESTAMP NOT NULL,
    location VARCHAR(100) NOT NULL,
    temperature DECIMAL(5, 2),
    humidity DECIMAL(5, 2),
    rainfall DECIMAL(7, 2),
    air_quality_index INTEGER,
    data_source VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Disease Cases (Epidemiological Data)
CREATE TABLE disease_cases (
    id SERIAL PRIMARY KEY,
    recorded_at TIMESTAMP NOT NULL,
    disease_type VARCHAR(100) NOT NULL CHECK (disease_type IN ('dengue_fever', 'seasonal_flu', 'respiratory_disease')),
    case_count INTEGER NOT NULL,
    location VARCHAR(100) NOT NULL,
    severity VARCHAR(20),
    data_source VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Disease Forecasts
CREATE TABLE disease_forecasts (
    id SERIAL PRIMARY KEY,
    forecast_date DATE NOT NULL,
    disease_type VARCHAR(100) NOT NULL,
    predicted_cases INTEGER NOT NULL,
    confidence_lower INTEGER,
    confidence_upper INTEGER,
    model_used VARCHAR(50),
    model_accuracy_mae DECIMAL(10, 2),
    model_accuracy_rmse DECIMAL(10, 2),
    model_accuracy_mape DECIMAL(5, 2),
    forecast_period_days INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Supply Requirements
CREATE TABLE supply_requirements (
    id SERIAL PRIMARY KEY,
    forecast_id INTEGER REFERENCES disease_forecasts(id),
    supply_id INTEGER REFERENCES medical_supplies(id),
    required_quantity INTEGER NOT NULL,
    requirement_date DATE NOT NULL,
    disease_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    supply_id INTEGER REFERENCES medical_supplies(id),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
    current_stock INTEGER,
    required_stock INTEGER,
    shortage_date DATE,
    message TEXT,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Procurement Plans
CREATE TABLE procurement_plans (
    id SERIAL PRIMARY KEY,
    supply_id INTEGER REFERENCES medical_supplies(id),
    order_quantity INTEGER NOT NULL,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    estimated_cost DECIMAL(12, 2),
    priority VARCHAR(20),
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversion Ratios Configuration
CREATE TABLE conversion_ratios (
    id SERIAL PRIMARY KEY,
    disease_type VARCHAR(100) NOT NULL,
    supply_id INTEGER REFERENCES medical_supplies(id),
    ratio DECIMAL(10, 4) NOT NULL,
    unit VARCHAR(50),
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Configuration
CREATE TABLE system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    description TEXT,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id INTEGER,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Logs
CREATE TABLE system_logs (
    id SERIAL PRIMARY KEY,
    log_level VARCHAR(20) NOT NULL CHECK (log_level IN ('ERROR', 'WARNING', 'INFO')),
    module_name VARCHAR(100),
    message TEXT NOT NULL,
    stack_trace TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_inventory_supply ON inventory(supply_id);
CREATE INDEX idx_environmental_recorded ON environmental_data(recorded_at);
CREATE INDEX idx_disease_cases_recorded ON disease_cases(recorded_at, disease_type);
CREATE INDEX idx_forecasts_date ON disease_forecasts(forecast_date);
CREATE INDEX idx_alerts_severity ON alerts(severity, is_resolved);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at);
```

### 2.2 Pydantic Models (Backend)


```python
# models/schemas.py

from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, date
from typing import Optional, List
from enum import Enum

# Enums
class UserRole(str, Enum):
    ADMINISTRATOR = "Administrator"
    PHARMACIST = "Pharmacist"
    INVENTORY_MANAGER = "Inventory_Manager"

class DiseaseType(str, Enum):
    DENGUE_FEVER = "dengue_fever"
    SEASONAL_FLU = "seasonal_flu"
    RESPIRATORY_DISEASE = "respiratory_disease"

class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"

class LogLevel(str, Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"

# User Schemas
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: Optional[str] = None
    role: UserRole

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

# Medical Supply Schemas
class MedicalSupplyBase(BaseModel):
    name: str
    category: str
    unit: str
    unit_price: Optional[float] = None
    minimum_order_quantity: Optional[int] = None
    lead_time_days: Optional[int] = None
    storage_capacity: Optional[int] = None
    description: Optional[str] = None

class MedicalSupplyCreate(MedicalSupplyBase):
    pass

class MedicalSupplyResponse(MedicalSupplyBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Inventory Schemas
class InventoryBase(BaseModel):
    supply_id: int
    current_stock: int = Field(..., ge=0)
    safety_stock: int = Field(..., ge=0)
    location: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None

class InventoryUpdate(BaseModel):
    current_stock: Optional[int] = Field(None, ge=0)
    safety_stock: Optional[int] = Field(None, ge=0)
    location: Optional[str] = None

class InventoryResponse(InventoryBase):
    id: int
    last_updated: datetime
    supply: Optional[MedicalSupplyResponse] = None
    
    class Config:
        from_attributes = True

# Environmental Data Schemas
class EnvironmentalDataBase(BaseModel):
    recorded_at: datetime
    location: str
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    rainfall: Optional[float] = None
    air_quality_index: Optional[int] = None
    data_source: Optional[str] = None

class EnvironmentalDataCreate(EnvironmentalDataBase):
    pass

class EnvironmentalDataResponse(EnvironmentalDataBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Disease Case Schemas
class DiseaseCaseBase(BaseModel):
    recorded_at: datetime
    disease_type: DiseaseType
    case_count: int = Field(..., ge=0)
    location: str
    severity: Optional[str] = None
    data_source: Optional[str] = None

class DiseaseCaseCreate(DiseaseCaseBase):
    pass

class DiseaseCaseResponse(DiseaseCaseBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Forecast Schemas
class ForecastRequest(BaseModel):
    disease_type: DiseaseType
    forecast_period_days: int = Field(..., ge=7, le=30)
    location: Optional[str] = None

class DiseaseForecastResponse(BaseModel):
    id: int
    forecast_date: date
    disease_type: str
    predicted_cases: int
    confidence_lower: Optional[int] = None
    confidence_upper: Optional[int] = None
    model_used: Optional[str] = None
    model_accuracy_mae: Optional[float] = None
    model_accuracy_rmse: Optional[float] = None
    model_accuracy_mape: Optional[float] = None
    forecast_period_days: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# Supply Requirement Schemas
class SupplyRequirementResponse(BaseModel):
    id: int
    supply_id: int
    supply_name: str
    required_quantity: int
    requirement_date: date
    disease_type: Optional[str] = None
    current_stock: Optional[int] = None
    shortage_amount: Optional[int] = None
    
    class Config:
        from_attributes = True

# Alert Schemas
class AlertResponse(BaseModel):
    id: int
    supply_id: int
    supply_name: str
    alert_type: str
    severity: AlertSeverity
    current_stock: Optional[int] = None
    required_stock: Optional[int] = None
    shortage_date: Optional[date] = None
    message: Optional[str] = None
    is_resolved: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Procurement Plan Schemas
class ProcurementPlanBase(BaseModel):
    supply_id: int
    order_quantity: int = Field(..., gt=0)
    order_date: date
    expected_delivery_date: Optional[date] = None
    estimated_cost: Optional[float] = None
    priority: Optional[str] = None
    notes: Optional[str] = None

class ProcurementPlanCreate(ProcurementPlanBase):
    pass

class ProcurementPlanResponse(ProcurementPlanBase):
    id: int
    supply_name: str
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Dashboard Schemas
class DashboardOverview(BaseModel):
    total_supplies: int
    total_value: float
    high_risk_shortages: int
    predicted_demand_30d: int
    disease_outbreaks: int
    supply_risk_percentage: float
    safe_stock_items: int
    low_stock_items: int
    critical_risk_items: int

class SupplyDemandPoint(BaseModel):
    date: date
    actual: Optional[int] = None
    forecast: Optional[int] = None

class SupplyDemandForecast(BaseModel):
    supply_id: int
    supply_name: str
    data_points: List[SupplyDemandPoint]
```

## 3. API Endpoints

### 3.1 Authentication & Users


```
POST   /api/v1/auth/login              # User login
POST   /api/v1/auth/logout             # User logout
POST   /api/v1/auth/refresh            # Refresh access token
GET    /api/v1/auth/me                 # Get current user info

GET    /api/v1/users                   # List all users (Admin only)
POST   /api/v1/users                   # Create new user (Admin only)
GET    /api/v1/users/{id}              # Get user by ID
PUT    /api/v1/users/{id}              # Update user
DELETE /api/v1/users/{id}              # Delete user (Admin only)
```

### 3.2 Medical Supplies

```
GET    /api/v1/supplies                # List all supplies (with filters)
POST   /api/v1/supplies                # Create new supply (Admin only)
GET    /api/v1/supplies/{id}           # Get supply by ID
PUT    /api/v1/supplies/{id}           # Update supply (Admin only)
DELETE /api/v1/supplies/{id}           # Delete supply (Admin only)
GET    /api/v1/supplies/categories     # Get all categories
```

### 3.3 Inventory Management

```
GET    /api/v1/inventory               # List all inventory items
GET    /api/v1/inventory/{id}          # Get inventory item by ID
PUT    /api/v1/inventory/{id}          # Update inventory stock
POST   /api/v1/inventory/batch-update  # Batch update multiple items
GET    /api/v1/inventory/low-stock     # Get low stock items
GET    /api/v1/inventory/expiring      # Get items expiring soon
```

### 3.4 Environmental Data

```
GET    /api/v1/environmental           # List environmental data
POST   /api/v1/environmental           # Create environmental data record
GET    /api/v1/environmental/latest    # Get latest environmental data
GET    /api/v1/environmental/range     # Get data for date range
```

### 3.5 Disease Cases (Epidemiological Data)

```
GET    /api/v1/disease-cases           # List disease cases
POST   /api/v1/disease-cases           # Create disease case record
GET    /api/v1/disease-cases/stats     # Get statistics by disease type
GET    /api/v1/disease-cases/trends    # Get trend data
```

### 3.6 Forecasting

```
POST   /api/v1/forecasts/generate      # Generate new forecast
GET    /api/v1/forecasts               # List all forecasts
GET    /api/v1/forecasts/{id}          # Get forecast by ID
GET    /api/v1/forecasts/latest        # Get latest forecast by disease type
GET    /api/v1/forecasts/accuracy      # Get model accuracy metrics
```

### 3.7 Supply Requirements

```
GET    /api/v1/supply-requirements     # List supply requirements
GET    /api/v1/supply-requirements/forecast/{forecast_id}  # Get requirements for forecast
GET    /api/v1/supply-requirements/summary  # Get summary by supply type
```

### 3.8 Alerts

```
GET    /api/v1/alerts                  # List all alerts
GET    /api/v1/alerts/active           # Get active alerts only
GET    /api/v1/alerts/{id}             # Get alert by ID
PUT    /api/v1/alerts/{id}/resolve     # Mark alert as resolved
GET    /api/v1/alerts/critical         # Get critical alerts
```

### 3.9 Procurement Planning

```
GET    /api/v1/procurement             # List procurement plans
POST   /api/v1/procurement/generate    # Generate procurement plan
GET    /api/v1/procurement/{id}        # Get plan by ID
PUT    /api/v1/procurement/{id}        # Update plan
DELETE /api/v1/procurement/{id}        # Delete plan
POST   /api/v1/procurement/{id}/approve  # Approve plan
GET    /api/v1/procurement/export      # Export plan (PDF/Excel)
```

### 3.10 Dashboard & Reports

```
GET    /api/v1/dashboard/overview      # Get dashboard overview metrics
GET    /api/v1/dashboard/supply-demand # Get supply demand forecast data
GET    /api/v1/dashboard/risk-status   # Get supply risk status
GET    /api/v1/dashboard/critical-alerts  # Get critical alerts for dashboard

GET    /api/v1/reports/consumption     # Get consumption report
GET    /api/v1/reports/forecast-accuracy  # Get forecast accuracy report
GET    /api/v1/reports/inventory-turnover  # Get inventory turnover report
POST   /api/v1/reports/export          # Export report (PDF)
```

### 3.11 Configuration

```
GET    /api/v1/config                  # Get all configurations
GET    /api/v1/config/{key}            # Get config by key
PUT    /api/v1/config/{key}            # Update config (Admin only)

GET    /api/v1/config/conversion-ratios  # Get conversion ratios
PUT    /api/v1/config/conversion-ratios  # Update conversion ratios (Admin only)
GET    /api/v1/config/thresholds       # Get shortage thresholds
PUT    /api/v1/config/thresholds       # Update thresholds (Admin only)
```

### 3.12 Audit & Logs

```
GET    /api/v1/audit-logs              # Get audit logs (Admin only)
GET    /api/v1/system-logs             # Get system logs (Admin only)
GET    /api/v1/system-logs/errors      # Get error logs only
```

## 4. AI/ML Module Design

### 4.1 Forecasting Pipeline

```python
# ai_engine/forecasting_pipeline.py

class ForecastingPipeline:
    """
    Main forecasting pipeline combining multiple models
    """
    
    def __init__(self):
        self.xgboost_model = XGBoostForecaster()
        self.lstm_model = LSTMForecaster()
        self.prophet_model = ProphetForecaster()
        self.ensemble = EnsembleForecaster()
    
    def prepare_features(self, historical_data, environmental_data):
        """
        Feature engineering:
        - Lag features (7, 14, 30 days)
        - Rolling statistics (mean, std, min, max)
        - Seasonal features (month, week, day of week)
        - Environmental features (temp, humidity, rainfall, AQI)
        - Trend features
        """
        pass
    
    def train_models(self, training_data):
        """
        Train all three models on historical data
        """
        pass
    
    def generate_forecast(self, disease_type, forecast_period_days):
        """
        Generate ensemble forecast:
        1. Get predictions from XGBoost, LSTM, Prophet
        2. Combine using weighted average or stacking
        3. Calculate confidence intervals
        4. Return forecast with accuracy metrics
        """
        pass
    
    def evaluate_models(self, test_data):
        """
        Calculate MAE, RMSE, MAPE for each model
        """
        pass
```

### 4.2 Model Specifications

#### XGBoost Model
```python
# ai_engine/models/xgboost_forecaster.py

class XGBoostForecaster:
    """
    Gradient boosting for disease case forecasting
    
    Features:
    - Historical case counts (lag 7, 14, 30 days)
    - Rolling statistics (7-day, 14-day averages)
    - Temperature, humidity, rainfall, AQI
    - Seasonal indicators (month, week)
    - Trend features
    
    Hyperparameters:
    - n_estimators: 100-500
    - max_depth: 3-7
    - learning_rate: 0.01-0.1
    - subsample: 0.8
    """
    
    def __init__(self):
        self.model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42
        )
```

#### LSTM Model
```python
# ai_engine/models/lstm_forecaster.py

class LSTMForecaster:
    """
    LSTM neural network for time series forecasting
    
    Architecture:
    - Input: Sequence of 30 days
    - LSTM Layer 1: 64 units, return_sequences=True
    - Dropout: 0.2
    - LSTM Layer 2: 32 units
    - Dropout: 0.2
    - Dense: 16 units, ReLU
    - Output: forecast_period_days units
    
    Training:
    - Loss: MSE
    - Optimizer: Adam (lr=0.001)
    - Epochs: 50-100
    - Batch size: 32
    """
    
    def build_model(self, sequence_length, n_features):
        model = Sequential([
            LSTM(64, return_sequences=True, input_shape=(sequence_length, n_features)),
            Dropout(0.2),
            LSTM(32),
            Dropout(0.2),
            Dense(16, activation='relu'),
            Dense(self.forecast_period)
        ])
        model.compile(optimizer='adam', loss='mse', metrics=['mae'])
        return model
```

#### Prophet Model
```python
# ai_engine/models/prophet_forecaster.py

class ProphetForecaster:
    """
    Facebook Prophet for time series with seasonality
    
    Configuration:
    - Yearly seasonality: True
    - Weekly seasonality: True
    - Daily seasonality: False
    - Changepoint prior scale: 0.05
    - Seasonality prior scale: 10
    
    Regressors:
    - Temperature
    - Humidity
    - Rainfall
    - Air quality index
    """
    
    def __init__(self):
        self.model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            changepoint_prior_scale=0.05,
            seasonality_prior_scale=10
        )
        # Add regressors
        self.model.add_regressor('temperature')
        self.model.add_regressor('humidity')
        self.model.add_regressor('rainfall')
        self.model.add_regressor('air_quality_index')
```

### 4.3 Ensemble Strategy

```python
# ai_engine/ensemble.py

class EnsembleForecaster:
    """
    Combine predictions from multiple models
    
    Strategy: Weighted average based on historical performance
    - XGBoost weight: 0.4 (good for non-linear patterns)
    - LSTM weight: 0.35 (good for temporal dependencies)
    - Prophet weight: 0.25 (good for seasonality)
    
    Weights can be adjusted based on validation performance
    """
    
    def combine_predictions(self, xgb_pred, lstm_pred, prophet_pred):
        weights = [0.4, 0.35, 0.25]
        ensemble_pred = (
            weights[0] * xgb_pred +
            weights[1] * lstm_pred +
            weights[2] * prophet_pred
        )
        return ensemble_pred
    
    def calculate_confidence_intervals(self, predictions, std_dev):
        """
        Calculate 95% confidence intervals
        """
        lower = predictions - 1.96 * std_dev
        upper = predictions + 1.96 * std_dev
        return lower, upper
```

### 4.4 Conversion Module

```python
# ai_engine/conversion.py

class ConversionModule:
    """
    Convert disease case forecasts to supply requirements
    
    Default conversion ratios per case:
    - Masks: 2 units
    - Gloves: 4 units (2 pairs)
    - Test kits: 1 unit
    - Disinfectant: 0.5 liters
    - Medications: varies by disease type
    
    Ratios are configurable per disease type and supply type
    """
    
    def __init__(self, db_session):
        self.db = db_session
        self.ratios = self.load_conversion_ratios()
    
    def calculate_requirements(self, forecast_id, disease_forecasts):
        """
        For each forecasted case count:
        1. Get conversion ratios for disease type
        2. Calculate required quantity for each supply
        3. Store in supply_requirements table
        """
        requirements = []
        for forecast in disease_forecasts:
            disease_type = forecast.disease_type
            case_count = forecast.predicted_cases
            
            for supply_id, ratio in self.ratios[disease_type].items():
                required_qty = int(case_count * ratio)
                requirements.append({
                    'forecast_id': forecast_id,
                    'supply_id': supply_id,
                    'required_quantity': required_qty,
                    'requirement_date': forecast.forecast_date,
                    'disease_type': disease_type
                })
        
        return requirements
```

## 5. Frontend Design (Stitch UI Style)

### 5.1 Component Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx              # Navigation sidebar
│   │   ├── Header.tsx               # Top header with search, notifications
│   │   └── Layout.tsx               # Main layout wrapper
│   ├── dashboard/
│   │   ├── MetricCard.tsx           # Reusable metric card
│   │   ├── SupplyDemandChart.tsx    # Line chart component
│   │   ├── RiskStatusChart.tsx      # Donut chart component
│   │   └── CriticalAlertsTable.tsx  # Alerts table
│   ├── inventory/
│   │   ├── InventoryTable.tsx       # Main inventory table
│   │   ├── StockStatusBadge.tsx     # Status indicator
│   │   ├── AIInsightPanel.tsx       # Blue AI insight card
│   │   └── InventoryFilters.tsx     # Filter controls
│   ├── forecasting/
│   │   ├── ForecastChart.tsx        # Forecast visualization
│   │   ├── ModelAccuracyCard.tsx    # Model metrics display
│   │   └── ForecastControls.tsx     # Period selection, disease type
│   ├── alerts/
│   │   ├── AlertsList.tsx           # Alerts list view
│   │   ├── AlertCard.tsx            # Individual alert card
│   │   └── AlertFilters.tsx         # Severity, date filters
│   ├── reports/
│   │   ├── ConsumptionReport.tsx    # Consumption analytics
│   │   ├── PerformanceTable.tsx     # Monthly performance table
│   │   └── ExportButton.tsx         # PDF/Excel export
│   └── common/
│       ├── Button.tsx               # Styled button component
│       ├── Card.tsx                 # Card container
│       ├── Table.tsx                # Reusable table
│       ├── Badge.tsx                # Status badges
│       ├── Modal.tsx                # Modal dialog
│       └── LoadingSpinner.tsx       # Loading indicator
├── pages/
│   ├── Dashboard.tsx                # Overview page
│   ├── Inventory.tsx                # Inventory management
│   ├── Forecasting.tsx              # Forecasting page
│   ├── Alerts.tsx                   # Alerts page
│   ├── Epidemiology.tsx             # Disease data page
│   ├── Reports.tsx                  # Reports page
│   └── Settings.tsx                 # Configuration page
├── hooks/
│   ├── useAuth.ts                   # Authentication hook
│   ├── useDashboard.ts              # Dashboard data hook
│   ├── useInventory.ts              # Inventory operations
│   └── useForecast.ts               # Forecasting operations
├── services/
│   ├── api.ts                       # Axios instance
│   ├── authService.ts               # Auth API calls
│   ├── inventoryService.ts          # Inventory API calls
│   ├── forecastService.ts           # Forecast API calls
│   └── dashboardService.ts          # Dashboard API calls
├── store/
│   ├── authStore.ts                 # Auth state (Zustand)
│   └── uiStore.ts                   # UI state (sidebar, modals)
├── types/
│   ├── auth.ts                      # Auth types
│   ├── inventory.ts                 # Inventory types
│   ├── forecast.ts                  # Forecast types
│   └── dashboard.ts                 # Dashboard types
└── utils/
    ├── formatters.ts                # Number, date formatters
    ├── validators.ts                # Form validators
    └── constants.ts                 # App constants
```

### 5.2 Key UI Components


#### MetricCard Component (Dashboard)
```tsx
// components/dashboard/MetricCard.tsx
interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'warning' | 'success' | 'info';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title, value, subtitle, icon, trend, variant = 'default'
}) => {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${getIconBgColor(variant)}`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center">
          <span className={`text-sm font-medium ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
        </div>
      )}
    </div>
  );
};
```

#### AIInsightPanel Component
```tsx
// components/inventory/AIInsightPanel.tsx
interface AIInsightPanelProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const AIInsightPanel: React.FC<AIInsightPanelProps> = ({
  title, message, actionLabel, onAction
}) => {
  return (
    <div className="bg-blue-600 text-white rounded-lg p-6 shadow-lg">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <SparklesIcon className="h-6 w-6" />
        </div>
        <div className="ml-4 flex-1">
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-blue-100 text-sm mb-4">{message}</p>
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="bg-white text-blue-600 px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-50 transition"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
```

#### StockStatusBadge Component
```tsx
// components/inventory/StockStatusBadge.tsx
type StockStatus = 'critical' | 'low' | 'safe';

interface StockStatusBadgeProps {
  status: StockStatus;
  label?: string;
}

export const StockStatusBadge: React.FC<StockStatusBadgeProps> = ({
  status, label
}) => {
  const styles = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    low: 'bg-orange-100 text-orange-800 border-orange-200',
    safe: 'bg-green-100 text-green-800 border-green-200'
  };
  
  const displayLabel = label || status.charAt(0).toUpperCase() + status.slice(1);
  
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
      {displayLabel}
    </span>
  );
};
```

### 5.3 Color Palette (Stitch Style)

```css
/* tailwind.config.js - Custom colors */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',  // Main blue
          600: '#2563eb',
          700: '#1d4ed8',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f97316',
          600: '#ea580c',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          500: '#6b7280',
          700: '#374151',
          900: '#111827',
        }
      }
    }
  }
}
```

## 6. Project Structure

```
medical-supply-forecasting/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI app entry
│   │   ├── config.py                # Configuration
│   │   ├── database.py              # Database connection
│   │   ├── dependencies.py          # Dependency injection
│   │   ├── models/                  # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── supply.py
│   │   │   ├── inventory.py
│   │   │   ├── environmental.py
│   │   │   ├── disease.py
│   │   │   ├── forecast.py
│   │   │   └── alert.py
│   │   ├── schemas/                 # Pydantic schemas
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── supply.py
│   │   │   ├── inventory.py
│   │   │   ├── forecast.py
│   │   │   └── dashboard.py
│   │   ├── api/                     # API routes
│   │   │   ├── __init__.py
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── auth.py
│   │   │   │   ├── users.py
│   │   │   │   ├── supplies.py
│   │   │   │   ├── inventory.py
│   │   │   │   ├── environmental.py
│   │   │   │   ├── disease_cases.py
│   │   │   │   ├── forecasts.py
│   │   │   │   ├── alerts.py
│   │   │   │   ├── procurement.py
│   │   │   │   ├── dashboard.py
│   │   │   │   ├── reports.py
│   │   │   │   └── config.py
│   │   ├── services/                # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py
│   │   │   ├── inventory_service.py
│   │   │   ├── forecast_service.py
│   │   │   ├── alert_service.py
│   │   │   └── procurement_service.py
│   │   ├── ai_engine/               # AI/ML modules
│   │   │   ├── __init__.py
│   │   │   ├── forecasting_pipeline.py
│   │   │   ├── conversion.py
│   │   │   ├── models/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── xgboost_forecaster.py
│   │   │   │   ├── lstm_forecaster.py
│   │   │   │   ├── prophet_forecaster.py
│   │   │   │   └── ensemble.py
│   │   │   ├── feature_engineering.py
│   │   │   └── model_evaluation.py
│   │   ├── core/                    # Core utilities
│   │   │   ├── __init__.py
│   │   │   ├── security.py          # Password hashing, JWT
│   │   │   ├── logging.py           # Logging setup
│   │   │   └── exceptions.py        # Custom exceptions
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── validators.py
│   │       └── helpers.py
│   ├── alembic/                     # Database migrations
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_auth.py
│   │   ├── test_inventory.py
│   │   ├── test_forecasting.py
│   │   └── test_ai_engine.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/              # (as detailed in 5.1)
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── store/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── .env.example
├── data/                            # Data files
│   ├── data_HM_2025_1.csv
│   ├── data_HM_2025_2.csv
│   └── data_HM_2026_1.csv
├── docker-compose.yml
├── .gitignore
└── README.md
```

## 7. Key Workflows

### 7.1 Forecasting Workflow

```
1. User requests forecast (disease type, period)
   ↓
2. API validates request and checks authentication
   ↓
3. Forecast Service retrieves historical data:
   - Disease cases (past 90 days minimum)
   - Environmental data (same period)
   ↓
4. AI Engine processes data:
   a. Feature engineering (lags, rolling stats, seasonality)
   b. Generate predictions from XGBoost, LSTM, Prophet
   c. Ensemble predictions with weighted average
   d. Calculate confidence intervals
   e. Evaluate model accuracy (MAE, RMSE, MAPE)
   ↓
5. Store forecast in database
   ↓
6. Conversion Module calculates supply requirements:
   - Apply conversion ratios per disease/supply
   - Store requirements in database
   ↓
7. Alert Module checks for shortages:
   - Compare requirements vs current inventory
   - Generate alerts if below threshold
   - Send notifications to users
   ↓
8. Return forecast results to frontend
   ↓
9. Dashboard displays:
   - Forecast chart
   - Supply requirements
   - Active alerts
   - Model accuracy metrics
```

### 7.2 Inventory Update Workflow

```
1. User updates inventory stock levels
   ↓
2. API validates data (non-negative, required fields)
   ↓
3. Inventory Service updates database
   ↓
4. Alert Module re-evaluates alerts:
   - Check if shortage resolved
   - Clear resolved alerts
   - Generate new alerts if needed
   ↓
5. Audit log records the change
   ↓
6. Return updated inventory to frontend
   ↓
7. Dashboard refreshes metrics
```

### 7.3 Procurement Planning Workflow

```
1. System detects shortage alert (critical/high)
   ↓
2. Procurement Planner triggered:
   a. Get supply requirements for forecast period
   b. Get current inventory levels
   c. Calculate shortage amount
   d. Consider lead time and minimum order quantity
   e. Optimize order timing to maintain safety stock
   f. Calculate estimated costs
   ↓
3. Generate procurement plan
   ↓
4. Store plan in database
   ↓
5. Display on dashboard with priority indicators
   ↓
6. User reviews and approves plan
   ↓
7. Export plan to PDF/Excel for procurement team
```

## 8. Security Considerations

### 8.1 Authentication & Authorization

- **JWT tokens** with 24-hour expiration
- **Refresh tokens** for extended sessions
- **Role-based access control** (RBAC):
  - Administrator: Full access
  - Pharmacist: Read-only forecasts, reports
  - Inventory_Manager: Update inventory, view alerts
- **Password requirements**: Minimum 8 characters, bcrypt hashing
- **Session timeout**: 30 minutes of inactivity

### 8.2 Data Security

- **TLS 1.2+** for all API communications
- **AES-256 encryption** for sensitive database fields
- **SQL injection protection**: Parameterized queries via SQLAlchemy
- **XSS protection**: Input sanitization, Content Security Policy
- **CSRF protection**: CSRF tokens for state-changing operations
- **Rate limiting**: 100 requests/minute per user

### 8.3 Audit & Compliance

- **Audit logs** for all data modifications
- **Access logs** for sensitive data views
- **90-day log retention**
- **HIPAA-compliant** data handling (if applicable)

## 9. Performance Optimization

### 9.1 Database Optimization

- **Indexes** on frequently queried columns
- **Connection pooling** (SQLAlchemy pool_size=20)
- **Query optimization**: Eager loading, select specific columns
- **Partitioning**: Time-series tables by month (optional)

### 9.2 API Optimization

- **Response caching**: Redis for dashboard metrics (5-minute TTL)
- **Pagination**: Limit 50 items per page
- **Async operations**: FastAPI async endpoints
- **Background tasks**: Celery for long-running forecasts

### 9.3 Frontend Optimization

- **Code splitting**: Lazy load routes
- **Memoization**: React.memo for expensive components
- **Debouncing**: Search inputs, filter changes
- **Virtual scrolling**: Large tables (react-window)
- **Image optimization**: WebP format, lazy loading

## 10. Deployment Strategy

### 10.1 Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    environment:
      DATABASE_URL: sqlite:///./data/medforecast.db
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: ${SECRET_KEY}
    depends_on:
      - redis
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - ./data:/app/data
      - ml_models:/app/ml_models

  celery_worker:
    build: ./backend
    command: celery -A app.celery_app worker --loglevel=info
    environment:
      DATABASE_URL: sqlite:///./data/medforecast.db
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - redis
    volumes:
      - ./data:/app/data

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - frontend
      - backend

volumes:
  ml_models:
```

### 10.2 Environment Variables

```bash
# .env.example

# Database
DATABASE_URL=sqlite:///./data/medforecast.db

# Redis
REDIS_URL=redis://localhost:6379/0

# Security
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# External APIs
OPENWEATHER_API_KEY=your_api_key
HEALTH_DEPT_API_URL=https://api.health.gov.vn
HEALTH_DEPT_API_KEY=your_api_key

# Email/SMS
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_password

# Frontend
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## 11. Testing Strategy

### 11.1 Backend Testing

- **Unit tests**: pytest for services, AI models
- **Integration tests**: API endpoints with test database
- **Model tests**: Forecast accuracy validation
- **Coverage target**: 80%+

### 11.2 Frontend Testing

- **Unit tests**: Vitest for components, hooks
- **Integration tests**: React Testing Library
- **E2E tests**: Playwright (optional)
- **Coverage target**: 70%+

## 12. Monitoring & Maintenance

### 12.1 Monitoring

- **Application logs**: Python logging to files
- **Error tracking**: Sentry (optional)
- **Performance metrics**: Response times, query times
- **Health checks**: `/health` endpoint

### 12.2 Maintenance Tasks

- **Daily**: Automated database backup (2:00 AM)
- **Weekly**: Model retraining if data threshold met
- **Monthly**: Log cleanup (retain 90 days)
- **Quarterly**: Security audit, dependency updates

## 13. Future Enhancements

1. **Mobile app**: React Native for iOS/Android
2. **Advanced analytics**: Predictive analytics for multiple scenarios
3. **Integration**: ERP systems, hospital management systems
4. **Multi-language**: Vietnamese, English support
5. **Real-time updates**: WebSocket for live dashboard
6. **Advanced ML**: Deep learning models, AutoML
7. **Geographic expansion**: Support for multiple regions
8. **Supply chain optimization**: Vendor management, cost optimization

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-15  
**Author**: MedForecast AI Development Team
