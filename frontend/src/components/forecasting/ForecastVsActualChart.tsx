import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Props {
  data: Array<Record<string, number | string>>;
  years: number[];
  targetYear: number;
  targetMonth: number;
}

// Bảng màu theo thiết kế: ghi nhạt (cũ nhất) → xanh lá → nâu → xanh đậm (hiện tại)
const COLOR_PALETTE = ['#cbd5e1', '#0f766e', '#92400e', '#2563eb'];

export default function ForecastVsActualChart({
  data,
  years,
  targetYear,
  targetMonth,
}: Props) {
  const colorMap = mapYearsToColors(years, targetYear);
  const targetMonthKey = `T${targetMonth}`;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5">
      <div className="flex items-start justify-between mb-4 gap-4">
        <h3 className="text-sm font-semibold text-neutral-900">
          Biểu đồ dự báo so với thực tế
        </h3>
        <Legend years={years} targetYear={targetYear} colorMap={colorMap} />
      </div>

      <div className="h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(m) =>
                m === targetMonthKey ? `${m} (DB)` : m
              }
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ fontWeight: 600 }}
            />
            <ReferenceLine
              x={targetMonthKey}
              stroke="#3b82f6"
              strokeDasharray="4 4"
              label={{
                value: 'Dự báo tháng tới',
                fill: '#3b82f6',
                fontSize: 11,
                position: 'insideTopRight',
              }}
            />
            {years.map((y) => {
              const color = colorMap[y];
              const isTarget = y === targetYear;
              return (
                <Line
                  key={y}
                  type="monotone"
                  dataKey={String(y)}
                  name={isTarget ? `${y} (Hiện tại)` : String(y)}
                  stroke={color}
                  strokeWidth={isTarget ? 3 : 2}
                  strokeDasharray={isTarget ? '6 4' : '0'}
                  dot={isTarget ? { r: 4, fill: color } : false}
                  activeDot={{ r: 6 }}
                  isAnimationActive
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function mapYearsToColors(years: number[], targetYear: number): Record<number, string> {
  // Năm hiện tại luôn màu xanh đậm; các năm còn lại đi theo palette từ nhạt → đậm.
  const sorted = [...years].sort((a, b) => a - b);
  const others = sorted.filter((y) => y !== targetYear);
  const map: Record<number, string> = {};

  others.forEach((y, idx) => {
    map[y] = COLOR_PALETTE[idx] ?? COLOR_PALETTE[COLOR_PALETTE.length - 2];
  });
  map[targetYear] = COLOR_PALETTE[COLOR_PALETTE.length - 1];
  return map;
}

function Legend({
  years,
  targetYear,
  colorMap,
}: {
  years: number[];
  targetYear: number;
  colorMap: Record<number, string>;
}) {
  const sorted = [...years].sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-600">
      {sorted.map((y) => {
        const isTarget = y === targetYear;
        return (
          <span key={y} className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: colorMap[y] }}
            />
            {y}
            {isTarget && <span className="text-neutral-400">(Hiện tại)</span>}
          </span>
        );
      })}
    </div>
  );
}
