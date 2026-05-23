import { useEffect, useState, useMemo, useRef } from 'react';
import { Activity, RefreshCw, Plus, Upload, TrendingUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import {
  useDiseaseCases,
  useDiseaseStatistics,
  useDiseaseTrends,
} from '../hooks/useEpidemiology';
import api from '../services/api';
import { epidemiologyService } from '../services/epidemiologyService';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StatisticsCards from '../components/epidemiology/StatisticsCards';
import DiseaseTrendsChart from '../components/epidemiology/DiseaseTrendsChart';
import RecentCasesTable from '../components/epidemiology/RecentCasesTable';
import EpidemiologyFilters from '../components/epidemiology/EpidemiologyFilters';
import { ROUTES } from '../utils/constants';
import { DISEASE_TYPE_LABELS, type DiseaseType } from '../types/epidemiology';

export default function Epidemiology() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { setPageTitle } = useUIStore();
  const [selectedDiseaseType, setSelectedDiseaseType] = useState<DiseaseType | 'all'>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [importing, setImporting] = useState(false);

  // Add-case form state
  const [formDate, setFormDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [formType, setFormType] = useState<DiseaseType>('dengue_fever');
  const [formCount, setFormCount] = useState<number>(0);
  const [formLocation, setFormLocation] = useState<string>('Thành phố Hồ Chí Minh');

  useEffect(() => {
    setPageTitle('Dịch tễ học');
  }, [setPageTitle]);

  // Calculate date range for filters
  const dateRangeParams = useMemo(() => {
    if (selectedDateRange === 'all') {
      return {};
    }
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(selectedDateRange));
    
    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    };
  }, [selectedDateRange]);

  // Fetch statistics
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useDiseaseStatistics(
    dateRangeParams
  );

  // Fetch trends
  const { data: trendsData, isLoading: trendsLoading, refetch: refetchTrends } = useDiseaseTrends({
    disease_type: selectedDiseaseType !== 'all' ? selectedDiseaseType : undefined,
    ...dateRangeParams,
    limit: 100,
  });

  // Fetch recent cases
  const { data: recentCases, isLoading: casesLoading, refetch: refetchCases } = useDiseaseCases({
    disease_type: selectedDiseaseType !== 'all' ? selectedDiseaseType : undefined,
    limit: 20,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['disease-cases'] });
    refetchStats();
    refetchTrends();
    refetchCases();
  };

  const handleAddCase = async () => {
    if (!formDate || formCount < 0) return;
    try {
      await epidemiologyService.createDiseaseCase({
        recorded_at: new Date(formDate).toISOString(),
        disease_type: formType,
        case_count: formCount,
        location: formLocation,
      });
      setShowAdd(false);
      setFormCount(0);
      handleRefresh();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể tạo ca bệnh'));
    }
  };

  const handleImportCSV = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/disease-cases/import-csv', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });
      const d = res.data ?? {};
      alert(
        `✅ Import xong: thêm ${d.imported ?? 0}, cập nhật ${d.updated ?? 0}, bỏ qua ${d.skipped ?? 0}`,
      );
      handleRefresh();
    } catch (err: any) {
      alert('Lỗi import: ' + (err.response?.data?.detail || err.message || ''));
    } finally {
      setImporting(false);
    }
  };

  const isLoading = statsLoading || trendsLoading || casesLoading;

  if (isLoading && !statsData && !trendsData && !recentCases) {
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
            <Activity className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-neutral-900">Dữ liệu Dịch tễ học</h2>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Theo dõi xu hướng dịch bệnh: Sốt xuất huyết, Cúm mùa, Bệnh hô hấp
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportCSV(f);
              if (e.target) e.target.value = '';
            }}
          />
          <Button
            variant="primary"
            onClick={() => navigate(ROUTES.FORECASTING)}
            className="inline-flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            Chạy dự báo
          </Button>
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            isLoading={importing}
            className="inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Thêm ca bệnh
          </Button>
          <Button
            variant="secondary"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2"
            isLoading={isLoading}
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Filters */}
      <EpidemiologyFilters
        selectedDiseaseType={selectedDiseaseType}
        selectedDateRange={selectedDateRange}
        onDiseaseTypeChange={setSelectedDiseaseType}
        onDateRangeChange={setSelectedDateRange}
      />

      {/* Statistics Cards */}
      {statsData?.statistics && statsData.statistics.length > 0 && (
        <StatisticsCards statistics={statsData.statistics} />
      )}

      {/* Disease Trends Chart */}
      {trendsData?.trends && (
        <DiseaseTrendsChart
          trends={trendsData.trends}
          selectedDiseaseType={selectedDiseaseType !== 'all' ? selectedDiseaseType : undefined}
        />
      )}

      {/* Recent Cases Table */}
      {recentCases && (
        <RecentCasesTable cases={recentCases} isLoading={casesLoading} />
      )}

      {/* Add Case Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Thêm ca bệnh</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Ngày ghi nhận</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Loại bệnh</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as DiseaseType)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  {Object.entries(DISEASE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Số ca</label>
                <input
                  type="number"
                  min={0}
                  value={formCount}
                  onChange={(e) => setFormCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Địa điểm</label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" onClick={() => setShowAdd(false)}>Huỷ</Button>
              <Button variant="primary" onClick={handleAddCase}>Lưu</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
