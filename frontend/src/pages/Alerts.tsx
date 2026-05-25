import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Loader2, FileSpreadsheet } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useSupplyRequirementsSummary } from '../hooks/useSupplyRequirements';
import { useSafetyRate } from '../hooks/useAdminCatalog';
import { SUPPLY_CATEGORY_LABELS } from '../utils/constants';
import api from '../services/api';
import StatusKpiCards, {
  type StockClass,
} from '../components/alerts/StatusKpiCards';
import AlertsToolbar, {
  type AlertsFilters,
} from '../components/alerts/AlertsToolbar';
import AlertsTable, {
  type AlertRow,
} from '../components/alerts/AlertsTable';
import CalculationSidebar from '../components/alerts/CalculationSidebar';

const PAGE_SIZE = 5;
const DEFAULT_SAFETY_RATE = 0.15; // fallback nếu admin chưa cấu hình

/** Module 7 — Cảnh báo & Đề xuất nhập kho */
export default function Alerts() {
  const { setPageTitle } = useUIStore();

  useEffect(() => {
    setPageTitle('Cảnh báo & Đề xuất nhập kho');
  }, [setPageTitle]);

  const [filters, setFilters] = useState<AlertsFilters>({
    search: '',
    status: 'all',
    category: 'all',
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Action states
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const [planResult, setPlanResult] = useState<{
    plans_generated: number;
    critical_plans: number;
    high_plans: number;
    normal_plans: number;
  } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const { data, isLoading } = useSupplyRequirementsSummary();
  const { data: adminSafetyRate } = useSafetyRate();
  const safetyRate = adminSafetyRate ?? DEFAULT_SAFETY_RATE;

  // Map summary items → AlertRow + classify status theo spec 7.5
  const allRows: AlertRow[] = useMemo(() => {
    if (!data) return [];
    return data.items.map((it) => {
      const stock = it.current_stock ?? 0;
      const demand = it.total_required_quantity || 0;
      const status = classifyStock(stock, demand);
      const safety = Math.round(demand * safetyRate);
      const recommended = Math.max(0, demand + safety - stock);
      return {
        id: it.supply_id,
        supply_id: it.supply_id,
        name: it.supply_name,
        code: buildCode(it.supply_category, it.supply_id),
        unit: it.supply_unit ?? '',
        currentStock: stock,
        demand,
        recommendedOrder: recommended,
        status,
      };
    });
  }, [data, safetyRate]);

  const counts = useMemo(() => {
    const acc: Record<StockClass, number> = {
      critical: 0,
      warning: 0,
      safe: 0,
      overstock: 0,
    };
    allRows.forEach((r) => {
      acc[r.status]++;
    });
    return acc;
  }, [allRows]);

  // Categories cho dropdown
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach((r) => {
      const cat = data?.items.find((i) => i.supply_id === r.id)?.supply_category;
      if (cat) set.add(cat);
    });
    return Array.from(set).map((key) => ({
      key,
      label: SUPPLY_CATEGORY_LABELS[key] ?? key,
    }));
  }, [allRows, data]);

  // Áp filter
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (q && !`${r.code} ${r.name}`.toLowerCase().includes(q)) return false;
      if (filters.status !== 'all' && r.status !== filters.status) return false;
      if (filters.category !== 'all') {
        const item = data?.items.find((i) => i.supply_id === r.id);
        if (item?.supply_category !== filters.category) return false;
      }
      return true;
    });
  }, [allRows, filters, data]);

  // Paginate
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Reset page khi đổi filter
  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.status, filters.category]);

  const onKpiSelect = (key: StockClass | 'all') => {
    setFilters((f) => ({ ...f, status: key }));
  };

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(paged.map((r) => r.id)));
  };

  // ── Spec 7.6: Tạo kế hoạch tổng thể ──────────────────────────────────────
  const handleCreatePlan = async () => {
    if (creatingPlan) return;
    try {
      setCreatingPlan(true);
      const res = await api.post('/procurement/generate', {
        forecast_days: 30,
      });
      const d = res.data ?? {};
      setPlanResult({
        plans_generated: d.plans_generated ?? 0,
        critical_plans: d.critical_plans ?? 0,
        high_plans: d.high_plans ?? 0,
        normal_plans: d.normal_plans ?? 0,
      });
      setSelected(new Set()); // clear selection
    } catch (err: any) {
      alert(
        'Không thể tạo kế hoạch: ' +
          (err?.response?.data?.detail || err.message || 'không rõ lỗi'),
      );
    } finally {
      setCreatingPlan(false);
    }
  };

  // ── Spec 7.2 #9: Xuất kế hoạch PDF/Excel ────────────────────────────────
  const handleExport = async (format: 'pdf' | 'excel') => {
    if (exporting) return;
    setShowExportMenu(false);
    try {
      setExporting(format);
      const res = await api.get('/procurement/export', {
        params: { format },
        responseType: 'blob',
      });
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const mime =
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `procurement_plans_${new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Không thể xuất file: ' + (err?.message || ''));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-neutral-900">
            Cảnh báo & Đề xuất nhập kho
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Quản lý định mức vật tư y tế theo dự báo nhu cầu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 relative">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!!exporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exporting === 'pdf'
                ? 'Đang xuất PDF...'
                : exporting === 'excel'
                ? 'Đang xuất Excel...'
                : 'Xuất báo cáo PDF/Excel'}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 z-20 w-48 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  className="w-full text-left px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                >
                  <Download className="w-4 h-4 text-red-500" />
                  Xuất PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('excel')}
                  className="w-full text-left px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 border-t border-neutral-100"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Xuất Excel
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleCreatePlan}
            disabled={creatingPlan}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creatingPlan ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {creatingPlan ? 'Đang tạo kế hoạch...' : 'Tạo kế hoạch tổng thể'}
          </button>
        </div>
      </div>

      {/* Main grid: left content + right sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5 min-w-0">
          <StatusKpiCards counts={counts} active={filters.status as StockClass | 'all'} onSelect={onKpiSelect} />

          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <AlertsToolbar
              filters={filters}
              onChange={setFilters}
              categories={categoryOptions}
            />
            <AlertsTable
              rows={paged}
              isLoading={isLoading}
              total={filtered.length}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              selectedIds={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
            />
          </div>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <CalculationSidebar safetyRate={safetyRate} />
        </div>
      </div>

      {/* Plan result modal */}
      {planResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100">
              <h3 className="text-base font-semibold text-neutral-900">
                Kế hoạch nhập kho đã tạo
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Hệ thống vừa gom các vật tư cần nhập thành 1 kế hoạch tổng thể.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-center">
                <p className="text-[11px] uppercase font-semibold text-blue-700">
                  Tổng số kế hoạch
                </p>
                <p className="text-3xl font-extrabold text-blue-700 mt-1 tabular-nums">
                  {planResult.plans_generated}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-red-50 border border-red-100 p-2.5 text-center">
                  <p className="text-[10px] uppercase font-semibold text-red-700">
                    Khẩn cấp
                  </p>
                  <p className="text-xl font-bold text-red-700 mt-0.5">
                    {planResult.critical_plans}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 text-center">
                  <p className="text-[10px] uppercase font-semibold text-amber-700">
                    Cao
                  </p>
                  <p className="text-xl font-bold text-amber-700 mt-0.5">
                    {planResult.high_plans}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2.5 text-center">
                  <p className="text-[10px] uppercase font-semibold text-emerald-700">
                    Thường
                  </p>
                  <p className="text-xl font-bold text-emerald-700 mt-0.5">
                    {planResult.normal_plans}
                  </p>
                </div>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Bấm <strong>Xuất báo cáo PDF/Excel</strong> để tải kế hoạch chi
                tiết, hoặc vào trang Đề xuất nhập kho để duyệt từng dòng.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPlanResult(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlanResult(null);
                  handleExport('pdf');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                Xuất PDF ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Spec 7.5: phân loại theo tỉ lệ tồn kho / nhu cầu dự báo. */
function classifyStock(stock: number, demand: number): StockClass {
  if (demand <= 0) {
    // Không có nhu cầu dự báo → coi như dư tồn nếu có hàng, an toàn nếu = 0
    return stock > 0 ? 'overstock' : 'safe';
  }
  const ratio = stock / demand;
  if (ratio < 0.1) return 'critical';
  if (ratio < 0.25) return 'warning';
  if (ratio <= 1.5) return 'safe';
  return 'overstock';
}

function buildCode(category: string | undefined | null, id: number): string {
  const prefix: Record<string, string> = {
    medicine: 'MED',
    mask: 'TB',
    glove: 'TB',
    test_kit: 'TB',
    disinfectant: 'HC',
    iv_fluid: 'VT',
    other: 'VT',
  };
  const p = prefix[category ?? ''] ?? 'VT';
  return `${p}-${String(id).padStart(4, '0')}`;
}
