import type { DiseaseType } from './epidemiology';

export interface ForecastRequest {
  disease_type: DiseaseType;
  forecast_period_days: number;
  location?: string;
}

export interface ForecastResult {
  forecast_dates: string[];
  predictions: number[];
  confidence_lower: number[];
  confidence_upper: number[];
  model_used: string;
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
  };
  forecast_period_days: number;
  disease_type: DiseaseType;
}

export interface ForecastGenerateResponse {
  status: 'processing' | 'completed';
  message: string;
  task_id?: string;
  estimated_completion_time?: string;
  result?: ForecastResult;
  disease_type?: DiseaseType;
  forecast_period_days?: number;
}

export interface ForecastTaskStatus {
  task_id: string;
  status: 'pending' | 'started' | 'in_progress' | 'completed' | 'failed';
  message: string;
  result?: {
    status: string;
    result: ForecastResult;
  };
}

export interface DiseaseForecast {
  id: number;
  forecast_date: string;
  disease_type: DiseaseType;
  predicted_cases: number;
  confidence_lower: number | null;
  confidence_upper: number | null;
  model_used: string | null;
  model_accuracy_mae: number | null;
  model_accuracy_rmse: number | null;
  model_accuracy_mape: number | null;
  forecast_period_days: number | null;
  created_at: string;
}

export interface AccuracyMetrics {
  count: number;
  mae: number;
  rmse: number;
  mape: number;
  disease_type?: DiseaseType;
  date_range?: {
    start: string;
    end: string;
  };
}

export interface SupplyRequirement {
  id: number;
  supply_id: number;
  supply_name: string;
  required_quantity: number;
  requirement_date: string;
  disease_type: DiseaseType;
}

export interface ForecastSupplyRequirements {
  forecast_id: number;
  disease_type: DiseaseType;
  forecast_date: string;
  requirements: SupplyRequirement[];
}

export interface ForecastChartDataPoint {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
  actual?: number;
}

export interface ComparisonChartDataPoint {
  date: string;
  actual: number;
  predicted: number;
}
