import api from './api';
import type {
  DashboardOverview,
  SupplyDemandPayload,
  RiskStatusData,
  DashboardCriticalAlert,
} from '../types/dashboard';

/**
 * Dashboard service for API calls
 */
export const dashboardService = {
  async getOverview(): Promise<DashboardOverview> {
    const response = await api.get<DashboardOverview>('/dashboard/overview');
    return response.data;
  },

  async getSupplyDemand(): Promise<SupplyDemandPayload> {
    const response = await api.get<SupplyDemandPayload>('/dashboard/supply-demand');
    return response.data;
  },

  async getRiskStatus(): Promise<RiskStatusData> {
    const response = await api.get<RiskStatusData>('/dashboard/risk-status');
    return response.data;
  },

  async getCriticalAlerts(limit = 5): Promise<DashboardCriticalAlert[]> {
    const response = await api.get<DashboardCriticalAlert[]>('/dashboard/critical-alerts', {
      params: { limit },
    });
    return response.data;
  },
};
