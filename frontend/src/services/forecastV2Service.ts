import api from './api';

const BASE = '/forecast-v2';

export interface WeatherInput {
  temp: number;
  humidity: number;
  rainfall: number;
  aqi: number;
}

export interface PredictRequest {
  prev_month_weather: WeatherInput;
  forecast_weather: WeatherInput;
  target_month: number;
  target_year?: number;
  forecast_period?: 'tomorrow' | '7days' | 'month';
}

export interface FullPipelineRequest extends PredictRequest {
  current_inventory?: Record<string, number>;
  top_n_supplies?: number;
}

export interface PredictionResult {
  predicted_cases: number;
  confidence_lower: number;
  confidence_upper: number;
  target_month: number;
  disease_type: string;
}

export interface ForecastResult {
  target_month: number;
  target_year: number;
  predictions: Record<string, PredictionResult>;
  total_predicted_cases: number;
  weather_input: {
    prev_month: WeatherInput;
    forecast: WeatherInput;
  };
  generated_at: string;
  forecast_period?: string;
  period_label?: string;
}

export interface SupplyDemandItem {
  DrugName: string;
  UnitOfMeasure: string;
  total_predicted: number;
  total_safety: number;
  disease_groups: string;
  avg_ratio: number;
}

export interface CorrelationData {
  coefficient: number;
  p_value: number;
  significant: boolean;
  strength: string;
}

export interface CorrelationResult {
  correlations: {
    pearson: Record<string, CorrelationData>;
    spearman: Record<string, CorrelationData>;
  };
  lag_analysis: Record<string, {
    best_lag_months: number;
    best_correlation: number;
    interpretation: string;
  }>;
  strongest_factor: {
    factor: string;
    factor_label: string;
    correlation: number;
    direction: string;
    interpretation: string;
  };
  scatter_data: Record<string, { x: number[]; y: number[]; x_label: string; y_label: string }>;
  summary: string;
  n_months: number;
}

export interface SeasonalResult {
  seasonal_pattern: Array<{
    month: number;
    avg_cases: number;
    std_cases: number;
    min_cases: number;
    max_cases: number;
  }>;
  peak_month: number;
  low_month: number;
  variation_ratio: number;
  has_strong_seasonality: boolean;
  summary: string;
}

export interface TrainResult {
  status: string;
  data_summary: {
    files_loaded: number;
    total_records: number;
    date_range: { from: string; to: string };
    months_available: number;
    disease_groups: string[];
  };
  training_metrics: Record<string, {
    mae: number;
    rmse: number;
    mape: number;
    r2: number;
    n_samples: number;
  }>;
}

export interface WeatherForecastResult {
  target_month: number;
  forecast_weather: WeatherInput & { source: string };
  prev_month_weather: WeatherInput & { source: string };
}

export interface ComparisonItem {
  DrugName: string;
  UnitOfMeasure: string;
  total_predicted: number;
  total_safety: number;
  current_stock: number;
  shortage: number;
  status: string;
}

export interface SuggestionItem {
  DrugName: string;
  UnitOfMeasure: string;
  current_stock: number;
  predicted_demand: number;
  safety_demand: number;
  shortage: number;
  status: string;
  action: string;
  order_quantity: number;
  priority: string;
  note: string;
}

export interface MonthlyDataItem {
  YearMonth: string;
  year: number;
  month: number;
  cases_respiratory: number;
  cases_flu: number;
  cases_viral: number;
  cases_dengue: number;
  total_cases: number;
}

export const forecastV2Service = {
  /** Upload CSV file */
  async uploadCSV(file: File): Promise<{
    status: string;
    message: string;
    filename: string;
    size_mb: number;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`${BASE}/upload-csv`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 min for large files
    });
    return response.data;
  },

  /** List uploaded CSV files */
  async listUploadedFiles(): Promise<{
    files: Array<{ filename: string; size_mb: number; modified: number }>;
    total: number;
  }> {
    const response = await api.get(`${BASE}/uploaded-files`);
    return response.data;
  },

  /** Train models from CSV data */
  async train(csvFiles?: string[]): Promise<TrainResult> {
    const response = await api.post<TrainResult>(`${BASE}/train`, {
      csv_files: csvFiles || null,
    });
    return response.data;
  },

  /** Predict next month cases + supply demand */
  async predict(request: PredictRequest): Promise<{
    status: string;
    forecast: ForecastResult;
    supply_demand: SupplyDemandItem[];
  }> {
    const response = await api.post(`${BASE}/predict`, request);
    return response.data;
  },

  /** Run full pipeline */
  async runFullPipeline(request: FullPipelineRequest): Promise<{
    status: string;
    result: {
      forecast: ForecastResult;
      supply_demand: SupplyDemandItem[];
      inventory_comparison: {
        comparison: ComparisonItem[];
        suggestions: SuggestionItem[];
        critical_alerts: ComparisonItem[];
        summary: {
          total_items: number;
          critical: number;
          low: number;
          warning: number;
          sufficient: number;
        };
      } | null;
      training_metrics: Record<string, any>;
    };
  }> {
    const response = await api.post(`${BASE}/full-pipeline`, request);
    return response.data;
  },

  /** Get correlation analysis */
  async getCorrelation(diseaseType?: string): Promise<{
    status: string;
    correlation_analysis: CorrelationResult;
    seasonal_analysis: SeasonalResult;
  }> {
    const response = await api.get(`${BASE}/correlation`, {
      params: { disease_type: diseaseType || 'total_cases' },
    });
    return response.data;
  },

  /** Get weather forecast for a month */
  async getWeatherForecast(targetMonth: number, targetYear?: number): Promise<WeatherForecastResult> {
    const response = await api.get<WeatherForecastResult>(`${BASE}/weather-forecast`, {
      params: { target_month: targetMonth, target_year: targetYear },
    });
    return response.data;
  },

  /** Get monthly data */
  async getMonthlyData(): Promise<{ monthly_data: MonthlyDataItem[]; total_months: number }> {
    const response = await api.get(`${BASE}/monthly-data`);
    return response.data;
  },

  /** Get conversion ratios */
  async getRatios(nhomBenh?: string, topN?: number): Promise<{
    ratios: Array<{
      NhomBenh: string;
      DrugName: string;
      ratio_per_case: number;
      UnitOfMeasure: string;
      months_observed: number;
    }>;
    total: number;
  }> {
    const response = await api.get(`${BASE}/ratios`, {
      params: { nhom_benh: nhomBenh, top_n: topN || 20 },
    });
    return response.data;
  },

  /** Get service status */
  async getStatus(): Promise<{
    is_data_loaded: boolean;
    is_trained: boolean;
    models_available: string[];
  }> {
    const response = await api.get(`${BASE}/status`);
    return response.data;
  },

  /** Get current inventory as {DrugName: quantity} for comparison */
  async getInventoryForComparison(): Promise<Record<string, number>> {
    try {
      const response = await api.get('/inventory', { params: { limit: 1000 } });
      const items = response.data;
      const inventory: Record<string, number> = {};
      if (Array.isArray(items)) {
        for (const item of items) {
          const name = item.supply?.name || item.supply_name || item.name || '';
          const stock = item.current_stock ?? item.quantity ?? 0;
          if (name) {
            inventory[name] = (inventory[name] || 0) + Number(stock);
          }
        }
      }
      return inventory;
    } catch {
      return {};
    }
  },

  /** Upload inventory CSV file */
  async uploadInventoryCSV(file: File): Promise<{
    status: string;
    message: string;
    items_count: number;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`${BASE}/upload-inventory-csv`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /** Import suggested quantities into inventory database */
  async importToInventory(items: Array<{drug_name: string; quantity: number; unit: string}>): Promise<any> {
    const response = await api.post(`${BASE}/import-to-inventory`, { items });
    return response.data;
  },
};
