import api from './api';
import type {
  ForecastRequest,
  ForecastGenerateResponse,
  ForecastTaskStatus,
  DiseaseForecast,
  AccuracyMetrics,
  ForecastSupplyRequirements,
} from '../types/forecast';
import type { DiseaseType } from '../types/epidemiology';

const FORECASTS_BASE = '/forecasts';

export const forecastService = {
  /**
   * Generate a new disease forecast
   */
  async generateForecast(request: ForecastRequest): Promise<ForecastGenerateResponse> {
    const response = await api.post<ForecastGenerateResponse>(
      `${FORECASTS_BASE}/generate`,
      request
    );
    return response.data;
  },

  /**
   * Check the status of an async forecast generation task
   */
  async checkTaskStatus(taskId: string): Promise<ForecastTaskStatus> {
    const response = await api.get<ForecastTaskStatus>(`${FORECASTS_BASE}/tasks/${taskId}`);
    return response.data;
  },

  /**
   * List all forecasts with optional filters
   */
  async listForecasts(params?: {
    disease_type?: DiseaseType;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<DiseaseForecast[]> {
    const response = await api.get<DiseaseForecast[]>(FORECASTS_BASE, { params });
    return response.data;
  },

  /**
   * Get a specific forecast by ID
   */
  async getForecastById(id: number): Promise<DiseaseForecast> {
    const response = await api.get<DiseaseForecast>(`${FORECASTS_BASE}/${id}`);
    return response.data;
  },

  /**
   * Get the latest forecast for a disease type
   */
  async getLatestForecast(
    diseaseType: DiseaseType,
    location?: string
  ): Promise<DiseaseForecast> {
    const response = await api.get<DiseaseForecast>(
      `${FORECASTS_BASE}/latest/${diseaseType}`,
      { params: { location } }
    );
    return response.data;
  },

  /**
   * Get model accuracy metrics
   */
  async getAccuracyMetrics(params?: {
    disease_type?: DiseaseType;
    start_date?: string;
    end_date?: string;
  }): Promise<AccuracyMetrics> {
    const response = await api.get<AccuracyMetrics>(`${FORECASTS_BASE}/accuracy/metrics`, {
      params,
    });
    return response.data;
  },

  /**
   * Get supply requirements for a forecast
   */
  async getSupplyRequirements(forecastId: number): Promise<ForecastSupplyRequirements> {
    const response = await api.get<ForecastSupplyRequirements>(
      `${FORECASTS_BASE}/${forecastId}/supply-requirements`
    );
    return response.data;
  },
};
