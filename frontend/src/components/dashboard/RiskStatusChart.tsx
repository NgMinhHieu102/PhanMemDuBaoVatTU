import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Card, { CardHeader } from '../common/Card';
import type { RiskStatusData } from '../../types/dashboard';
import { formatNumber } from '../../utils/formatters';

interface RiskStatusChartProps {
  data: RiskStatusData;
}

const SEGMENTS = [
  {
    key: 'safe_count' as keyof RiskStatusData,
    label: 'An toàn',
    color: '#10b981',
  },
  {
    key: 'low_count' as keyof RiskStatusData,
    label: 'Tồn kho thấp',
    color: '#f59e0b',
  },
  {
    key: 'critical_count' as keyof RiskStatusData,
    label: 'Nguy hiểm',
    color: '#ef4444',
  },
];

interface CustomLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}

function CustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: CustomLabelProps) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: '11px', fontWeight: 600 }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

/**
 * Donut chart displaying the percentage breakdown of supply risk status:
 * safe (green), low stock (yellow), critical (red).
 */
export default function RiskStatusChart({ data }: RiskStatusChartProps) {
  const total = data.total_items || 1; // avoid division by zero

  const chartData = SEGMENTS.map((seg) => ({
    name: seg.label,
    value: (data[seg.key] as number) ?? 0,
    color: seg.color,
  })).filter((item) => item.value > 0);

  return (
    <Card>
      <CardHeader
        title="Trạng thái Tồn kho"
        subtitle="Phân bổ theo mức độ rủi ro"
      />
      {chartData.length > 0 ? (
        <div className="flex flex-col">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="50%"
                  outerRadius="80%"
                  paddingAngle={3}
                  dataKey="value"
                  labelLine={false}
                  label={(props) => <CustomLabel {...props} />}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number, name: string) => [
                    `${formatNumber(value)} (${((value / total) * 100).toFixed(1)}%)`,
                    name,
                  ]}
                />
                <Legend
                  iconType="circle"
                  iconSize={10}
                  wrapperStyle={{ fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Summary counts inside card */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-neutral-100">
            {SEGMENTS.map((seg) => {
              const count = (data[seg.key] as number) ?? 0;
              return (
                <div key={seg.key} className="text-center">
                  <p className="text-xl font-bold" style={{ color: seg.color }}>
                    {formatNumber(count)}
                  </p>
                  <p className="text-xs text-neutral-500">{seg.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-72 text-neutral-400 text-sm">
          Không có dữ liệu trạng thái tồn kho
        </div>
      )}
    </Card>
  );
}
