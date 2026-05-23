import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ForecastChart from '../ForecastChart';
import type { ForecastChartDataPoint } from '../../../types/forecast';

describe('ForecastChart', () => {
  it('renders card heading', () => {
    render(<ForecastChart data={[]} diseaseLabel="Sốt xuất huyết" />);
    expect(screen.getByText('Biểu đồ Dự báo')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<ForecastChart data={[]} diseaseLabel="Sốt xuất huyết" />);
    expect(screen.getByText(/Chưa có dữ liệu dự báo/)).toBeInTheDocument();
  });

  it('renders chart when data is provided', () => {
    const data: ForecastChartDataPoint[] = [
      { date: '2024-01-01', predicted: 10, lower: 8, upper: 12 },
      { date: '2024-01-02', predicted: 15, lower: 12, upper: 18 },
    ];
    render(<ForecastChart data={data} diseaseLabel="Sốt xuất huyết" />);
    // Chart renders (no error state)
    expect(screen.queryByText(/Chưa có dữ liệu/)).not.toBeInTheDocument();
  });

  it('includes disease label in subtitle', () => {
    render(<ForecastChart data={[]} diseaseLabel="Cúm mùa" />);
    expect(screen.getByText(/Cúm mùa/)).toBeInTheDocument();
  });
});
