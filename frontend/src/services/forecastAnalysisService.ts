import api from './api';

export interface DiseaseOption {
  key: string;
  label: string;
}

export interface AnalyzeRequest {
  disease_type: string;
  region?: string | null;
  target_month: number;
  target_year: number;
}

export interface AnalyzeResponse {
  forecast: {
    id: number;
    predicted_cases: number;
    baseline: number;
    increase_pct: number;
    risk_level: 'low' | 'medium' | 'high' | 'very_high';
    risk_label: string;
    weather_factor: number;
    trend_factor: number;
    disease_type: string;
    disease_label: string;
    region: string;
    target_month: number;
    target_year: number;
  };
  explanation_bullets: string[];
  weather: {
    forecast: Record<string, number | null>;
    history_avg: Record<string, number | null>;
  };
  charts: {
    main: Array<Record<string, any>>;
    comparison: Array<{ year: number; value: number; is_forecast: boolean }>;
    trend_current_year: Array<{ month: string; value: number }>;
    correlation: Array<{
      year: number;
      cases: number;
      temp: number | null;
      humidity: number | null;
      rainfall: number | null;
      aqi: number | null;
      pm25: number | null;
      is_forecast: boolean;
    }>;
    correlation_coefficients?: {
      temp: number | null;
      humidity: number | null;
      rainfall: number | null;
      aqi: number | null;
      pm25: number | null;
    };
    years: number[];
  };
}

export interface ForecastHistoryItem {
  id: number;
  month: string;
  disease_type: string;
  disease_label: string;
  region: string;
  predicted_cases: number;
  actual_cases: number | null;
  deviation_pct: number | null;
  risk_level: string | null;
  created_at: string | null;
}

export const forecastAnalysisService = {
  async listDiseases(): Promise<DiseaseOption[]> {
    const res = await api.get<DiseaseOption[]>('/forecast/diseases');
    return res.data;
  },

  async listRegions(): Promise<string[]> {
    const res = await api.get<string[]>('/forecast/regions');
    return res.data;
  },

  async analyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
    const res = await api.post<AnalyzeResponse>('/forecast/analyze', payload);
    return res.data;
  },

  async getHistory(params?: {
    limit?: number;
    disease_type?: string;
    region?: string;
  }): Promise<ForecastHistoryItem[]> {
    const res = await api.get<ForecastHistoryItem[]>('/forecast/history', { params });
    return res.data;
  },

  async updateActual(forecastId: number, actualCases: number) {
    const res = await api.post(`/forecast/${forecastId}/actual`, {
      actual_cases: actualCases,
    });
    return res.data;
  },

  async exportForecastPdf(forecastId: number): Promise<Blob> {
    const res = await api.post(
      `/forecast/${forecastId}/export`,
      {},
      { responseType: 'blob' },
    );
    return res.data as Blob;
  },
};
