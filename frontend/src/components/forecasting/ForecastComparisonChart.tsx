import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Card, { CardHeader } from '../common/Card';
import type { ComparisonChartDataPoint } from '../../types/forecast';

interface ForecastComparisonChartProps {
  data: ComparisonChartDataPoint[];
  diseaseLabel: string;
}

export default function ForecastComparisonChart({
  data,
  diseaseLabel,
}: ForecastComparisonChartProps) {
  return (
    <Card>
      <CardHeader
        title="So sánh Dự báo vs Thực tế"
        subtitle={`Độ chính xác của mô hình dự báo ${diseaseLabel}`}
      />
      <div className="h-80">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString('vi-VN', {
                    month: 'short',
                    day: 'numeric',
                  });
                }}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                label={{
                  value: 'Số ca bệnh',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: '12px', fill: '#6b7280' },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#111827', fontWeight: 600 }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    actual: 'Thực tế',
                    predicted: 'Dự báo',
                  };
                  return [Math.round(value), labels[name] || name];
                }}
                labelFormatter={(label) => {
                  const date = new Date(label);
                  return date.toLocaleDateString('vi-VN', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  });
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    actual: 'Số ca thực tế',
                    predicted: 'Số ca dự báo',
                  };
                  return labels[value] || value;
                }}
              />

              {/* Actual cases line */}
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4, fill: '#10b981' }}
                activeDot={{ r: 6 }}
                name="actual"
              />

              {/* Predicted cases line */}
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#3b82f6' }}
                activeDot={{ r: 6 }}
                name="predicted"
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            Chưa có dữ liệu so sánh. Cần có dữ liệu thực tế để so sánh với dự báo.
          </div>
        )}
      </div>
    </Card>
  );
}
