import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, AlertTriangle, CheckCircle2, TrendingUp, Calculator } from 'lucide-react';

import { useUIStore } from '../store/uiStore';
import {
  supplyRecommendationService,
  type AggregatedItem,
  type DiseaseRecommendation,
} from '../services/supplyRecommendationService';
import LoadingSpinner from '../components/common/LoadingSpinner';

/**
 * Module 7 — Đề xuất nhập kho
 *
 * Áp dụng đầy đủ công thức theo yêu cầu mục 4-7:
 *  - Mục 5.1: Phân bổ ca theo Nhẹ/TB/Nặng (severity_rate)
 *  - Mục 6:   Nhu cầu = Σ(số ca × định mức) × (1 + dự phòng 15%)
 *  - Mục 7:   Đề xuất nhập = max(0, nhu cầu + ngưỡng AT - tồn kho)
 */
export default function Alerts() {
  const { setPageTitle } = useUIStore();

  useEffect(() => {
    setPageTitle('Đề xuất nhập kho');
  }, [setPageTitle]);

  // Mặc định lấy tháng hiện tại
  const [forecastMonth, setForecastMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [bufferRate, setBufferRate] = useState<number>(15);
  const [selectedDisease, setSelectedDisease] = useState<string>('all');

  const monthDate = `${forecastMonth}-01`;

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['supply-recommendations', forecastMonth, bufferRate],
    queryFn: () =>
      supplyRecommendationService.calculateForMonth({
        forecast_month: monthDate,
        buffer_rate: bufferRate,
      }),
    staleTime: 60_000,
    retry: false,
  });

  // Filter theo bệnh
  const filteredItems = useMemo<AggregatedItem[]>(() => {
    if (!data) return [];
    if (selectedDisease === 'all') return data.items;
    // Khi chọn 1 bệnh → lấy items từ disease đó
    const dis = data.diseases.find((d) => d.icd_code === selectedDisease);
    if (!dis) return [];
    // Convert disease items → aggregated style để table dùng chung
    return dis.items.map<AggregatedItem>((it) => ({
      supply_id: it.supply_id,
      supply_code: it.supply_code,
      drug_code: it.drug_code,
      ten_hoat_chat: it.ten_hoat_chat,
      unit: it.unit,
      group_name: it.group_name,
      current_stock: it.current_stock,
      safety_stock: it.safety_stock,
      buffer_rate: it.buffer_rate,
      need_before_buffer_total: it.need_before_buffer,
      predicted_need_total: it.predicted_need,
      suggested_import: it.suggested_import,
      status: it.status,
      by_disease: [
        {
          icd_code: dis.icd_code,
          disease_name: dis.disease_name,
          predicted_cases: dis.predicted_cases,
          predicted_need: it.predicted_need,
        },
      ],
    }));
  }, [data, selectedDisease]);

  // KPIs
  const kpis = useMemo(() => {
    if (!filteredItems.length) {
      return { shortage: 0, sufficient: 0, totalImport: 0, totalNeed: 0 };
    }
    return {
      shortage: filteredItems.filter((i) => i.suggested_import > 0).length,
      sufficient: filteredItems.filter((i) => i.suggested_import === 0).length,
      totalImport: filteredItems.reduce((s, i) => s + i.suggested_import, 0),
      totalNeed: filteredItems.reduce((s, i) => s + i.predicted_need_total, 0),
    };
  }, [filteredItems]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-neutral-900">
            Đề xuất nhập kho
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Tính theo công thức: Nhu cầu = Σ(số ca × định mức) × (1 + dự phòng) ·
            Đề xuất nhập = max(0, nhu cầu + ngưỡng AT - tồn kho)
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Tháng dự báo
          </label>
          <input
            type="month"
            value={forecastMonth}
            onChange={(e) => setForecastMonth(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Bệnh
          </label>
          <select
            value={selectedDisease}
            onChange={(e) => setSelectedDisease(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
          >
            <option value="all">Tất cả bệnh (cộng dồn)</option>
            {data?.diseases.map((d) => (
              <option key={d.icd_code} value={d.icd_code}>
                {d.icd_code} - {d.disease_name} ({d.predicted_cases} ca)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Hệ số dự phòng (%)
          </label>
          <select
            value={bufferRate}
            onChange={(e) => setBufferRate(Number(e.target.value))}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
          >
            <option value={5}>5% (rủi ro thấp)</option>
            <option value={10}>10%</option>
            <option value={15}>15% (mặc định)</option>
            <option value={20}>20% (rủi ro cao)</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Calculator className="w-4 h-4" />
            {isFetching ? 'Đang tính...' : 'Tính lại'}
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Cần nhập"
          value={kpis.shortage}
          tone="warning"
          subtitle="vật tư"
        />
        <KpiCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Đủ tồn"
          value={kpis.sufficient}
          tone="success"
          subtitle="vật tư"
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Tổng nhu cầu"
          value={kpis.totalNeed}
          tone="info"
          subtitle="đơn vị (đã +dự phòng)"
        />
        <KpiCard
          icon={<ShoppingCart className="w-5 h-5" />}
          label="Tổng đề xuất nhập"
          value={kpis.totalImport}
          tone="primary"
          subtitle="đơn vị"
        />
      </div>

      {/* Severity breakdown when filter by disease */}
      {selectedDisease !== 'all' && data && (
        <SeverityBreakdownCard
          recommendation={data.diseases.find((d) => d.icd_code === selectedDisease)}
        />
      )}

      {/* Main table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">
            Danh sách thuốc/vật tư
          </h3>
          <span className="text-xs text-neutral-500">
            {filteredItems.length} mục
          </span>
        </div>

        {isLoading && (
          <div className="py-16">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-sm text-red-600">
            Lỗi tải dữ liệu: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && filteredItems.length === 0 && (
          <div className="p-12 text-center text-sm text-neutral-500">
            Không có dữ liệu cho tháng này. Hãy đảm bảo đã có ca bệnh hoặc dự báo
            cho tháng {forecastMonth}.
          </div>
        )}

        {!isLoading && filteredItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-100 bg-neutral-50">
                  <th className="px-4 py-3 font-semibold">Mã</th>
                  <th className="px-4 py-3 font-semibold">Tên hoạt chất</th>
                  <th className="px-4 py-3 font-semibold">Nhóm</th>
                  <th className="px-4 py-3 font-semibold text-right">Nhu cầu cuối</th>
                  <th className="px-4 py-3 font-semibold text-right">Tồn kho</th>
                  <th className="px-4 py-3 font-semibold text-right">Ngưỡng AT</th>
                  <th className="px-4 py-3 font-semibold text-right">Đề xuất nhập</th>
                  <th className="px-4 py-3 font-semibold text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it) => (
                  <tr
                    key={it.supply_id}
                    className="border-b border-neutral-50 hover:bg-neutral-50/60"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                      {it.supply_code}
                    </td>
                    <td className="px-4 py-3 text-neutral-900 font-medium">
                      {it.ten_hoat_chat}
                      <div className="text-[11px] text-neutral-500 font-normal mt-0.5">
                        {it.drug_code}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {it.group_name}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-900">
                      {it.predicted_need_total.toLocaleString('vi-VN')}
                      <div className="text-[11px] text-neutral-400 font-normal">
                        {it.unit}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-700">
                      {it.current_stock.toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-500">
                      {it.safety_stock.toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          it.suggested_import > 0
                            ? 'text-orange-600 font-bold'
                            : 'text-neutral-400'
                        }
                      >
                        {it.suggested_import.toLocaleString('vi-VN')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {it.status === 'shortage' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-medium">
                          Cần nhập
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                          Đủ
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'warning' | 'success' | 'info' | 'primary';
  subtitle?: string;
}) {
  const toneStyles: Record<string, string> = {
    warning: 'bg-orange-50 text-orange-700',
    success: 'bg-emerald-50 text-emerald-700',
    info: 'bg-blue-50 text-blue-700',
    primary: 'bg-violet-50 text-violet-700',
  };
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneStyles[tone]}`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-xs text-neutral-500">{label}</div>
          <div className="text-2xl font-bold text-neutral-900">
            {value.toLocaleString('vi-VN')}
          </div>
          {subtitle && (
            <div className="text-[11px] text-neutral-400">{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeverityBreakdownCard({
  recommendation,
}: {
  recommendation?: DiseaseRecommendation;
}) {
  if (!recommendation) return null;
  const { severity_breakdown: sb, predicted_cases, disease_name, icd_code } = recommendation;
  return (
    <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-5">
      <h4 className="text-sm font-semibold text-blue-900 mb-3">
        {icd_code} - {disease_name}
        <span className="ml-2 text-blue-700 font-normal">
          ({predicted_cases} ca dự báo)
        </span>
      </h4>
      <div className="grid grid-cols-3 gap-4">
        <SeverityCell
          label="Nhẹ"
          rate={sb.mild_rate}
          cases={sb.mild_cases}
          color="green"
        />
        <SeverityCell
          label="Trung bình"
          rate={sb.moderate_rate}
          cases={sb.moderate_cases}
          color="yellow"
        />
        <SeverityCell
          label="Nặng"
          rate={sb.severe_rate}
          cases={sb.severe_cases}
          color="red"
        />
      </div>
    </div>
  );
}

function SeverityCell({
  label,
  rate,
  cases,
  color,
}: {
  label: string;
  rate: number;
  cases: number;
  color: 'green' | 'yellow' | 'red';
}) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-100 text-emerald-700',
    yellow: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <div className="bg-white rounded-lg p-3">
      <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${colors[color]}`}>
        {label} ({rate}%)
      </div>
      <div className="text-2xl font-bold text-neutral-900">
        {cases.toLocaleString('vi-VN')}
        <span className="text-sm text-neutral-500 font-normal ml-1">ca</span>
      </div>
    </div>
  );
}
