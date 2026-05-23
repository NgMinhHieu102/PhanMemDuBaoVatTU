import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ForecastRequestForm from '../ForecastRequestForm';

describe('ForecastRequestForm', () => {
  it('renders form with disease type select', () => {
    render(<ForecastRequestForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/loại bệnh/i)).toBeInTheDocument();
  });

  it('renders forecast period slider', () => {
    render(<ForecastRequestForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<ForecastRequestForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /tạo dự báo/i })).toBeInTheDocument();
  });

  it('calls onSubmit with selected disease type and period', () => {
    const onSubmit = vi.fn();
    render(<ForecastRequestForm onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole('button'));
    expect(onSubmit).toHaveBeenCalledWith('dengue_fever', 7);
  });

  it('shows loading state', () => {
    render(<ForecastRequestForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('changes disease type when select changes', () => {
    const onSubmit = vi.fn();
    render(<ForecastRequestForm onSubmit={onSubmit} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'seasonal_flu' } });
    fireEvent.submit(screen.getByRole('button'));
    expect(onSubmit).toHaveBeenCalledWith('seasonal_flu', 7);
  });

  it('changes forecast period when slider changes', () => {
    const onSubmit = vi.fn();
    render(<ForecastRequestForm onSubmit={onSubmit} />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '14' } });
    fireEvent.submit(screen.getByRole('button'));
    expect(onSubmit).toHaveBeenCalledWith('dengue_fever', 14);
  });
});
