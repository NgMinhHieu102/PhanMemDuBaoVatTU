import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '../Dashboard';
import * as useDashboardHooks from '../../hooks/useDashboard';
import type { DashboardOverview, RiskStatusData } from '../../types/dashboard';

// Mock child chart components to simplify test setup
vi.mock('../../components/dashboard/SupplyDemandChart', () => ({
  default: () => <div data-testid="supply-demand-chart" />,
}));
vi.mock('../../components/dashboard/RiskStatusChart', () => ({
  default: () => <div data-testid="risk-status-chart" />,
}));
vi.mock('../../components/dashboard/CriticalAlertsTable', () => ({
  default: () => <div data-testid="critical-alerts-table" />,
}));

const mockOverview: DashboardOverview = {
  total_supplies: 50,
  total_value: 1_000_000,
  high_risk_shortages: 3,
  predicted_demand_30d: 5000,
  disease_outbreaks: 2,
  supply_risk_percentage: 6.0,
  safe_stock_items: 40,
  low_stock_items: 7,
  critical_risk_items: 3,
};

const mockRiskStatus: RiskStatusData = {
  safe_count: 40,
  low_stock_count: 7,
  critical_count: 3,
  total: 50,
};

function makeQueryResult<T>(data: T, overrides = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
    dataUpdatedAt: Date.now(),
    ...overrides,
  } as any;
}

describe('Dashboard page', () => {
  beforeEach(() => {
    vi.spyOn(useDashboardHooks, 'useDashboardOverview').mockReturnValue(
      makeQueryResult(mockOverview)
    );
    vi.spyOn(useDashboardHooks, 'useDashboardSupplyDemand').mockReturnValue(
      makeQueryResult([])
    );
    vi.spyOn(useDashboardHooks, 'useDashboardRiskStatus').mockReturnValue(
      makeQueryResult(mockRiskStatus)
    );
    vi.spyOn(useDashboardHooks, 'useDashboardCriticalAlerts').mockReturnValue(
      makeQueryResult([])
    );
  });

  it('renders page header', () => {
    render(<Dashboard />);
    expect(screen.getByText('Tổng quan hệ thống')).toBeInTheDocument();
  });

  it('renders metric cards with data', () => {
    render(<Dashboard />);
    expect(screen.getByText('Tổng vật tư')).toBeInTheDocument();
    expect(screen.getByText('Nguy cơ thiếu hụt')).toBeInTheDocument();
    expect(screen.getByText('Nhu cầu dự báo (30 ngày)')).toBeInTheDocument();
  });

  it('renders supply demand chart', () => {
    render(<Dashboard />);
    expect(screen.getByTestId('supply-demand-chart')).toBeInTheDocument();
  });

  it('renders risk status chart', () => {
    render(<Dashboard />);
    expect(screen.getByTestId('risk-status-chart')).toBeInTheDocument();
  });

  it('renders critical alerts table', () => {
    render(<Dashboard />);
    expect(screen.getByTestId('critical-alerts-table')).toBeInTheDocument();
  });

  it('shows loading spinners when data is loading', () => {
    vi.spyOn(useDashboardHooks, 'useDashboardOverview').mockReturnValue(
      makeQueryResult(undefined, { isLoading: true, data: undefined })
    );
    render(<Dashboard />);
    // Multiple spinners displayed while loading
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('renders refresh button', () => {
    render(<Dashboard />);
    expect(screen.getByRole('button', { name: /làm mới/i })).toBeInTheDocument();
  });
});
