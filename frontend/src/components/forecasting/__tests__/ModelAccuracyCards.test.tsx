import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModelAccuracyCards from '../ModelAccuracyCards';

describe('ModelAccuracyCards', () => {
  it('renders MAE value', () => {
    render(<ModelAccuracyCards mae={1.5} rmse={2.0} mape={5.5} />);
    expect(screen.getByText('1.50')).toBeInTheDocument();
  });

  it('renders RMSE value', () => {
    render(<ModelAccuracyCards mae={1.5} rmse={2.0} mape={5.5} />);
    expect(screen.getByText('2.00')).toBeInTheDocument();
  });

  it('renders MAPE value with percent', () => {
    render(<ModelAccuracyCards mae={1.5} rmse={2.0} mape={5.5} />);
    expect(screen.getByText('5.50%')).toBeInTheDocument();
  });

  it('renders card titles', () => {
    render(<ModelAccuracyCards mae={1.0} rmse={1.5} mape={3.0} />);
    expect(screen.getByText(/MAE/)).toBeInTheDocument();
    expect(screen.getByText(/RMSE/)).toBeInTheDocument();
    expect(screen.getByText(/MAPE/)).toBeInTheDocument();
  });
});
