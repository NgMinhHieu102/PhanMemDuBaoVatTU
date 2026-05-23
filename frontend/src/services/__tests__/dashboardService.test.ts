import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dashboardService } from '../dashboardService';
import api from '../api';
import type { DashboardOverview, RiskStatusData } from '../../types/dashboard';

vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('dashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOverview', () => {
    it('calls GET /dashboard/overview', async () => {
      const overview: DashboardOverview = {
        total_supplies: 50,
        total_value: 1000000,
        high_risk_shortages: 3,
        predicted_demand_30d: 5000,
        disease_outbreaks: 1,
        supply_risk_percentage: 6.0,
        safe_stock_items: 40,
        low_stock_items: 7,
        critical_risk_items: 3,
      };
      vi.mocked(api.get).mockResolvedValueOnce({ data: overview });
      const result = await dashboardService.getOverview();
      expect(api.get).toHaveBeenCalledWith('/dashboard/overview');
      expect(result).toEqual(overview);
    });
  });

  describe('getSupplyDemand', () => {
    it('calls GET /dashboard/supply-demand', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: [] });
      await dashboardService.getSupplyDemand();
      expect(api.get).toHaveBeenCalledWith('/dashboard/supply-demand');
    });
  });

  describe('getRiskStatus', () => {
    it('calls GET /dashboard/risk-status', async () => {
      const data: RiskStatusData = { safe_count: 40, low_stock_count: 7, critical_count: 3, total: 50 };
      vi.mocked(api.get).mockResolvedValueOnce({ data });
      const result = await dashboardService.getRiskStatus();
      expect(api.get).toHaveBeenCalledWith('/dashboard/risk-status');
      expect(result).toEqual(data);
    });
  });

  describe('getCriticalAlerts', () => {
    it('calls GET /dashboard/critical-alerts with default limit', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: [] });
      await dashboardService.getCriticalAlerts();
      expect(api.get).toHaveBeenCalledWith('/dashboard/critical-alerts', { params: { limit: 5 } });
    });

    it('calls GET /dashboard/critical-alerts with custom limit', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: [] });
      await dashboardService.getCriticalAlerts(10);
      expect(api.get).toHaveBeenCalledWith('/dashboard/critical-alerts', { params: { limit: 10 } });
    });
  });
});
