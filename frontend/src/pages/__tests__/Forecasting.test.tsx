import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Forecasting from '../Forecasting';
import * as useForecastHook from '../../hooks/useForecast';

// Mock heavy chart components
vi.mock('../../components/forecasting/ForecastChart', () => ({
  default: () => <div data-testid="forecast-chart" />,
}));
vi.mock('../../components/forecasting/ModelAccuracyCards', () => ({
  default: () => <div data-testid="model-accuracy-cards" />,
}));
vi.mock('../../components/forecasting/ForecastComparisonChart', () => ({
  default: () => <div data-testid="comparison-chart" />,
}));
vi.mock('../../components/forecasting/ForecastRequestForm', () => ({
  default: ({ onSubmit }: { onSubmit: Function; isLoading: boolean }) => (
    <button data-testid="forecast-form" onClick={() => onSubmit('dengue_fever', 7)}>
      Generate
    </button>
  ),
}));

const mockUseForecast = {
  isGenerating: false,
  error: null,
  forecastResult: null,
  generateForecast: vi.fn(),
  getLatestForecast: vi.fn(),
  listForecasts: vi.fn().mockResolvedValue([]),
  getAccuracyMetrics: vi.fn(),
};

describe('Forecasting page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useForecastHook, 'useForecast').mockReturnValue(mockUseForecast as any);
  });

  it('renders forecast form', () => {
    render(<Forecasting />);
    expect(screen.getByTestId('forecast-form')).toBeInTheDocument();
  });

  it('renders forecast chart', () => {
    render(<Forecasting />);
    expect(screen.getByTestId('forecast-chart')).toBeInTheDocument();
  });

  it('renders comparison chart', () => {
    render(<Forecasting />);
    expect(screen.getByTestId('comparison-chart')).toBeInTheDocument();
  });

  it('shows info panel', () => {
    render(<Forecasting />);
    expect(screen.getByText(/Thông tin về Dự báo AI/i)).toBeInTheDocument();
  });

  it('shows generating state', () => {
    vi.spyOn(useForecastHook, 'useForecast').mockReturnValue({
      ...mockUseForecast,
      isGenerating: true,
    } as any);
    render(<Forecasting />);
    expect(screen.getByText(/Đang tạo dự báo/i)).toBeInTheDocument();
  });

  it('shows error message', () => {
    vi.spyOn(useForecastHook, 'useForecast').mockReturnValue({
      ...mockUseForecast,
      error: 'Không đủ dữ liệu',
    } as any);
    render(<Forecasting />);
    expect(screen.getByText('Không đủ dữ liệu')).toBeInTheDocument();
  });

  it('shows model accuracy cards when forecast result available', () => {
    vi.spyOn(useForecastHook, 'useForecast').mockReturnValue({
      ...mockUseForecast,
      forecastResult: {
        metrics: { mae: 1.5, rmse: 2.0, mape: 5.0 },
        predictions: [],
        confidence_lower: [],
        confidence_upper: [],
        forecast_dates: [],
      },
    } as any);
    render(<Forecasting />);
    expect(screen.getByTestId('model-accuracy-cards')).toBeInTheDocument();
  });
});
