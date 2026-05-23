import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecast } from '../useForecast';
import { forecastService } from '../../services/forecastService';
import type { ForecastGenerateResponse } from '../../types/forecast';

vi.mock('../../services/forecastService');

describe('useForecast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initializes with correct defaults', () => {
    const { result } = renderHook(() => useForecast());
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.forecastResult).toBeNull();
  });

  it('sets isGenerating while generating', async () => {
    let resolveGenerate!: (v: any) => void;
    const pendingPromise = new Promise((r) => { resolveGenerate = r; });
    vi.mocked(forecastService.generateForecast).mockReturnValueOnce(pendingPromise as any);

    const { result } = renderHook(() => useForecast());

    act(() => {
      result.current.generateForecast({ disease_type: 'dengue_fever', forecast_period_days: 7 } as any);
    });

    // while promise is pending, isGenerating should be true
    expect(result.current.isGenerating).toBe(true);

    // cleanup
    resolveGenerate({ status: 'completed', result: { forecast_dates: [], predictions: [], confidence_lower: [], confidence_upper: [], metrics: { mae: 1, rmse: 2, mape: 3 } } });
  });

  it('returns forecast result on success (synchronous response)', async () => {
    const mockResult = {
      forecast_dates: ['2024-02-01', '2024-02-02'],
      predictions: [10, 20],
      confidence_lower: [8, 16],
      confidence_upper: [12, 24],
      metrics: { mae: 1.0, rmse: 1.5, mape: 5.0 },
    };
    const generateResponse: ForecastGenerateResponse = {
      status: 'completed',
      result: mockResult as any,
    } as any;

    vi.mocked(forecastService.generateForecast).mockResolvedValueOnce(generateResponse);

    const { result } = renderHook(() => useForecast());

    let forecastResult: any;
    await act(async () => {
      forecastResult = await result.current.generateForecast({
        disease_type: 'dengue_fever',
        forecast_period_days: 7,
      } as any);
    });

    expect(forecastResult).toEqual(mockResult);
    expect(result.current.forecastResult).toEqual(mockResult);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failed generation', async () => {
    vi.mocked(forecastService.generateForecast).mockRejectedValueOnce(new Error('Insufficient data'));

    const { result } = renderHook(() => useForecast());

    await act(async () => {
      try {
        await result.current.generateForecast({ disease_type: 'dengue_fever', forecast_period_days: 7 } as any);
      } catch {
        // Expected
      }
    });

    expect(result.current.error).toBe('Insufficient data');
    expect(result.current.isGenerating).toBe(false);
  });

  it('getLatestForecast returns forecast data', async () => {
    const forecast = { id: 1, disease_type: 'dengue_fever' };
    vi.mocked(forecastService.getLatestForecast).mockResolvedValueOnce(forecast as any);

    const { result } = renderHook(() => useForecast());

    let latestForecast: any;
    await act(async () => {
      latestForecast = await result.current.getLatestForecast('dengue_fever');
    });

    expect(latestForecast).toEqual(forecast);
  });

  it('listForecasts returns forecast list', async () => {
    vi.mocked(forecastService.listForecasts).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useForecast());

    let list: any;
    await act(async () => {
      list = await result.current.listForecasts();
    });

    expect(list).toEqual([]);
  });

  it('getAccuracyMetrics returns metrics', async () => {
    const metrics = { mae: 1.0, rmse: 1.5, mape: 5.0 };
    vi.mocked(forecastService.getAccuracyMetrics).mockResolvedValueOnce(metrics as any);

    const { result } = renderHook(() => useForecast());

    let m: any;
    await act(async () => {
      m = await result.current.getAccuracyMetrics();
    });

    expect(m).toEqual(metrics);
  });
});
