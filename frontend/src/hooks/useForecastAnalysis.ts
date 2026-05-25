import { useMutation, useQuery } from '@tanstack/react-query';
import {
  forecastAnalysisService,
  type AnalyzeRequest,
  type AnalyzeResponse,
} from '../services/forecastAnalysisService';
import { useAuthStore } from '../store/authStore';

export function useDiseaseOptions() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['forecast', 'diseases'],
    queryFn: () => forecastAnalysisService.listDiseases(),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useRegionOptions() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['forecast', 'regions'],
    queryFn: () => forecastAnalysisService.listRegions(),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useAnalyzeForecast() {
  return useMutation<AnalyzeResponse, Error, AnalyzeRequest>({
    mutationFn: (payload) => forecastAnalysisService.analyze(payload),
  });
}

export function useForecastHistory(params?: {
  limit?: number;
  disease_type?: string;
  region?: string;
}) {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['forecast', 'history', params],
    queryFn: () => forecastAnalysisService.getHistory(params),
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
