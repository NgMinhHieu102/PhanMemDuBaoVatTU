import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SupplyDemandChart from '../SupplyDemandChart';

describe('SupplyDemandChart', () => {
  it('renders heading', () => {
    render(<SupplyDemandChart data={[]} />);
    expect(screen.getByText('Cung - Cầu Vật tư')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<SupplyDemandChart data={[]} />);
    expect(screen.getByText('Không có dữ liệu cung cầu')).toBeInTheDocument();
  });

  it('renders chart when data is provided', () => {
    const data = [
      {
        supply_id: 1,
        supply_name: 'Khẩu trang',
        data_points: [
          { date: '2024-01-01', actual: 100, forecast: 110 },
          { date: '2024-01-02', actual: 120, forecast: 115 },
        ],
      },
    ];
    render(<SupplyDemandChart data={data} />);
    expect(screen.getByText('Khẩu trang — thực tế vs dự báo')).toBeInTheDocument();
  });
});
