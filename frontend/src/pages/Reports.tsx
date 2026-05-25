import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Eye } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import {
  useConsumptionReport,
  useForecastAccuracyReport,
} from '../hooks/useReports';
import { useSupplyRequirementsSummary } from '../hooks/useSupplyRequirements';
import {
  useDiseaseOptions,
  useForecastHistory,
  useRegionOptions,
} from '../hooks/useForecastAnalysis';
import { useInventory } from '../hooks/useInventory';
import { reportsService } from '../services/reportsService';
import { SUPPLY_CATEGORY_LABELS } from '../utils/constants';
import ReportTypePicker, {
  type ReportKind,
} from '../components/reports/ReportTypePicker';
import ReportFilterPanel, {
  type ReportFilterState,
} from '../components/reports/ReportFilterPanel';
import ReportPreview from '../components/reports/ReportPreview';

/** Module 8 — Báo cáo */
export default function Reports() {
  const { setPageTitle } = useUIStore();
  useEffect(() => {
    setPageTitle('Báo cáo');
  }, [setPageTitle]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const start30 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [kind, setKind] = useState<ReportKind>('epidemic');
  const [filters, setFilters] = useState<ReportFilterState>({
    startDate: start30,
    endDate: today,
    diseaseType: 'all',
    region: 'all',
    category: 'all',
  });

  // Data sources (chỉ fetch khi cần)
  const { data: diseases = [] } = useDiseaseOptions();
  const { data: regions = [] } = useRegionOptions();

  const consumption = useConsumptionReport(
    kind === 'inventory' || kind === 'shortage' || kind === 'procurement'
      ? {
          start_date: filters.startDate,
          end_date: filters.endDate,
          category: filters.category !== 'all' ? filters.category : undefined,
        }
      : undefined,
  );

  const accuracy = useForecastAccuracyReport(
    kind === 'accuracy'
      ? {
          start_date: filters.startDate,
          end_date: filters.endDate,
          disease_type:
            filters.diseaseType !== 'all' ? filters.diseaseType : undefined,
        }
      : undefined,
  );

  const requirements = useSupplyRequirementsSummary(
    kind === 'shortage' || kind === 'procurement'
      ? {
          disease_type:
            filters.diseaseType !== 'all' ? filters.diseaseType : undefined,
          start_date: filters.startDate,
          end_date: filters.endDate,
        }
      : undefined,
  );

  const inventory = useInventory(
    kind === 'inventory' ? { limit: 2000 } : undefined,
  );

  const forecastHistory = useForecastHistory(
    kind === 'forecast' || kind === 'accuracy'
      ? {
          limit: 100,
          disease_type:
            filters.diseaseType !== 'all' ? filters.diseaseType : undefined,
          region: filters.region !== 'all' ? filters.region : undefined,
        }
      : undefined,
  );

  const categoryOptions = useMemo(
    () =>
      Object.entries(SUPPLY_CATEGORY_LABELS).map(([key, label]) => ({
        key,
        label,
      })),
    [],
  );

  const periodLabel = `${formatDate(filters.startDate)} → ${formatDate(filters.endDate)}`;
  const filtersLabel = buildFiltersLabel(kind, filters, diseases);

  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      setExporting(format);
      // Backend nhận 'forecast-accuracy' chứ không phải 'accuracy'
      const backendType = kind === 'accuracy' ? 'forecast-accuracy' : kind;
      const blob = await reportsService.exportReport({
        report_type: backendType as any,
        format,
        start_date: filters.startDate,
        end_date: filters.endDate,
        disease_type:
          filters.diseaseType !== 'all' ? filters.diseaseType : undefined,
        location: filters.region !== 'all' ? filters.region : undefined,
        category: filters.category !== 'all' ? filters.category : undefined,
      } as any);
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      triggerDownload(blob, `${kind}-${filters.startDate}-${filters.endDate}.${ext}`);
    } catch (err) {
      console.error(err);
      alert('Không thể xuất báo cáo. Vui lòng thử lại.');
    } finally {
      setExporting(null);
    }
  };

  // Build preview metrics + sections theo từng loại
  const preview = useMemo(() => {
    switch (kind) {
      case 'epidemic':
        return buildEpidemicPreview(forecastHistory.data ?? []);
      case 'forecast':
        return buildForecastPreview(forecastHistory.data ?? []);
      case 'inventory':
        return buildInventoryPreview(inventory.data ?? []);
      case 'shortage':
        return buildShortagePreview(requirements.data?.items ?? []);
      case 'procurement':
        return buildProcurementPreview(requirements.data?.items ?? []);
      case 'accuracy':
        return buildAccuracyPreview(accuracy.data, forecastHistory.data ?? []);
    }
  }, [
    kind,
    consumption.data,
    accuracy.data,
    requirements.data,
    inventory.data,
    forecastHistory.data,
  ]);

  const isLoading =
    (kind === 'inventory' && inventory.isLoading) ||
    ((kind === 'shortage' || kind === 'procurement') && requirements.isLoading) ||
    (kind === 'accuracy' && accuracy.isLoading) ||
    ((kind === 'forecast' || kind === 'epidemic') && forecastHistory.isLoading);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-neutral-900">Báo cáo</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Tổng hợp dữ liệu dịch tễ, tồn kho và đề xuất nhập kho. Chọn loại báo cáo
            rồi cấu hình bộ lọc để xem trước & xuất file.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleExport('excel')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Xuất Excel
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={exporting === 'pdf'}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {exporting === 'pdf' ? (
              <Download className="w-4 h-4 animate-pulse" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Xuất PDF
          </button>
        </div>
      </div>

      {/* Step 1: chọn loại báo cáo */}
      <Section step="1" title="Chọn loại báo cáo">
        <ReportTypePicker active={kind} onSelect={setKind} />
      </Section>

      {/* Step 2: bộ lọc */}
      <Section step="2" title="Cấu hình bộ lọc">
        <ReportFilterPanel
          kind={kind}
          state={filters}
          onChange={setFilters}
          diseases={diseases}
          regions={regions}
          categories={categoryOptions}
        />
      </Section>

      {/* Step 3: preview */}
      <Section step="3" title="Xem trước báo cáo" icon={<Eye className="w-4 h-4" />}>
        <ReportPreview
          kind={kind}
          isLoading={isLoading}
          isEmpty={!isLoading && preview.metrics.length === 0 && preview.sections.length === 0}
          metrics={preview.metrics}
          sections={preview.sections}
          generatedAt={new Date().toLocaleString('vi-VN')}
          periodLabel={periodLabel}
          filtersLabel={filtersLabel}
        />
      </Section>
    </div>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  step,
  title,
  icon,
  children,
}: {
  step: string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">
          {step}
        </span>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {icon && <span className="text-neutral-400 ml-1">{icon}</span>}
      </div>
      {children}
    </section>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function buildFiltersLabel(
  kind: ReportKind,
  f: ReportFilterState,
  diseases: { key: string; label: string }[],
): string {
  const parts: string[] = [];
  if (['epidemic', 'forecast', 'accuracy'].includes(kind)) {
    const d =
      f.diseaseType === 'all'
        ? 'Tất cả bệnh'
        : diseases.find((x) => x.key === f.diseaseType)?.label ?? f.diseaseType;
    parts.push(d);
  }
  if (['epidemic', 'forecast'].includes(kind)) {
    parts.push(f.region === 'all' ? 'Toàn thành phố' : f.region);
  }
  if (['inventory', 'shortage', 'procurement'].includes(kind)) {
    parts.push(
      f.category === 'all'
        ? 'Tất cả nhóm'
        : SUPPLY_CATEGORY_LABELS[f.category] ?? f.category,
    );
  }
  return parts.join(' • ') || '—';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Preview builders cho từng loại ──────────────────────────────────────────

interface PreviewBundle {
  metrics: Array<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'default' | 'success' | 'warning' | 'danger';
  }>;
  sections: Array<{
    title: string;
    columns: { key: string; label: string; align?: 'left' | 'right' }[];
    rows: Array<Record<string, string | number>>;
  }>;
}

function buildEpidemicPreview(history: any[]): PreviewBundle {
  // Báo cáo dịch bệnh — dùng forecast history kèm số ca thực tế
  const totalActual = history.reduce(
    (acc, r) => acc + (r.actual_cases ?? 0),
    0,
  );
  const monthsCovered = new Set(history.map((r) => r.month)).size;

  return {
    metrics: [
      {
        label: 'Tổng ca thực tế',
        value: totalActual.toLocaleString('vi-VN'),
        hint: `Trong ${monthsCovered} tháng`,
      },
      {
        label: 'Số tháng có dữ liệu',
        value: monthsCovered,
      },
      {
        label: 'Số bệnh được ghi nhận',
        value: new Set(history.map((r) => r.disease_type)).size,
      },
    ],
    sections: [
      {
        title: 'Chi tiết theo tháng',
        columns: [
          { key: 'month', label: 'Tháng' },
          { key: 'disease_label', label: 'Bệnh' },
          { key: 'region', label: 'Khu vực' },
          { key: 'actual_cases', label: 'Số ca thực tế', align: 'right' },
        ],
        rows: history.slice(0, 20).map((r) => ({
          month: `Tháng ${r.month}`,
          disease_label: r.disease_label,
          region: r.region,
          actual_cases:
            r.actual_cases !== null
              ? r.actual_cases.toLocaleString('vi-VN')
              : '—',
        })),
      },
    ],
  };
}

function buildForecastPreview(history: any[]): PreviewBundle {
  const total = history.reduce((acc, r) => acc + (r.predicted_cases ?? 0), 0);
  const high = history.filter((r) => r.risk_level === 'high' || r.risk_level === 'very_high')
    .length;

  return {
    metrics: [
      {
        label: 'Tổng số ca dự báo',
        value: total.toLocaleString('vi-VN'),
      },
      {
        label: 'Số kỳ dự báo',
        value: history.length,
      },
      {
        label: 'Mức nguy cơ cao trở lên',
        value: high,
        tone: high > 0 ? 'danger' : 'default',
      },
    ],
    sections: [
      {
        title: 'Chi tiết dự báo',
        columns: [
          { key: 'month', label: 'Tháng' },
          { key: 'disease_label', label: 'Bệnh' },
          { key: 'region', label: 'Khu vực' },
          { key: 'predicted_cases', label: 'Số ca dự báo', align: 'right' },
          { key: 'risk_level', label: 'Mức nguy cơ' },
        ],
        rows: history.slice(0, 20).map((r) => ({
          month: `Tháng ${r.month}`,
          disease_label: r.disease_label,
          region: r.region,
          predicted_cases: r.predicted_cases.toLocaleString('vi-VN'),
          risk_level: vietnameseRisk(r.risk_level),
        })),
      },
    ],
  };
}

function buildInventoryPreview(items: any[]): PreviewBundle {
  const safe = items.filter(
    (i) => (i.current_stock ?? 0) > (i.safety_stock ?? 0),
  ).length;
  const low = items.filter(
    (i) =>
      (i.current_stock ?? 0) > 0 &&
      (i.current_stock ?? 0) <= (i.safety_stock ?? 0),
  ).length;
  const critical = items.filter((i) => (i.current_stock ?? 0) <= 0).length;

  return {
    metrics: [
      { label: 'Tổng vật tư', value: items.length },
      { label: 'An toàn', value: safe, tone: 'success' },
      { label: 'Dưới ngưỡng', value: low, tone: 'warning' },
      { label: 'Cần nhập gấp', value: critical, tone: 'danger' },
    ],
    sections: [
      {
        title: 'Danh sách vật tư',
        columns: [
          { key: 'name', label: 'Tên vật tư' },
          { key: 'category', label: 'Loại' },
          { key: 'unit', label: 'ĐVT' },
          { key: 'current_stock', label: 'Tồn kho', align: 'right' },
          { key: 'safety_stock', label: 'Ngưỡng AT', align: 'right' },
        ],
        rows: items.slice(0, 30).map((i: any) => ({
          name: i.supply?.name ?? '—',
          category:
            SUPPLY_CATEGORY_LABELS[i.supply?.category] ??
            i.supply?.category ??
            '—',
          unit: i.supply?.unit ?? '—',
          current_stock: (i.current_stock ?? 0).toLocaleString('vi-VN'),
          safety_stock: (i.safety_stock ?? 0).toLocaleString('vi-VN'),
        })),
      },
    ],
  };
}

function buildShortagePreview(items: any[]): PreviewBundle {
  const shortageItems = items.filter((i) => (i.shortage_amount ?? 0) > 0);
  const totalShortage = shortageItems.reduce(
    (acc, i) => acc + (i.shortage_amount ?? 0),
    0,
  );

  return {
    metrics: [
      { label: 'Số vật tư thiếu', value: shortageItems.length, tone: 'danger' },
      {
        label: 'Tổng lượng thiếu',
        value: totalShortage.toLocaleString('vi-VN'),
      },
    ],
    sections: [
      {
        title: 'Vật tư thiếu hụt',
        columns: [
          { key: 'name', label: 'Tên vật tư' },
          { key: 'unit', label: 'ĐVT' },
          { key: 'demand', label: 'Nhu cầu', align: 'right' },
          { key: 'stock', label: 'Tồn kho', align: 'right' },
          { key: 'shortage', label: 'Mức thiếu', align: 'right' },
        ],
        rows: shortageItems.slice(0, 30).map((i: any) => ({
          name: i.supply_name,
          unit: i.supply_unit ?? '',
          demand: (i.total_required_quantity ?? 0).toLocaleString('vi-VN'),
          stock: (i.current_stock ?? 0).toLocaleString('vi-VN'),
          shortage: (i.shortage_amount ?? 0).toLocaleString('vi-VN'),
        })),
      },
    ],
  };
}

function buildProcurementPreview(items: any[]): PreviewBundle {
  const SAFETY = 0.15;
  const rows = items
    .map((i: any) => {
      const stock = i.current_stock ?? 0;
      const demand = i.total_required_quantity ?? 0;
      const recommended = Math.max(0, demand + Math.round(demand * SAFETY) - stock);
      return { i, recommended, stock, demand };
    })
    .filter((r) => r.recommended > 0);

  const totalOrder = rows.reduce((acc, r) => acc + r.recommended, 0);

  return {
    metrics: [
      { label: 'Số vật tư cần nhập', value: rows.length, tone: 'warning' },
      {
        label: 'Tổng số lượng đề xuất',
        value: totalOrder.toLocaleString('vi-VN'),
      },
    ],
    sections: [
      {
        title: 'Đề xuất nhập kho',
        columns: [
          { key: 'name', label: 'Tên vật tư' },
          { key: 'unit', label: 'ĐVT' },
          { key: 'demand', label: 'Nhu cầu', align: 'right' },
          { key: 'stock', label: 'Tồn hiện tại', align: 'right' },
          { key: 'recommended', label: 'SL đề xuất', align: 'right' },
        ],
        rows: rows.slice(0, 30).map(({ i, recommended, stock, demand }) => ({
          name: i.supply_name,
          unit: i.supply_unit ?? '',
          demand: demand.toLocaleString('vi-VN'),
          stock: stock.toLocaleString('vi-VN'),
          recommended: recommended.toLocaleString('vi-VN'),
        })),
      },
    ],
  };
}

function buildAccuracyPreview(_accuracy: any, history: any[]): PreviewBundle {
  const withActual = history.filter((r) => r.deviation_pct !== null);
  const avgDeviation =
    withActual.length === 0
      ? 0
      : withActual.reduce((acc, r) => acc + Math.abs(r.deviation_pct ?? 0), 0) /
        withActual.length;

  return {
    metrics: [
      { label: 'Số kỳ đã đối chiếu', value: withActual.length },
      {
        label: 'Sai số trung bình',
        value: `${avgDeviation.toFixed(1)}%`,
        tone: avgDeviation <= 10 ? 'success' : avgDeviation <= 20 ? 'warning' : 'danger',
      },
    ],
    sections: [
      {
        title: 'So sánh dự báo vs thực tế',
        columns: [
          { key: 'month', label: 'Tháng' },
          { key: 'disease_label', label: 'Bệnh' },
          { key: 'predicted_cases', label: 'Dự báo', align: 'right' },
          { key: 'actual_cases', label: 'Thực tế', align: 'right' },
          { key: 'deviation', label: 'Độ lệch', align: 'right' },
        ],
        rows: withActual.slice(0, 30).map((r: any) => ({
          month: `Tháng ${r.month}`,
          disease_label: r.disease_label,
          predicted_cases: r.predicted_cases.toLocaleString('vi-VN'),
          actual_cases:
            r.actual_cases !== null
              ? r.actual_cases.toLocaleString('vi-VN')
              : '—',
          deviation: `${r.deviation_pct > 0 ? '+' : ''}${r.deviation_pct.toFixed(1)}%`,
        })),
      },
    ],
  };
}

function vietnameseRisk(level?: string): string {
  const map: Record<string, string> = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    very_high: 'Rất cao',
  };
  return map[level ?? ''] ?? '—';
}
