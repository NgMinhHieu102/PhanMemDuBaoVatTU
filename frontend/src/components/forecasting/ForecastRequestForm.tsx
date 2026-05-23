import { useState } from 'react';
import { Calendar, TrendingUp } from 'lucide-react';
import Button from '../common/Button';
import Card, { CardHeader } from '../common/Card';
import type { DiseaseType } from '../../types/epidemiology';
import { DISEASE_TYPE_LABELS } from '../../types/epidemiology';

interface ForecastRequestFormProps {
  onSubmit: (diseaseType: DiseaseType, forecastPeriod: number) => void;
  isLoading?: boolean;
}

export default function ForecastRequestForm({
  onSubmit,
  isLoading = false,
}: ForecastRequestFormProps) {
  const [diseaseType, setDiseaseType] = useState<DiseaseType>('dengue_fever');
  const [forecastPeriod, setForecastPeriod] = useState<number>(7);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(diseaseType, forecastPeriod);
  };

  return (
    <Card>
      <CardHeader
        title="Yêu cầu Dự báo"
        subtitle="Chọn loại bệnh và khoảng thời gian dự báo"
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Disease Type Selection */}
        <div>
          <label
            htmlFor="disease-type"
            className="block text-sm font-medium text-neutral-700 mb-2"
          >
            <TrendingUp className="inline w-4 h-4 mr-1" />
            Loại bệnh
          </label>
          <select
            id="disease-type"
            value={diseaseType}
            onChange={(e) => setDiseaseType(e.target.value as DiseaseType)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            disabled={isLoading}
          >
            {Object.entries(DISEASE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Forecast Period Selection */}
        <div>
          <label
            htmlFor="forecast-period"
            className="block text-sm font-medium text-neutral-700 mb-2"
          >
            <Calendar className="inline w-4 h-4 mr-1" />
            Khoảng thời gian dự báo
          </label>
          <div className="space-y-2">
            <input
              type="range"
              id="forecast-period"
              min="7"
              max="30"
              step="1"
              value={forecastPeriod}
              onChange={(e) => setForecastPeriod(Number(e.target.value))}
              className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>7 ngày</span>
              <span className="font-semibold text-primary-600">{forecastPeriod} ngày</span>
              <span>30 ngày</span>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isLoading}
          className="w-full"
        >
          {isLoading ? 'Đang tạo dự báo...' : 'Tạo dự báo'}
        </Button>

        {/* Info Text */}
        <p className="text-xs text-neutral-500 text-center">
          Dự báo sẽ được tạo bằng mô hình AI kết hợp (XGBoost, LSTM, Prophet)
        </p>
      </form>
    </Card>
  );
}
