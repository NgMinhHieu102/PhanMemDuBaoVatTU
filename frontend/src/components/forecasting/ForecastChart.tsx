import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';
import Card, { CardHeader } from '../common/Card';
import type { ForecastChartDataPoint } from '../../types/forecast';

interface ForecastChartProps {
  data: ForecastChartDataPoint[];
  diseaseLabel: string;
}

export default function ForecastChart({ data, diseaseLabel }: ForecastChartProps) {
  return (
    <Card>
      <CardHeader
        title="Biểu đồ Dự báo"
        subtitle={`Dự báo số ca bệnh ${diseaseLabel} với khoảng tin cậy 95%`}
      />
      <div className="h-96">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
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
                    predicted: 'Dự báo',
                    lower: 'Giới hạn dưới',
                    upper: 'Giới hạn trên',
                    actual: 'Thực tế',
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
                    predicted: 'Dự báo',
                    lower: 'Giới hạn dưới (95%)',
                    upper: 'Giới hạn trên (95%)',
                    actual: 'Thực tế',
                  };
                  return labels[value] || value;
                }}
              />

              {/* Confidence interval area */}
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.1}
                name="upper"
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="#3b82f6"
                fillOpacity={0.1}
                name="lower"
              />

              {/* Predicted line */}
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ r: 4, fill: '#3b82f6' }}
                activeDot={{ r: 6 }}
                name="predicted"
              />

              {/* Actual line (if available) */}
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: '#10b981' }}
                activeDot={{ r: 5 }}
                name="actual"
                strokeDasharray="5 5"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            Chưa có dữ liệu dự báo. Vui lòng tạo dự báo mới.
          </div>
        )}
      </div>
    </Card>
  );
}
