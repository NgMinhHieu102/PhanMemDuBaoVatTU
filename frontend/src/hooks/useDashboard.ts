import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';
import { DASHBOARD_REFRESH_INTERVAL_MS } from '../utils/constants';
import { useAuthStore } from '../store/authStore';

/**
 * Hook for fetching dashboard overview metrics
 */
export function useDashboardOverview() {
  const { isAuthenticated } = useAuthStore();
  
  return useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => dashboardService.getOverview(),
    refetchInterval: isAuthenticated ? DASHBOARD_REFRESH_INTERVAL_MS : false,
    staleTime: DASHBOARD_REFRESH_INTERVAL_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    enabled: isAuthenticated,
  });
}

/**
 * Hook for fetching supply vs demand chart data
 */
export function useDashboardSupplyDemand() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['dashboard', 'supply-demand'],
    queryFn: () => dashboardService.getSupplyDemand(),
    refetchInterval: isAuthenticated ? DASHBOARD_REFRESH_INTERVAL_MS : false,
    staleTime: DASHBOARD_REFRESH_INTERVAL_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    enabled: isAuthenticated,
  });
}

/**
 * Hook for fetching risk status breakdown for donut chart
 */
export function useDashboardRiskStatus() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['dashboard', 'risk-status'],
    queryFn: () => dashboardService.getRiskStatus(),
    refetchInterval: isAuthenticated ? DASHBOARD_REFRESH_INTERVAL_MS : false,
    staleTime: DASHBOARD_REFRESH_INTERVAL_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    enabled: isAuthenticated,
  });
}

/**
 * Hook for fetching critical alerts for the dashboard table
 */
export function useDashboardCriticalAlerts(limit = 5) {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['dashboard', 'critical-alerts', limit],
    queryFn: () => dashboardService.getCriticalAlerts(limit),
    refetchInterval: isAuthenticated ? DASHBOARD_REFRESH_INTERVAL_MS : false,
    staleTime: DASHBOARD_REFRESH_INTERVAL_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    enabled: isAuthenticated,
  });
}
