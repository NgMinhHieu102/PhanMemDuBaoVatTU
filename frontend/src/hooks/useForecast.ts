import { useState, useCallback } from 'react';
import { forecastService } from '../services/forecastService';
import type {
  ForecastRequest,
  ForecastResult,
  DiseaseForecast,
  AccuracyMetrics,
} from '../types/forecast';
import type { DiseaseType } from '../types/epidemiology';

export function useForecast() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);

  /**
   * Generate a new forecast
   */
  const generateForecast = useCallback(async (request: ForecastRequest) => {
    setIsGenerating(true);
    setError(null);
    setForecastResult(null);

    try {
      const response = await forecastService.generateForecast(request);

      if (response.status === 'completed' && response.result) {
        // Synchronous response - forecast is ready
        setForecastResult(response.result);
        return response.result;
      } else if (response.status === 'processing' && response.task_id) {
        // Async response - poll for completion
        const result = await pollTaskStatus(response.task_id);
        setForecastResult(result);
        return result;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate forecast';
      setError(errorMessage);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /**
   * Poll task status until completion
   */
  const pollTaskStatus = async (taskId: string): Promise<ForecastResult> => {
    const maxAttempts = 60; // 2 minutes max (2s interval)
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

      try {
        const taskStatus = await forecastService.checkTaskStatus(taskId);

        if (taskStatus.status === 'completed' && taskStatus.result?.result) {
          return taskStatus.result.result;
        } else if (taskStatus.status === 'failed') {
          throw new Error(taskStatus.message || 'Forecast generation failed');
        }

        attempts++;
      } catch (err) {
        throw err;
      }
    }

    throw new Error('Forecast generation timed out');
  };

  /**
   * Get latest forecast for a disease type
   */
  const getLatestForecast = useCallback(
    async (diseaseType: DiseaseType, location?: string): Promise<DiseaseForecast> => {
      setError(null);
      try {
        return await forecastService.getLatestForecast(diseaseType, location);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch forecast';
        setError(errorMessage);
        throw err;
      }
    },
    []
  );

  /**
   * List forecasts with filters
   */
  const listForecasts = useCallback(
    async (params?: {
      disease_type?: DiseaseType;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }): Promise<DiseaseForecast[]> => {
      setError(null);
      try {
        return await forecastService.listForecasts(params);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch forecasts';
        setError(errorMessage);
        throw err;
      }
    },
    []
  );

  /**
   * Get accuracy metrics
   */
  const getAccuracyMetrics = useCallback(
    async (params?: {
      disease_type?: DiseaseType;
      start_date?: string;
      end_date?: string;
    }): Promise<AccuracyMetrics> => {
      setError(null);
      try {
        return await forecastService.getAccuracyMetrics(params);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch accuracy metrics';
        setError(errorMessage);
        throw err;
      }
    },
    []
  );

  return {
    isGenerating,
    error,
    forecastResult,
    generateForecast,
    getLatestForecast,
    listForecasts,
    getAccuracyMetrics,
  };
}
