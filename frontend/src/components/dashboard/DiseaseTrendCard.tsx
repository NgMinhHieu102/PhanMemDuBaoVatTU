import { useEffect, useState } from 'react';
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
import { epidemiologyService } from '../../services/epidemiologyService';
import { DISEASE_TYPE_COLORS, DISEASE_TYPE_LABELS, type DiseaseType } from '../../types/epidemiology';

/** Aggregates disease trends from the database into a multi-series line chart. */
export default function DiseaseTrendCard() {
  const [series, setSeries] = useState<Record<string, number>[]>([]);
  const [diseases, setDiseases] = useState<DiseaseType[]>([]);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await epidemiologyService.getTrends({ limit: 365 });
        if (cancelled) return;
        const map: Record<string, Record<string, number | string>> = {};
        const found = new Set<DiseaseType>();
        for (const point of res.trends || []) {
          const day = new Date(point.date).toLocaleDateString('vi-VN', {
            month: 'short',
            day: 'numeric',
          });
          if (!map[day]) map[day] = { date: day };
          map[day][point.disease_type] =
            (Number(map[day][point.disease_type]) || 0) + point.case_count;
          found.add(point.disease_type);
        }
        const list = Object.values(map);
        setSeries(list as Record<string, number>[]);
        setDiseases(Array.from(found));
        setEmpty(list.length === 0);
      } catch {
        setEmpty(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader
        title="Xu hướng Ca bệnh"
        subtitle="Số ca bệnh theo loại — toàn bộ dữ liệu"
      />
      <div className="h-72">
        {empty ? (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            Chưa có dữ liệu ca bệnh. Train model hoặc import CSV ở Dịch tễ học.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 30, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '10px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(v) => DISEASE_TYPE_LABELS[v as DiseaseType] ?? v}
              />
              {diseases.map((d) => (
                <Line
                  key={d}
                  type="monotone"
                  dataKey={d}
                  stroke={DISEASE_TYPE_COLORS[d] ?? '#6366f1'}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
