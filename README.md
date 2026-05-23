# MedForecast AI - Hệ thống Dự báo Nhu cầu Vật tư Y tế

Hệ thống AI/ML dự báo nhu cầu vật tư y tế dựa trên dữ liệu môi trường và dịch tễ cho khu vực TP.HCM và các tỉnh lân cận.

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: SQLite 3.35+ (file-based, no server needed)
- **ORM**: SQLAlchemy 2.0
- **Authentication**: JWT (python-jose)
- **Background Tasks**: FastAPI BackgroundTasks (built-in)
- **ML/AI**: XGBoost, LSTM (TensorFlow), Prophet

### Frontend
- **Framework**: React 18+ with TypeScript
- **Styling**: Tailwind CSS (Stitch Design System)
- **State Management**: React Query + Zustand
- **Charts**: Recharts
- **Build Tool**: Vite

### DevOps
- **Containerization**: Docker (optional for deployment)
- **Simple Deployment**: Single server with SQLite

## Features

- 🤖 **AI-Powered Forecasting**: Ensemble model (XGBoost + LSTM + Prophet)
- 📊 **Real-time Dashboard**: Stitch design với metrics và charts
- 🚨 **Smart Alerts**: Cảnh báo thiếu hụt vật tư tự động
- 📦 **Inventory Management**: Quản lý tồn kho thời gian thực
- 📈 **Procurement Planning**: Đề xuất kế hoạch nhập hàng tối ưu
- 🔐 **Role-based Access**: 3 roles (Administrator, Pharmacist, Inventory_Manager)
- 📱 **Responsive Design**: Hoạt động trên desktop và mobile

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+

### Installation

#### 1. Clone repository
```bash
git clone <repository-url>
cd webyte
```

#### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create database and run migrations
alembic upgrade head

# Create initial admin user
python scripts/seed_data.py

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at: http://localhost:8000
API Documentation: http://localhost:8000/docs

#### 3. Frontend Setup
```bash
cd frontend
npm install

# Run development server
npm run dev
```

Frontend will be available at: http://localhost:3000

**That's it!** No Docker, no Redis needed. Everything runs with SQLite.

## Project Structure

```
webyte/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic
│   │   ├── ai_engine/      # ML models
│   │   └── core/           # Core utilities
│   ├── alembic/            # Database migrations
│   ├── tests/              # Backend tests
│   └── requirements.txt
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API services
│   │   └── store/          # State management
│   └── package.json
├── data/                   # Data files and SQLite database
├── docker-compose.yml
└── README.md
```

## Environment Variables

### Backend (.env)
```bash
DATABASE_URL=sqlite:///./data/medforecast.db
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

REDIS_URL=redis://localhost:6379/0

# External APIs (optional)
OPENWEATHER_API_KEY=your-api-key
HEALTH_DEPT_API_URL=https://api.health.gov.vn
HEALTH_DEPT_API_KEY=your-api-key

# Email/SMS (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password
```

### Frontend (.env)
```bash
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## Default Credentials

After running seed script:
- **Username**: admin
- **Password**: admin123
- **Role**: Administrator

⚠️ **Important**: Change default password in production!

## API Documentation

Interactive API documentation available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Testing

### Backend Tests
```bash
cd backend
pytest
pytest --cov=app tests/  # With coverage
```

### Frontend Tests
```bash
cd frontend
npm run test
npm run test:coverage
```

## Deployment

See [deployment documentation](docs/deployment.md) for production deployment instructions.

## ML Models

The system uses an ensemble of three models:

1. **XGBoost** (40% weight): Gradient boosting for non-linear patterns
2. **LSTM** (35% weight): Deep learning for temporal dependencies
3. **Prophet** (25% weight): Time series with seasonality

Models are automatically retrained when new data exceeds 10% of training dataset.

## Data Requirements

- **Minimum historical data**: 90 days
- **Disease types**: Dengue fever, Seasonal flu, Respiratory diseases
- **Environmental data**: Temperature, Humidity, Rainfall, Air Quality Index
- **Update frequency**: Daily

## Support

For issues and questions:
- Create an issue on GitHub
- Contact: support@medforecast.ai

## License

Proprietary - All rights reserved

## Contributors

- Development Team
- Medical Advisory Board
- Data Science Team

---

**Version**: 1.0.0  
**Last Updated**: 2026-05-15
