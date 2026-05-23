import { useEffect } from 'react';
import { Package, AlertTriangle, TrendingUp, Activity, RefreshCw, Banknote } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import {
  useDashboardOverview,
  useDashboardSupplyDemand,
  useDashboardRiskStatus,
  useDashboardCriticalAlerts,
} from '../hooks/useDashboard';
import MetricCard from '../components/dashboard/MetricCard';
import SupplyDemandChart from '../components/dashboard/SupplyDemandChart';
import RiskStatusChart from '../components/dashboard/RiskStatusChart';
import DiseaseTrendCard from '../components/dashboard/DiseaseTrendCard';
import CriticalAlertsTable from '../components/dashboard/CriticalAlertsTable';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { formatNumber, formatCurrency } from '../utils/formatters';

export default function Dashboard() {
  const { setPageTitle } = useUIStore();

  const {
    data: overview,
    isLoading: isLoadingOverview,
    refetch: refetchOverview,
    dataUpdatedAt,
  } = useDashboardOverview();

  const {
    data: supplyDemand,
    isLoading: isLoadingSupplyDemand,
    refetch: refetchSupplyDemand,
  } = useDashboardSupplyDemand();

  const {
    data: riskStatus,
    isLoading: isLoadingRiskStatus,
    refetch: refetchRiskStatus,
  } = useDashboardRiskStatus();

  const {
    data: criticalAlerts,
    isLoading: isLoadingAlerts,
    refetch: refetchAlerts,
  } = useDashboardCriticalAlerts(5);

  useEffect(() => {
    setPageTitle('Dashboard');
  }, [setPageTitle]);

  const handleRefresh = () => {
    refetchOverview();
    refetchSupplyDemand();
    refetchRiskStatus();
    refetchAlerts();
  };

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Tổng quan hệ thống</h2>
          {lastUpdated && (
            <p className="text-xs text-neutral-400 mt-0.5">
              Cập nhật lần cuối: {lastUpdated} · Tự động làm mới mỗi 5 phút
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          leftIcon={<RefreshCw size={14} />}
          isLoading={isLoadingOverview}
        >
          Làm mới
        </Button>
      </div>

      {/* Metric cards */}
      {isLoadingOverview ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-neutral-200 p-6 flex items-center justify-center h-32"
            >
              <LoadingSpinner size="md" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <MetricCard
            title="Tổng vật tư"
            value={overview ? formatNumber(overview.total_supplies) : '—'}
            subtitle="Loại vật tư đang quản lý"
            icon={<Package size={22} />}
            color="primary"
          />
          <MetricCard
            title="Giá trị tồn kho"
            value={
              overview
                ? formatCurrency(overview.total_inventory_value || 0)
                : '—'
            }
            subtitle="Tổng giá trị hiện tại"
            icon={<Banknote size={22} />}
            color="success"
          />
          <MetricCard
            title="Nguy cơ thiếu hụt"
            value={overview ? formatNumber(overview.high_risk_shortages) : '—'}
            subtitle={
              overview
                ? `${overview.supply_risk_percentage.toFixed(1)}% danh mục có rủi ro`
                : 'Cần xử lý ngay'
            }
            icon={<AlertTriangle size={22} />}
            color="danger"
          />
          <MetricCard
            title="Nhu cầu dự báo (30 ngày)"
            value={overview ? formatNumber(overview.predicted_demand_30d) : '—'}
            subtitle="Tổng số ca dự báo tới"
            icon={<TrendingUp size={22} />}
            color="warning"
          />
          <MetricCard
            title="Nhóm bệnh đang theo dõi"
            value={overview ? formatNumber(overview.disease_outbreaks) : '—'}
            subtitle="Có ca trong 7 ngày"
            icon={<Activity size={22} />}
            color="primary"
          />
        </div>
      )}

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoadingSupplyDemand ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6 flex items-center justify-center h-72">
            <LoadingSpinner size="md" label="Đang tải biểu đồ..." />
          </div>
        ) : (
          <SupplyDemandChart data={supplyDemand} />
        )}

        {isLoadingRiskStatus || !riskStatus ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6 flex items-center justify-center h-72">
            <LoadingSpinner size="md" label="Đang tải biểu đồ..." />
          </div>
        ) : (
          <RiskStatusChart data={riskStatus} />
        )}
      </div>

      {/* Charts row 2 */}
      <DiseaseTrendCard />

      {/* Critical alerts table */}
      {isLoadingAlerts ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 flex items-center justify-center h-40">
          <LoadingSpinner size="md" label="Đang tải cảnh báo..." />
        </div>
      ) : (
        <CriticalAlertsTable alerts={criticalAlerts ?? []} />
      )}
    </div>
  );
}
