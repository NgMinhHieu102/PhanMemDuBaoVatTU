"""Integration tests for forecast API endpoints."""
import pytest
from datetime import datetime, date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.models.disease_forecast import DiseaseForecast
from app.models.disease_case import DiseaseCase
from app.models.environmental_data import EnvironmentalData
from app.core.security import get_password_hash, create_access_token


# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_forecasts.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with database override."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session):
    """Create a test user."""
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=get_password_hash("testpassword"),
        full_name="Test User",
        role="Administrator",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user):
    """Create authentication headers."""
    access_token = create_access_token(data={"sub": test_user.username})
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def sample_forecasts(db_session):
    """Create sample forecast data."""
    forecasts = []
    for i in range(5):
        forecast = DiseaseForecast(
            forecast_date=date.today() + timedelta(days=i+1),
            disease_type="dengue_fever",
            predicted_cases=100 + i * 10,
            confidence_lower=80 + i * 10,
            confidence_upper=120 + i * 10,
            model_used="ensemble",
            model_accuracy_mae=5.2,
            model_accuracy_rmse=7.8,
            model_accuracy_mape=4.5,
            forecast_period_days=7
        )
        db_session.add(forecast)
        forecasts.append(forecast)
    
    db_session.commit()
    return forecasts


@pytest.fixture
def historical_data(db_session):
    """Create historical disease case and environmental data for testing."""
    # Create 90 days of historical data
    for i in range(90):
        recorded_date = datetime.now() - timedelta(days=90-i)
        
        # Disease case data
        case = DiseaseCase(
            recorded_at=recorded_date,
            disease_type="dengue_fever",
            case_count=50 + (i % 20),  # Varying case counts
            location="Ho Chi Minh City",
            severity="moderate",
            data_source="test_data"
        )
        db_session.add(case)
        
        # Environmental data
        env = EnvironmentalData(
            recorded_at=recorded_date,
            location="Ho Chi Minh City",
            temperature=28.0 + (i % 5),
            humidity=75.0 + (i % 10),
            rainfall=10.0 + (i % 15),
            air_quality_index=50 + (i % 30),
            data_source="test_data"
        )
        db_session.add(env)
    
    db_session.commit()


class TestForecastAPI:
    """Test cases for forecast API endpoints."""
    
    def test_list_forecasts_success(self, client, auth_headers, sample_forecasts):
        """Test listing forecasts successfully."""
        response = client.get("/api/v1/forecasts", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5
        assert data[0]["disease_type"] == "dengue_fever"
    
    def test_list_forecasts_with_disease_filter(self, client, auth_headers, sample_forecasts):
        """Test listing forecasts with disease type filter."""
        response = client.get(
            "/api/v1/forecasts?disease_type=dengue_fever",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5
        assert all(f["disease_type"] == "dengue_fever" for f in data)
    
    def test_list_forecasts_with_date_range(self, client, auth_headers, sample_forecasts):
        """Test listing forecasts with date range filter."""
        start_date = date.today()
        end_date = date.today() + timedelta(days=3)
        
        response = client.get(
            f"/api/v1/forecasts?start_date={start_date}&end_date={end_date}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 3
    
    def test_list_forecasts_with_pagination(self, client, auth_headers, sample_forecasts):
        """Test listing forecasts with pagination."""
        response = client.get(
            "/api/v1/forecasts?limit=2&offset=0",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
    
    def test_list_forecasts_unauthorized(self, client, sample_forecasts):
        """Test listing forecasts without authentication."""
        response = client.get("/api/v1/forecasts")
        
        assert response.status_code == 401
    
    def test_get_forecast_by_id_success(self, client, auth_headers, sample_forecasts):
        """Test getting a specific forecast by ID."""
        forecast_id = sample_forecasts[0].id
        response = client.get(f"/api/v1/forecasts/{forecast_id}", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == forecast_id
        assert data["disease_type"] == "dengue_fever"
    
    def test_get_forecast_by_id_not_found(self, client, auth_headers):
        """Test getting a forecast that doesn't exist."""
        response = client.get("/api/v1/forecasts/999", headers=auth_headers)
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
    
    def test_get_latest_forecast_success(self, client, auth_headers, sample_forecasts):
        """Test getting the latest forecast for a disease type."""
        response = client.get(
            "/api/v1/forecasts/latest/dengue_fever",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["disease_type"] == "dengue_fever"
    
    def test_get_latest_forecast_not_found(self, client, auth_headers):
        """Test getting latest forecast when none exists."""
        response = client.get(
            "/api/v1/forecasts/latest/seasonal_flu",
            headers=auth_headers
        )
        
        assert response.status_code == 404
    
    def test_get_accuracy_metrics_success(self, client, auth_headers, sample_forecasts):
        """Test getting accuracy metrics."""
        response = client.get(
            "/api/v1/forecasts/accuracy/metrics",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "mae" in data
        assert "rmse" in data
        assert "mape" in data
        assert data["count"] == 5
    
    def test_get_accuracy_metrics_with_disease_filter(self, client, auth_headers, sample_forecasts):
        """Test getting accuracy metrics with disease type filter."""
        response = client.get(
            "/api/v1/forecasts/accuracy/metrics?disease_type=dengue_fever",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["disease_type"] == "dengue_fever"
        assert data["mae"] == 5.2
        assert data["rmse"] == 7.8
        assert data["mape"] == 4.5
    
    def test_get_accuracy_metrics_no_data(self, client, auth_headers):
        """Test getting accuracy metrics when no forecasts exist."""
        response = client.get(
            "/api/v1/forecasts/accuracy/metrics",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["mae"] is None
    
    def test_generate_forecast_request_format(self, client, auth_headers, historical_data):
        """Test forecast generation request format validation."""
        # Test with valid request
        request_data = {
            "disease_type": "dengue_fever",
            "forecast_period_days": 7
        }
        
        response = client.post(
            "/api/v1/forecasts/generate",
            json=request_data,
            headers=auth_headers
        )
        
        # Should return 202 (Accepted) or 200 depending on Celery availability
        assert response.status_code in [200, 202]
    
    def test_generate_forecast_invalid_period(self, client, auth_headers):
        """Test forecast generation with invalid period."""
        request_data = {
            "disease_type": "dengue_fever",
            "forecast_period_days": 5  # Less than minimum 7
        }
        
        response = client.post(
            "/api/v1/forecasts/generate",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 422  # Validation error
    
    def test_generate_forecast_period_too_long(self, client, auth_headers):
        """Test forecast generation with period exceeding maximum."""
        request_data = {
            "disease_type": "dengue_fever",
            "forecast_period_days": 35  # More than maximum 30
        }
        
        response = client.post(
            "/api/v1/forecasts/generate",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 422  # Validation error
    
    def test_generate_forecast_unauthorized(self, client):
        """Test forecast generation without authentication."""
        request_data = {
            "disease_type": "dengue_fever",
            "forecast_period_days": 7
        }
        
        response = client.post(
            "/api/v1/forecasts/generate",
            json=request_data
        )
        
        assert response.status_code == 401
    
    def test_forecast_period_7_days(self, client, auth_headers, historical_data):
        """Test that 7-day forecast completes within acceptable time."""
        request_data = {
            "disease_type": "dengue_fever",
            "forecast_period_days": 7
        }
        
        import time
        start_time = time.time()
        
        response = client.post(
            "/api/v1/forecasts/generate",
            json=request_data,
            headers=auth_headers
        )
        
        elapsed_time = time.time() - start_time
        
        # Should complete or be accepted
        assert response.status_code in [200, 202]
        
        # If synchronous (200), should complete within 30 seconds
        if response.status_code == 200:
            assert elapsed_time < 30, f"7-day forecast took {elapsed_time:.2f}s, expected < 30s"
    
    def test_forecast_stores_accuracy_metrics(self, client, auth_headers, sample_forecasts):
        """Test that forecasts store MAE, RMSE, MAPE metrics."""
        forecast_id = sample_forecasts[0].id
        response = client.get(f"/api/v1/forecasts/{forecast_id}", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check that accuracy metrics are present
        assert data["model_accuracy_mae"] is not None
        assert data["model_accuracy_rmse"] is not None
        assert data["model_accuracy_mape"] is not None
        
        # Check that values are reasonable
        assert data["model_accuracy_mae"] > 0
        assert data["model_accuracy_rmse"] > 0
        assert data["model_accuracy_mape"] > 0
