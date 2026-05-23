import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forecastService } from '../forecastService';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

describe('forecastService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generateForecast calls POST /forecasts/generate', async () => {
    const resp = { status: 'completed', result: { forecasts: [] } };
    vi.mocked(api.post).mockResolvedValueOnce({ data: resp });
    const result = await forecastService.generateForecast({
      disease_type: 'dengue_fever',
      forecast_period_days: 7,
    } as any);
    expect(api.post).toHaveBeenCalledWith('/forecasts/generate', expect.any(Object));
    expect(result.status).toBe('completed');
  });

  it('checkTaskStatus calls GET /forecasts/tasks/:taskId', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { status: 'processing' } });
    const result = await forecastService.checkTaskStatus('task-123');
    expect(api.get).toHaveBeenCalledWith('/forecasts/tasks/task-123');
    expect(result.status).toBe('processing');
  });

  it('listForecasts calls GET /forecasts', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] });
    await forecastService.listForecasts({ disease_type: 'seasonal_flu' });
    expect(api.get).toHaveBeenCalledWith('/forecasts', {
      params: { disease_type: 'seasonal_flu' },
    });
  });

  it('getForecastById calls GET /forecasts/:id', async () => {
    const forecast = { id: 1, disease_type: 'dengue_fever', forecast_period_days: 7 };
    vi.mocked(api.get).mockResolvedValueOnce({ data: forecast });
    const result = await forecastService.getForecastById(1);
    expect(api.get).toHaveBeenCalledWith('/forecasts/1');
    expect(result).toEqual(forecast);
  });

  it('getLatestForecast calls GET /forecasts/latest/:diseaseType', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} });
    await forecastService.getLatestForecast('dengue_fever', 'HCM');
    expect(api.get).toHaveBeenCalledWith('/forecasts/latest/dengue_fever', {
      params: { location: 'HCM' },
    });
  });

  it('getAccuracyMetrics calls GET /forecasts/accuracy/metrics', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} });
    await forecastService.getAccuracyMetrics({ disease_type: 'dengue_fever' });
    expect(api.get).toHaveBeenCalledWith('/forecasts/accuracy/metrics', {
      params: { disease_type: 'dengue_fever' },
    });
  });

  it('getSupplyRequirements calls GET /forecasts/:id/supply-requirements', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: {} });
    await forecastService.getSupplyRequirements(42);
    expect(api.get).toHaveBeenCalledWith('/forecasts/42/supply-requirements');
  });
});
