import { useEffect, useState, useMemo } from 'react';
import { Bell, RefreshCw, ShoppingCart, Loader2, CheckCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../store/uiStore';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import api from '../services/api';
import { forecastV2Service } from '../services/forecastV2Service';
import type { SuggestionItem } from '../services/forecastV2Service';

interface SummaryData {
  total_items?: number;
  critical?: number;
  low?: number;
  warning?: number;
  sufficient?: number;
}

export default function Alerts() {
  const queryClient = useQueryClient();
  const { setPageTitle } = useUIStore();

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'shortage' | 'safe'>('shortage');

  useEffect(() => {
    setPageTitle('Cảnh báo');
    initSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Chỉ load suggestions nếu service đã train xong, tránh chờ vài chục giây. */
  const initSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await forecastV2Service.getStatus();
      if (!status.is_trained) {
        setError(
          'Mô hình AI chưa được huấn luyện. Vào trang Dự báo và bấm "Train Model" trước khi xem cảnh báo.',
        );
        setLoading(false);
        return;
      }
      await loadSuggestions();
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Không kiểm tra được trạng thái mô hình.',
      );
      setLoading(false);
    }
  };

  const loadSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      // Lấy tồn kho hiện tại từ DB để pipeline so sánh đúng
      const currentInventory = await forecastV2Service.getInventoryForComparison();

      const result = await forecastV2Service.runFullPipeline({
        prev_month_weather: { temp: 30, humidity: 78, rainfall: 180, aqi: 95 },
        forecast_weather: { temp: 28, humidity: 82, rainfall: 312, aqi: 75 },
        target_month: new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2,
        current_inventory: currentInventory,
        top_n_supplies: 50,
      });
      const inv = result.result.inventory_comparison;
      if (inv) {
        setSuggestions(inv.suggestions || []);
        setSummary(inv.summary || null);
      } else {
        setSuggestions([]);
        setSummary(null);
      }
      setImported(false);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Không tải được cảnh báo. Hãy chạy Dự báo (bước 1-4) trước.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImportToInventory = async () => {
    const items = suggestions
      .filter((s) => (s.order_quantity || 0) > 0)
      .map((s) => ({
        drug_name: s.DrugName || '',
        quantity: s.order_quantity || 0,
        unit: s.UnitOfMeasure || '',
      }));
    if (items.length === 0) return;

    setImporting(true);
    try {
      const res: any = await forecastV2Service.importToInventory(items);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      const resolved = res?.alerts_resolved ?? 0;
      alert(
        `✅ Đã nhập ${items.length} vật tư vào tồn kho` +
          (resolved ? ` và xử lý ${resolved} cảnh báo!` : '!'),
      );
      setImported(true);
      // Cũng yêu cầu backend re-evaluate alert thread
      try {
        await api.post('/alerts/check');
      } catch {
        /* không ảnh hưởng UX */
      }
      // Reload suggestions để bảng phản ánh trạng thái mới
      loadSuggestions();
    } catch (err: any) {
      alert('Lỗi: ' + (err?.message || ''));
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return suggestions;
    if (statusFilter === 'safe') return suggestions.filter((s) => s.status === 'An toàn');
    return suggestions.filter((s) => s.status !== 'An toàn');
  }, [suggestions, statusFilter]);

  const shortageCount = suggestions.filter((s) => s.status !== 'An toàn').length;

  // ── UI ────────────────────────────────────────────────────────────────────

  if (loading && suggestions.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-neutral-900">Cảnh báo Thiếu hụt</h2>
            {shortageCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-red-500 text-white text-xs font-bold">
                {shortageCount}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Danh sách vật tư thiếu hụt theo dự báo so với tồn kho hiện tại. Nếu bạn đã nhập từ
            trang <span className="font-medium text-neutral-700">Dự báo</span>, bảng này sẽ tự
            cập nhật về trạng thái an toàn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={loadSuggestions}
            isLoading={loading}
            className="inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </Button>
          {shortageCount > 0 && (
            <button
              onClick={handleImportToInventory}
              disabled={importing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShoppingCart className="w-4 h-4" />
              )}
              Nhập đề xuất vào Tồn kho
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty / fully fulfilled */}
      {!loading && !error && shortageCount === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">
              Tất cả vật tư đang ở mức an toàn
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              {imported
                ? 'Bạn vừa nhập đề xuất vào tồn kho. Cảnh báo đã được xử lý.'
                : 'Không có vật tư nào thiếu hụt theo dự báo hiện tại.'}
            </p>
          </div>
        </div>
      )}

      {/* Stats summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Nguy hiểm"
            value={summary.critical || 0}
            tone="red"
          />
          <StatCard
            label="Cảnh báo"
            value={summary.low || 0}
            tone="yellow"
          />
          <StatCard
            label="Cần bổ sung"
            value={summary.warning || 0}
            tone="orange"
          />
          <StatCard
            label="An toàn"
            value={summary.sufficient || 0}
            tone="green"
          />
        </div>
      )}

      {/* Filter tabs */}
      {suggestions.length > 0 && (
        <div className="flex gap-2 text-sm">
          <FilterTab
            active={statusFilter === 'shortage'}
            onClick={() => setStatusFilter('shortage')}
            label={`Thiếu hụt (${shortageCount})`}
          />
          <FilterTab
            active={statusFilter === 'safe'}
            onClick={() => setStatusFilter('safe')}
            label={`An toàn (${suggestions.length - shortageCount})`}
          />
          <FilterTab
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            label={`Tất cả (${suggestions.length})`}
          />
        </div>
      )}

      {/* Procurement table — same look as Forecasting Step 5 */}
      {filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2 w-12">#</th>
                  <th className="text-left px-3 py-2">Vật tư / Thuốc</th>
                  <th className="text-center px-3 py-2">Trạng thái</th>
                  <th className="text-right px-3 py-2">Tồn kho</th>
                  <th className="text-right px-3 py-2">Nhu cầu</th>
                  <th className="text-right px-3 py-2">Đề xuất nhập</th>
                  <th className="text-center px-3 py-2">Ưu tiên</th>
                  <th className="text-left px-3 py-2">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const statusColors: Record<string, string> = {
                    'Nguy hiểm': 'bg-red-100 text-red-800',
                    'Cảnh báo': 'bg-yellow-100 text-yellow-800',
                    'Cần bổ sung': 'bg-orange-100 text-orange-700',
                    'An toàn': 'bg-green-100 text-green-800',
                  };
                  const priorityColors: Record<string, string> = {
                    CAO: 'bg-red-100 text-red-700',
                    'TRUNG BÌNH': 'bg-yellow-100 text-yellow-700',
                    THẤP: 'bg-gray-100 text-gray-600',
                  };
                  return (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-2 max-w-xs truncate" title={item.DrugName}>
                        {item.DrugName?.length > 55
                          ? `${item.DrugName.slice(0, 55)}…`
                          : item.DrugName}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            statusColors[item.status] || ''
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {item.current_stock?.toLocaleString() ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Math.round(item.safety_demand || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-blue-700">
                        {item.order_quantity > 0
                          ? item.order_quantity.toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            priorityColors[item.priority] || ''
                          }`}
                        >
                          {item.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">{item.action}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'red' | 'yellow' | 'orange' | 'green';
}) {
  const palette: Record<string, { bg: string; border: string; text: string }> = {
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  };
  const p = palette[tone];
  return (
    <div className={`${p.bg} ${p.border} border rounded-xl p-4 text-center`}>
      <p className={`text-2xl font-bold ${p.text}`}>{value}</p>
      <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg font-medium transition ${
        active
          ? 'bg-neutral-900 text-white'
          : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      {label}
    </button>
  );
}
