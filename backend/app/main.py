"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.logging import setup_logging
from app.database import Base, engine

# ── Logging ──────────────────────────────────────────────────────────────────
setup_logging(settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# ── Database ──────────────────────────────────────────────────────────────────
# Import all models so SQLAlchemy registers them before create_all
import app.models  # noqa: F401, E402

Base.metadata.create_all(bind=engine)
logger.info("Database tables verified / created.")

# ── Application ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: run startup logic then yield."""
    # Startup: run log retention cleanup once (non-fatal if it fails)
    try:
        from app.database import SessionLocal
        from app.services.audit_log_service import AuditLogService

        db = SessionLocal()
        try:
            service = AuditLogService(db)
            result = service.delete_old_logs()
            logger.info(
                "Startup log cleanup: audit_deleted=%d system_deleted=%d",
                result["audit_logs_deleted"],
                result["system_logs_deleted"],
            )
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Startup log cleanup failed (non-fatal): %s", exc)

    yield
    # Shutdown: nothing to do


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="AI-powered medical supply forecasting system for hospitals",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("CORS configured for origins: %s", settings.cors_origins_list)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/", tags=["root"])
async def root():
    """Root endpoint — basic service info."""
    return {
        "message": "MedForecast AI - Medical Supply Forecasting System",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
    }


@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "medforecast-api",
        "version": settings.VERSION,
    }


# ── API Routes ────────────────────────────────────────────────────────────────
from app.api.v1 import auth, users, supplies, inventory, environmental, disease_cases, forecasts, supply_requirements, alerts, procurement, dashboard, reports, config, audit_logs, forecast_v2

app.include_router(auth.router, prefix="/api/v1/auth", tags=["authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(supplies.router, prefix="/api/v1/supplies", tags=["medical-supplies"])
app.include_router(inventory.router, prefix="/api/v1/inventory", tags=["inventory"])
app.include_router(environmental.router, prefix="/api/v1/environmental", tags=["environmental-data"])
app.include_router(disease_cases.router, prefix="/api/v1/disease-cases", tags=["disease-cases"])
app.include_router(forecasts.router, prefix="/api/v1/forecasts", tags=["forecasts"])
app.include_router(supply_requirements.router, prefix="/api/v1/supply-requirements", tags=["supply-requirements"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["alerts"])
app.include_router(procurement.router, prefix="/api/v1/procurement", tags=["procurement"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(config.router, prefix="/api/v1/config", tags=["configuration"])
app.include_router(audit_logs.router, prefix="/api/v1", tags=["audit-logs"])
app.include_router(forecast_v2.router, prefix="/api/v1/forecast-v2", tags=["forecast-v2"])
