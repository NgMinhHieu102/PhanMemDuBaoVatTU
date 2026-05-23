import { useEffect, useState } from 'react';
import { BarChart2, RefreshCw } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import {
  useConsumptionReport,
  useForecastAccuracyReport,
  useInventoryTurnoverReport,
} from '../hooks/useReports';
import ConsumptionReport from '../components/reports/ConsumptionReport';
import PerformanceTable from '../components/reports/PerformanceTable';
import ReportFiltersComponent from '../components/reports/ReportFilters';
import ExportButton from '../components/reports/ExportButton';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { ReportFilters, ReportType } from '../types/reports';
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
import { CardHeader } from '../components/common/Card';
import { formatNumber } from '../utils/formatters';

// ── Tab definitions ──────────────────────────────────────────────────────────

const TABS: { id: ReportType; label: string }[] = [
  { id: 'consumption', label: 'Tiêu thụ vật tư' },
  { id: 'forecast-accuracy', label: 'Độ chính xác dự báo' },
  { id: 'inventory-turnover', label: 'Vòng quay tồn kho' },
];

// ── Inventory Turnover chart+table ───────────────────────────────────────────

function InventoryTurnoverView({
  data,
  isLoading,
}: {
  data: ReturnType<typeof useInventoryTurnoverReport>['data'];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner size="lg" label="Đang tải báo cáo vòng quay..." />
        </div>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Báo cáo Vòng quay Tồn kho"
          subtitle="Tỷ lệ vòng quay theo vật tư trong kỳ báo cáo"
        />
        <div className="flex items-center justify-center h-40 text-neutral-400 text-sm">
          Không có dữ liệu trong khoảng thời gian đã chọn
        </div>
      </Card>
    );
  }

  // Build chart data (top 10 by turnover)
  const chartData = data.items
    .filter((i) => i.turnover_rate !== null)
    .slice(0, 10)
    .map((item) => ({
      name: item.supply_name.length > 18 ? `${item.supply_name.slice(0, 17)}…` : item.supply_name,
      fullName: item.supply_name,
      turnover_rate: item.turnover_rate,
      days_of_supply: item.days_of_supply,
    }));

  return (
    <Card>
      <CardHeader
        title="Báo cáo Vòng quay Tồn kho"
        subtitle={`Kỳ: ${data.period.start_date} — ${data.period.end_date} (${data.period.period_days} ngày)`}
        action={
          <div className="flex gap-4 text-xs text-neutral-500">
            <span>
              TB vòng quay:{' '}
              <span className="font-semibold text-neutral-700">
                {data.summary.avg_turnover_rate.toFixed(2)}x
              </span>
            </span>
            <span>
              Hết hàng:{' '}
              <span className="font-semibold text-danger-600">
                {data.summary.out_of_stock_items}
              </span>
            </span>
          </div>
        }
      />

      {/* Top 10 chart */}
      {chartData.length > 0 && (
        <div className="h-64 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                stroke="#6b7280"
                style={{ fontSize: '10px' }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '11px' }}
                tickFormatter={(v) => `${v}x`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    turnover_rate: 'Vòng quay',
                    days_of_supply: 'Ngày tồn kho',
                  };
                  return [name === 'turnover_rate' ? `${value}x` : `${value} ngày`, labels[name] ?? name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(v) =>
                  v === 'turnover_rate' ? 'Vòng quay' : 'Ngày tồn kho'
                }
              />
              <Line
                type="monotone"
                dataKey="turnover_rate"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Full table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Vật tư</th>
              <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Danh mục</th>
              <th className="px-4 py-2.5 text-right font-semibold text-neutral-600">Tồn kho hiện tại</th>
              <th className="px-4 py-2.5 text-right font-semibold text-neutral-600">Yêu cầu kỳ</th>
              <th className="px-4 py-2.5 text-right font-semibold text-neutral-600">Vòng quay</th>
              <th className="px-4 py-2.5 text-right font-semibold text-neutral-600">Ngày tồn kho</th>
              <th className="px-4 py-2.5 text-center font-semibold text-neutral-600">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.supply_id}
                className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
              >
                <td className="px-4 py-2.5 font-medium text-neutral-700">{item.supply_name}</td>
                <td className="px-4 py-2.5 text-neutral-500">{item.category}</td>
                <td className="px-4 py-2.5 text-right text-neutral-700">
                  {formatNumber(item.current_stock)}{' '}
                  <span className="text-xs text-neutral-400">{item.unit}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-500">
                  {formatNumber(item.total_required_in_period)}
                </td>
                <td className="px-4 py-2.5 text-right font-medium">
                  {item.turnover_rate !== null ? (
                    <span
                      className={
                        item.turnover_rate >= 1
                          ? 'text-success-600'
                          : item.turnover_rate >= 0.5
                          ? 'text-warning-600'
                          : 'text-danger-600'
                      }
                    >
                      {item.turnover_rate.toFixed(2)}x
                    </span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-500">
                  {item.days_of_supply !== null ? `${item.days_of_supply} ngày` : '—'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                      item.stock_status === 'safe'
                        ? 'bg-success-50 text-success-700 border-success-200'
                        : item.stock_status === 'critical'
                        ? 'bg-danger-50 text-danger-700 border-danger-200'
                        : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                    }`}
                  >
                    {item.stock_status === 'safe'
                      ? 'An toàn'
                      : item.stock_status === 'critical'
                      ? 'Nguy hiểm'
                      : 'Hết hàng'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Main Reports page ─────────────────────────────────────────────────────────

export default function Reports() {
  const { setPageTitle } = useUIStore();
  const [activeTab, setActiveTab] = useState<ReportType>('consumption');
  const [filters, setFilters] = useState<ReportFilters>({});

  useEffect(() => {
    setPageTitle('Báo cáo');
  }, [setPageTitle]);

  // Fetch all three reports — only the active one is shown, but prefetched on mount
  const consumptionQuery = useConsumptionReport(
    activeTab === 'consumption' ? filters : undefined
  );
  const accuracyQuery = useForecastAccuracyReport(
    activeTab === 'forecast-accuracy' ? filters : undefined
  );
  const turnoverQuery = useInventoryTurnoverReport(
    activeTab === 'inventory-turnover' ? filters : undefined
  );

  const handleTabChange = (tab: ReportType) => {
    setActiveTab(tab);
    setFilters({}); // Reset filters when switching tabs
  };

  const handleRefresh = () => {
    if (activeTab === 'consumption') consumptionQuery.refetch();
    else if (activeTab === 'forecast-accuracy') accuracyQuery.refetch();
    else turnoverQuery.refetch();
  };

  const isLoading =
    activeTab === 'consumption'
      ? consumptionQuery.isLoading
      : activeTab === 'forecast-accuracy'
      ? accuracyQuery.isLoading
      : turnoverQuery.isLoading;

  // Build export filters from current filter state
  const exportFilters = {
    start_date: filters.start_date,
    end_date: filters.end_date,
    location: filters.location,
    category: filters.category,
    disease_type: filters.disease_type,
    model_used: filters.model_used,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-neutral-900">Báo cáo & Phân tích</h2>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Báo cáo tiêu thụ, độ chính xác dự báo và vòng quay tồn kho
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton reportType={activeTab} filters={exportFilters} />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            leftIcon={<RefreshCw size={14} />}
            isLoading={isLoading}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <ReportFiltersComponent
        filters={filters}
        reportType={activeTab}
        onChange={setFilters}
      />

      {/* Report content */}
      {activeTab === 'consumption' && (
        <ConsumptionReport
          data={consumptionQuery.data}
          isLoading={consumptionQuery.isLoading}
        />
      )}

      {activeTab === 'forecast-accuracy' && (
        <PerformanceTable
          data={accuracyQuery.data}
          isLoading={accuracyQuery.isLoading}
        />
      )}

      {activeTab === 'inventory-turnover' && (
        <InventoryTurnoverView
          data={turnoverQuery.data}
          isLoading={turnoverQuery.isLoading}
        />
      )}

      {/* Info panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          🔁 Luồng nghiệp vụ
        </h3>
        <p className="text-xs text-blue-800 mb-2">
          Báo cáo tổng hợp dữ liệu từ chuỗi module sau:
        </p>
        <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
          <li><strong>Dịch tễ học</strong>: nhập / import ca bệnh thực tế</li>
          <li><strong>Dự báo</strong>: AI tính số ca dự báo + nhu cầu vật tư</li>
          <li><strong>Tồn kho</strong>: cập nhật mức tồn kho hiện tại</li>
          <li><strong>Cảnh báo</strong>: so sánh nhu cầu vs tồn kho → sinh cảnh báo</li>
          <li><strong>Báo cáo</strong>: tổng hợp tiêu thụ, độ chính xác, vòng quay</li>
        </ol>
      </div>

      {/* Info panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          💡 Hướng dẫn sử dụng báo cáo
        </h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>
            • <strong>Tiêu thụ vật tư</strong>: Phân tích lượng vật tư được yêu cầu theo danh
            mục trong kỳ báo cáo
          </li>
          <li>
            • <strong>Độ chính xác dự báo</strong>: Theo dõi hiệu suất các mô hình AI qua các
            chỉ số MAE, RMSE, MAPE
          </li>
          <li>
            • <strong>Vòng quay tồn kho</strong>: Đánh giá tốc độ tiêu thụ so với mức tồn kho
            hiện tại
          </li>
          <li>
            • Nhấn <strong>Xuất PDF</strong> để tải báo cáo đang hiển thị dưới dạng file PDF
          </li>
        </ul>
      </div>
    </div>
  );
}
