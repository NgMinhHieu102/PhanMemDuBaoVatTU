import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Card, { CardHeader } from '../common/Card';
import type { SupplyDemandPayload } from '../../types/dashboard';

interface SupplyDemandChartProps {
  data: SupplyDemandPayload | undefined;
}

export default function SupplyDemandChart({ data }: SupplyDemandChartProps) {
  const points = data?.data_points ?? [];

  const formatted = points.map((p) => ({
    date: p.date,
    label: new Date(p.date).toLocaleDateString('vi-VN', {
      month: 'short',
      day: 'numeric',
    }),
    'Thực tế': p.actual,
    'Dự báo': p.forecast,
  }));

  return (
    <Card>
      <CardHeader
        title="Cung – Cầu Vật tư"
        subtitle={
          data
            ? `${data.total_historical_points} ngày lịch sử · ${data.total_forecast_points} ngày dự báo`
            : 'Biểu đồ cung cầu theo thời gian'
        }
      />
      <div className="h-72">
        {formatted.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted} margin={{ top: 8, right: 30, left: 8, bottom: 5 }}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                stroke="#6b7280"
                style={{ fontSize: '11px' }}
                tick={{ fill: '#6b7280' }}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '11px' }}
                tick={{ fill: '#6b7280' }}
                tickFormatter={(v) => v.toLocaleString('vi-VN')}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number | null, name: string) =>
                  value === null ? ['—', name] : [value.toLocaleString('vi-VN'), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Area
                type="monotone"
                dataKey="Thực tế"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fill="url(#actualGrad)"
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="Dự báo"
                stroke="#f97316"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                fill="url(#forecastGrad)"
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            Không có dữ liệu cung cầu. Chạy dự báo để có data.
          </div>
        )}
      </div>
    </Card>
  );
}
