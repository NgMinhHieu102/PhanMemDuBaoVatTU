import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RiskStatusChart from '../RiskStatusChart';
import type { RiskStatusData } from '../../../types/dashboard';

describe('RiskStatusChart', () => {
  it('renders card heading', () => {
    const data: RiskStatusData = { safe_count: 40, low_stock_count: 7, critical_count: 3, total: 50 };
    render(<RiskStatusChart data={data} />);
    expect(screen.getByText('Trạng thái Tồn kho')).toBeInTheDocument();
  });

  it('shows empty state when all counts are 0', () => {
    const data: RiskStatusData = { safe_count: 0, low_stock_count: 0, critical_count: 0, total: 0 };
    render(<RiskStatusChart data={data} />);
    expect(screen.getByText('Không có dữ liệu trạng thái tồn kho')).toBeInTheDocument();
  });

  it('shows summary counts', () => {
    const data: RiskStatusData = { safe_count: 40, low_stock_count: 7, critical_count: 3, total: 50 };
    render(<RiskStatusChart data={data} />);
    expect(screen.getByText('An toàn')).toBeInTheDocument();
    expect(screen.getByText('Tồn kho thấp')).toBeInTheDocument();
    expect(screen.getByText('Nguy hiểm')).toBeInTheDocument();
  });
});
