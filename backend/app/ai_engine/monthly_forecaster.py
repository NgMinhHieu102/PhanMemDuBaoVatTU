"""
Monthly Disease Case Forecaster - Module 3

Công thức dự báo:
    Số ca dự báo = Ca nền cùng kỳ × Hệ số thời tiết × Hệ số xu hướng gần đây

Trong đó:
- Ca nền cùng kỳ = Trung bình số ca bệnh cùng tháng các năm trước
- Hệ số thời tiết = 1 + (correlation × (weather_forecast - weather_avg) / weather_std)
- Hệ số xu hướng = Số ca tháng trước / Trung bình 3 tháng gần nhất

Kết hợp thêm hồi quy tuyến tính để tinh chỉnh.
"""

import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from .config import SAVED_MODELS_DIR

logger = logging.getLogger(__name__)


class MonthlyForecaster:
    """
    Dự báo số ca bệnh theo tháng.
    
    Công thức chính:
        Dự báo = Ca_nền_cùng_kỳ × Hệ_số_thời_tiết × Hệ_số_xu_hướng
    
    Sau đó dùng hồi quy tuyến tính để hiệu chỉnh kết quả.
    """
    
    def __init__(self, disease_type: str):
        self.disease_type = disease_type
        self.is_trained = False
        self.training_metrics: Dict[str, float] = {}
        
        # Learned parameters
        self.monthly_baselines: Dict[int, float] = {}  # Ca nền theo tháng
        self.weather_correlations: Dict[str, float] = {}  # Hệ số tương quan thời tiết
        self.weather_means: Dict[str, float] = {}  # Trung bình thời tiết
        self.weather_stds: Dict[str, float] = {}  # Độ lệch chuẩn thời tiết
        self.regression_coef: float = 1.0  # Hệ số hiệu chỉnh hồi quy
        self.regression_intercept: float = 0.0
        
        logger.info(f"Initialized MonthlyForecaster for {disease_type}")
    
    def train(
        self,
        monthly_cases: pd.DataFrame,
        weather_data: Optional[pd.DataFrame] = None
    ) -> Dict[str, float]:
        """
        Train model từ dữ liệu lịch sử.
        
        Args:
            monthly_cases: DataFrame với columns [YearMonth, year, month, cases_*]
            weather_data: DataFrame với columns [YearMonth, temp, humidity, rainfall, aqi]
        """
        logger.info(f"Training MonthlyForecaster for {self.disease_type}")
        
        case_col = self._get_case_column()
        if case_col not in monthly_cases.columns:
            case_col = 'total_cases'
        
        df = monthly_cases.copy().sort_values('YearMonth')
        
        # 1. Tính ca nền cùng kỳ (trung bình theo tháng)
        for month in range(1, 13):
            month_data = df[df['month'] == month][case_col]
            self.monthly_baselines[month] = month_data.mean() if len(month_data) > 0 else 0
        
        # 2. Tính hệ số tương quan thời tiết
        if weather_data is not None and len(weather_data) > 0:
            merged = df.merge(weather_data, on='YearMonth', how='inner')
            for col in ['temp', 'humidity', 'rainfall', 'aqi']:
                if col in merged.columns:
                    valid = merged[[col, case_col]].dropna()
                    if len(valid) >= 3:
                        r, _ = scipy_stats.pearsonr(valid[col], valid[case_col])
                        self.weather_correlations[col] = float(r)
                        self.weather_means[col] = float(valid[col].mean())
                        self.weather_stds[col] = float(valid[col].std()) if valid[col].std() > 0 else 1.0
                    else:
                        self.weather_correlations[col] = 0.0
                        self.weather_means[col] = 0.0
                        self.weather_stds[col] = 1.0
        
        # 3. Fit hồi quy tuyến tính để hiệu chỉnh
        if len(df) >= 3:
            # Tính dự báo thô cho mỗi tháng trong training data
            predictions_raw = []
            actuals = []
            
            for i in range(1, len(df)):
                row = df.iloc[i]
                month = row['month']
                baseline = self.monthly_baselines.get(month, 0)
                
                # Hệ số xu hướng
                prev_cases = df.iloc[i-1][case_col]
                recent_avg = df.iloc[max(0, i-3):i][case_col].mean()
                trend_factor = prev_cases / recent_avg if recent_avg > 0 else 1.0
                trend_factor = max(0.5, min(2.0, trend_factor))  # Clamp
                
                raw_pred = baseline * trend_factor
                predictions_raw.append(raw_pred)
                actuals.append(row[case_col])
            
            predictions_raw = np.array(predictions_raw)
            actuals = np.array(actuals)
            
            # Linear regression: actual = coef * raw_pred + intercept
            if len(predictions_raw) > 1 and predictions_raw.std() > 0:
                slope, intercept, r_value, _, _ = scipy_stats.linregress(predictions_raw, actuals)
                self.regression_coef = float(slope)
                self.regression_intercept = float(intercept)
            
            # Calculate metrics
            final_preds = predictions_raw * self.regression_coef + self.regression_intercept
            final_preds = np.maximum(final_preds, 0)
            
            mae = np.mean(np.abs(actuals - final_preds))
            rmse = np.sqrt(np.mean((actuals - final_preds) ** 2))
            mape = np.mean(np.abs((actuals - final_preds) / np.maximum(actuals, 1))) * 100
            ss_res = np.sum((actuals - final_preds) ** 2)
            ss_tot = np.sum((actuals - np.mean(actuals)) ** 2)
            r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
            
            self.training_metrics = {
                'mae': float(mae),
                'rmse': float(rmse),
                'mape': float(mape),
                'r2': float(r2),
                'n_samples': len(actuals),
                'monthly_baselines': self.monthly_baselines,
                'weather_correlations': self.weather_correlations,
            }
        else:
            self.training_metrics = {'mae': 0, 'rmse': 0, 'mape': 0, 'r2': 0, 'n_samples': 0}
        
        self.is_trained = True
        logger.info(f"Training complete. MAE={self.training_metrics['mae']:.1f}, R²={self.training_metrics['r2']:.3f}")
        
        return self.training_metrics
    
    def predict(
        self,
        prev_month_cases: int,
        prev_month_weather: Dict[str, float],
        forecast_weather: Dict[str, float],
        target_month: int,
        same_month_prev_year_cases: Optional[int] = None,
        cases_trend: int = 0,
        recent_3month_avg: Optional[float] = None
    ) -> Dict[str, float]:
        """
        Dự báo số ca bệnh tháng tiếp theo.
        
        Công thức: Dự báo = Ca nền cùng kỳ × Hệ số thời tiết × Hệ số xu hướng
        
        Args:
            prev_month_cases: Số ca bệnh tháng trước
            prev_month_weather: Thời tiết tháng trước
            forecast_weather: Dự báo thời tiết tháng tới
            target_month: Tháng cần dự báo (1-12)
            same_month_prev_year_cases: Ca bệnh cùng tháng năm trước
            cases_trend: Xu hướng (ca tháng trước - ca tháng trước nữa)
            recent_3month_avg: Trung bình 3 tháng gần nhất
        """
        if not self.is_trained:
            raise ValueError("Model chưa được train.")
        
        # 1. Ca nền cùng kỳ
        baseline = self.monthly_baselines.get(target_month, prev_month_cases)
        if same_month_prev_year_cases and same_month_prev_year_cases > 0:
            # Kết hợp ca nền trung bình với ca cùng kỳ năm trước
            baseline = (baseline + same_month_prev_year_cases) / 2
        
        # 2. Hệ số thời tiết
        weather_factor = 1.0
        for col in ['temp', 'humidity', 'rainfall', 'aqi']:
            if col in self.weather_correlations and col in forecast_weather:
                corr = self.weather_correlations[col]
                mean = self.weather_means.get(col, 0)
                std = self.weather_stds.get(col, 1)
                forecast_val = forecast_weather.get(col, mean)
                
                if std > 0:
                    # Hệ số = 1 + correlation × (forecast - mean) / std × 0.1
                    deviation = (forecast_val - mean) / std
                    weather_factor += corr * deviation * 0.1
        
        # Clamp weather factor
        weather_factor = max(0.7, min(1.5, weather_factor))
        
        # 3. Hệ số xu hướng gần đây
        if recent_3month_avg and recent_3month_avg > 0:
            trend_factor = prev_month_cases / recent_3month_avg
        elif prev_month_cases > 0 and baseline > 0:
            trend_factor = prev_month_cases / baseline
        else:
            trend_factor = 1.0
        
        trend_factor = max(0.5, min(2.0, trend_factor))
        
        # 4. Công thức chính
        raw_prediction = baseline * weather_factor * trend_factor
        
        # 5. Hiệu chỉnh bằng hồi quy
        prediction = raw_prediction * self.regression_coef + self.regression_intercept
        prediction = max(0, prediction)
        
        # 6. Confidence interval
        mae = self.training_metrics.get('mae', prediction * 0.15)
        confidence_lower = max(0, prediction - 1.96 * mae)
        confidence_upper = prediction + 1.96 * mae
        
        result = {
            'predicted_cases': int(round(prediction)),
            'confidence_lower': int(round(confidence_lower)),
            'confidence_upper': int(round(confidence_upper)),
            'target_month': target_month,
            'disease_type': self.disease_type,
            'formula_details': {
                'baseline': round(baseline, 1),
                'weather_factor': round(weather_factor, 3),
                'trend_factor': round(trend_factor, 3),
                'raw_prediction': round(raw_prediction, 1),
                'regression_adjusted': round(prediction, 1),
            },
            'model_metrics': self.training_metrics
        }
        
        logger.info(
            f"Forecast {self.disease_type} month {target_month}: "
            f"{result['predicted_cases']} = {baseline:.0f} × {weather_factor:.3f} × {trend_factor:.3f}"
        )
        
        return result
    
    def save(self, version: str = "latest") -> Path:
        """Save model to disk."""
        if not self.is_trained:
            raise ValueError("Model not trained")
        
        filepath = SAVED_MODELS_DIR / f"monthly_{self.disease_type}_{version}.pkl"
        model_data = {
            'monthly_baselines': self.monthly_baselines,
            'weather_correlations': self.weather_correlations,
            'weather_means': self.weather_means,
            'weather_stds': self.weather_stds,
            'regression_coef': self.regression_coef,
            'regression_intercept': self.regression_intercept,
            'training_metrics': self.training_metrics,
            'disease_type': self.disease_type,
            'trained_at': datetime.now().isoformat()
        }
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
        logger.info(f"Model saved to {filepath}")
        return filepath
    
    def load(self, version: str = "latest") -> bool:
        """Load model from disk."""
        filepath = SAVED_MODELS_DIR / f"monthly_{self.disease_type}_{version}.pkl"
        if not filepath.exists():
            return False
        with open(filepath, 'rb') as f:
            data = pickle.load(f)
        self.monthly_baselines = data['monthly_baselines']
        self.weather_correlations = data['weather_correlations']
        self.weather_means = data['weather_means']
        self.weather_stds = data['weather_stds']
        self.regression_coef = data['regression_coef']
        self.regression_intercept = data['regression_intercept']
        self.training_metrics = data['training_metrics']
        self.is_trained = True
        return True
    
    def _get_case_column(self) -> str:
        mapping = {
            'respiratory_disease': 'cases_respiratory',
            'seasonal_flu': 'cases_flu',
            'viral_infection': 'cases_viral',
            'dengue_fever': 'cases_dengue',
        }
        return mapping.get(self.disease_type, 'total_cases')
