import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useDashboardOverview,
  useDashboardSupplyDemand,
  useDashboardRiskStatus,
  useDashboardCriticalAlerts,
} from '../useDashboard';
import { dashboardService } from '../../services/dashboardService';
import type { DashboardOverview, RiskStatusData } from '../../types/dashboard';

vi.mock('../../services/dashboardService');

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockOverview: DashboardOverview = {
  total_supplies: 50,
  total_value: 1_000_000,
  high_risk_shortages: 2,
  predicted_demand_30d: 3000,
  disease_outbreaks: 1,
  supply_risk_percentage: 4.0,
  safe_stock_items: 40,
  low_stock_items: 8,
  critical_risk_items: 2,
};

describe('useDashboardOverview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns overview data', async () => {
    vi.mocked(dashboardService.getOverview).mockResolvedValueOnce(mockOverview);
    const { result } = renderHook(() => useDashboardOverview(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockOverview);
  });

  it('handles error', async () => {
    vi.mocked(dashboardService.getOverview).mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useDashboardOverview(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useDashboardSupplyDemand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns supply demand data', async () => {
    vi.mocked(dashboardService.getSupplyDemand).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useDashboardSupplyDemand(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useDashboardRiskStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns risk status data', async () => {
    const riskData: RiskStatusData = { safe_count: 40, low_stock_count: 8, critical_count: 2, total: 50 };
    vi.mocked(dashboardService.getRiskStatus).mockResolvedValueOnce(riskData);
    const { result } = renderHook(() => useDashboardRiskStatus(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(riskData);
  });
});

describe('useDashboardCriticalAlerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns critical alerts', async () => {
    vi.mocked(dashboardService.getCriticalAlerts).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useDashboardCriticalAlerts(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
