import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Filter,
  Download,
  Upload,
  Plus,
  Calendar,
  Stethoscope,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Trash2,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../store/uiStore';
import api from '../services/api';
import { epidemiologyService } from '../services/epidemiologyService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { DISEASE_TYPE_LABELS, type DiseaseType } from '../types/epidemiology';

const PAGE_SIZE = 10;

interface CaseRow {
  id: number;
  recorded_at: string;
  disease_type: DiseaseType | string;
  case_count: number;
  location: string;
  data_source?: string;
  note?: string | null;
  created_by?: string | null;
}

interface ImportError {
  row: number;
  reason: string;
  data?: Record<string, string>;
}

export default function Epidemiology() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { setPageTitle } = useUIStore();

  const [items, setItems] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Filter state
  const [selectedDisease, setSelectedDisease] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Distinct values for dropdowns
  const [diseaseOptions, setDiseaseOptions] = useState<string[]>([]);
  const [regionOptions, setRegionOptions] = useState<string[]>([]);

  // Pagination
  const [page, setPage] = useState(1);

  // Add/edit modal
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CaseRow | null>(null);
  const [formMonth, setFormMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [formDisease, setFormDisease] = useState<string>('dengue_fever');
  const [formRegion, setFormRegion] = useState<string>('Thành phố Hồ Chí Minh');
  const [formCases, setFormCases] = useState<number>(0);
  const [formNote, setFormNote] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Import result modal
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    errors: ImportError[];
    truncated: boolean;
  } | null>(null);

  useEffect(() => {
    setPageTitle('Quản Lý Dữ Liệu Bệnh');
    loadData();
    loadDistinctValues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await epidemiologyService.getDiseaseCases({ limit: 1000 });
      setItems(data as any);
    } catch (err) {
      console.error('Failed to load disease cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDistinctValues = async () => {
    try {
      // Spec 3.2 #5 + Module 9 #4: ưu tiên danh mục từ trang Quản trị,
      // gộp thêm giá trị thực tế trong DB để không bỏ sót khu vực cũ.
      const [adminRes, distinctRes] = await Promise.all([
        api.get('/admin/regions').catch(() => ({ data: [] as any[] })),
        api.get('/disease-cases/distinct-values').catch(() => ({
          data: { disease_types: [], regions: [] },
        })),
      ]);

      // Diseases — cho dropdown filter, vẫn dùng danh sách thực tế từ DB
      setDiseaseOptions(distinctRes.data?.disease_types ?? []);

      // Regions — merge danh mục admin + lịch sử DB
      const adminNames: string[] = (adminRes.data || []).map((r: any) => r.name);
      const historyNames: string[] = distinctRes.data?.regions ?? [];
      const merged = Array.from(new Set([...adminNames, ...historyNames])).filter(Boolean);
      // Sắp "Toàn thành phố" lên đầu nếu có
      merged.sort((a, b) => {
        if (a === 'Toàn thành phố') return -1;
        if (b === 'Toàn thành phố') return 1;
        return a.localeCompare(b, 'vi');
      });
      setRegionOptions(merged);
    } catch {
      /* ignore */
    }
  };

  // Apply filters
  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (selectedDisease !== 'all' && it.disease_type !== selectedDisease) return false;
      if (selectedRegion !== 'all' && it.location !== selectedRegion) return false;
      if (startDate) {
        if (new Date(it.recorded_at) < new Date(startDate)) return false;
      }
      if (endDate) {
        if (new Date(it.recorded_at) > new Date(endDate)) return false;
      }
      return true;
    });
  }, [items, selectedDisease, selectedRegion, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filtered.length]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    window.open(`${api.defaults.baseURL}/disease-cases/template`, '_blank');
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
      setImportResult({
        imported: d.imported ?? 0,
        updated: d.updated ?? 0,
        skipped: d.skipped ?? 0,
        errors: (d.errors ?? []) as ImportError[],
        truncated: !!d.errors_truncated,
      });
      loadData();
      loadDistinctValues();
      queryClient.invalidateQueries({ queryKey: ['disease-cases'] });
    } catch (err: any) {
      alert('Lỗi import: ' + (err.response?.data?.detail || err.message || ''));
    } finally {
      setImporting(false);
    }
  };

  const openAddForm = () => {
    setEditing(null);
    setFormMonth(new Date().toISOString().slice(0, 7));
    setFormDisease('dengue_fever');
    setFormRegion('Thành phố Hồ Chí Minh');
    setFormCases(0);
    setFormNote('');
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (row: CaseRow) => {
    setEditing(row);
    setFormMonth(row.recorded_at.slice(0, 7));
    setFormDisease(row.disease_type);
    setFormRegion(row.location);
    setFormCases(row.case_count);
    setFormNote(row.note ?? '');
    setFormError(null);
    setShowForm(true);
  };

  const submitForm = async () => {
    setFormError(null);
    if (!formMonth) {
      setFormError('Vui lòng chọn tháng/năm');
      return;
    }
    if (!formDisease) {
      setFormError('Vui lòng chọn bệnh');
      return;
    }
    if (!formRegion.trim()) {
      setFormError('Vui lòng nhập khu vực');
      return;
    }
    if (formCases < 0 || !Number.isFinite(formCases)) {
      setFormError('Số ca phải là số nguyên không âm');
      return;
    }
    const isoDate = new Date(`${formMonth}-01`).toISOString();
    try {
      if (editing) {
        // Spec 3.2 #3: dùng endpoint PUT để giữ id + created_at
        await api.put(`/disease-cases/${editing.id}`, {
          recorded_at: isoDate,
          disease_type: formDisease,
          case_count: formCases,
          location: formRegion.trim(),
          note: formNote.trim() || null,
        });
      } else {
        await epidemiologyService.createDiseaseCase({
          recorded_at: isoDate,
          disease_type: formDisease as DiseaseType,
          case_count: formCases,
          location: formRegion.trim(),
          note: formNote.trim() || undefined,
        } as any);
      }
      setShowForm(false);
      loadData();
      queryClient.invalidateQueries({ queryKey: ['disease-cases'] });
    } catch (err: any) {
      // Backend trả 409 khi trùng tháng/bệnh/khu vực
      const detail = err?.response?.data?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message || err.message || 'Có lỗi xảy ra';
      setFormError(message);
    }
  };

  const deleteRow = async (id: number) => {
    if (!window.confirm('Xoá bản ghi này?')) return;
    try {
      await api.delete(`/disease-cases/${id}`);
      loadData();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || ''));
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────

  const diseaseLabel = (d: string) =>
    DISEASE_TYPE_LABELS[d as DiseaseType] || d;

  const formatMonth = (iso: string) => {
    const dt = new Date(iso);
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    return `${m}/${dt.getFullYear()}`;
  };

  const caseColor = (n: number) => {
    if (n >= 100) return 'text-red-600';
    if (n >= 50) return 'text-amber-600';
    return 'text-emerald-600';
  };

  return (
    <div className="space-y-6">
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

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-neutral-900">
            Danh sách số ca bệnh dịch tễ
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Quản lý và theo dõi các ca bệnh truyền nhiễm theo khu vực.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium hover:bg-neutral-50"
          >
            <Download className="w-4 h-4" /> Tải file mẫu
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Đang import…' : 'Import Excel/CSV'}
          </button>
          <button
            onClick={openAddForm}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Thêm mới
          </button>
        </div>
      </div>

      {/* Bộ lọc nâng cao */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-blue-700">Bộ lọc nâng cao</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Date range */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1.5">
              Khoảng thời gian
            </label>
            <div className="flex items-center gap-1 px-3 py-2 border border-neutral-200 rounded-lg">
              <Calendar className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 text-sm outline-none w-full"
              />
              <span className="text-neutral-300">→</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 text-sm outline-none w-full"
              />
            </div>
          </div>

          {/* Disease */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1.5">
              Loại bệnh
            </label>
            <div className="relative">
              <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <select
                value={selectedDisease}
                onChange={(e) => setSelectedDisease(e.target.value)}
                className="w-full pl-9 pr-9 py-2 border border-neutral-200 rounded-lg text-sm appearance-none bg-white"
              >
                <option value="all">Tất cả các bệnh</option>
                {diseaseOptions.map((d) => (
                  <option key={d} value={d}>
                    {diseaseLabel(d)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>

          {/* Region */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1.5">
              Khu vực
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full pl-9 pr-9 py-2 border border-neutral-200 rounded-lg text-sm appearance-none bg-white"
              >
                <option value="all">Tất cả khu vực</option>
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Bảng dữ liệu */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-neutral-500 text-xs">
                  <th className="text-left px-6 py-3 font-medium">Tháng/Năm</th>
                  <th className="text-left px-6 py-3 font-medium">Tên bệnh</th>
                  <th className="text-left px-6 py-3 font-medium">Khu vực</th>
                  <th className="text-right px-6 py-3 font-medium">Số ca mắc</th>
                  <th className="text-right px-6 py-3 font-medium w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-neutral-400">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : (
                  paged.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-neutral-100 hover:bg-neutral-50"
                    >
                      <td className="px-6 py-3 text-neutral-700">
                        {formatMonth(row.recorded_at)}
                      </td>
                      <td className="px-6 py-3 text-neutral-700">
                        {diseaseLabel(row.disease_type)}
                      </td>
                      <td className="px-6 py-3 text-neutral-700">{row.location}</td>
                      <td
                        className={`px-6 py-3 text-right font-bold ${caseColor(
                          row.case_count,
                        )}`}
                      >
                        {row.case_count.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditForm(row)}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                            title="Chỉnh sửa"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteRow(row.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500"
                            title="Xoá"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-t border-neutral-100 text-sm text-neutral-500">
              <span>
                Hiển thị {filtered.length === 0 ? 0 : start + 1}-
                {Math.min(start + PAGE_SIZE, filtered.length)} trong số{' '}
                {filtered.length} kết quả
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 border border-neutral-200 rounded-md disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, idx) => {
                  const pageNum = idx + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 rounded-md text-sm font-medium ${
                        safePage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 border border-neutral-200 rounded-md disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editing ? 'Chỉnh sửa ca bệnh' : 'Thêm ca bệnh mới'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Tháng / Năm <span className="text-red-500">*</span>
                </label>
                <input
                  type="month"
                  value={formMonth}
                  onChange={(e) => setFormMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Tên bệnh <span className="text-red-500">*</span>
                </label>
                <select
                  value={formDisease}
                  onChange={(e) => setFormDisease(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                >
                  {Object.entries(DISEASE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Khu vực <span className="text-red-500">*</span>
                </label>
                <select
                  value={
                    regionOptions.includes(formRegion)
                      ? formRegion
                      : '__custom__'
                  }
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setFormRegion('');
                    } else {
                      setFormRegion(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white"
                >
                  {regionOptions.length === 0 && (
                    <option value="" disabled>
                      Chưa có khu vực — vui lòng thêm ở trang Quản trị
                    </option>
                  )}
                  {regionOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  <option value="__custom__">+ Nhập khu vực mới...</option>
                </select>
                {!regionOptions.includes(formRegion) && (
                  <input
                    type="text"
                    value={formRegion}
                    onChange={(e) => setFormRegion(e.target.value)}
                    className="w-full mt-2 px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                    placeholder="Quận 1, Thành phố Thủ Đức, ..."
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Số ca mắc <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={formCases}
                  onChange={(e) => setFormCases(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Ghi chú
                </label>
                <textarea
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                  placeholder="Thông tin bổ sung (nếu có)"
                />
              </div>
            </div>

            {formError && (
              <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-neutral-200 rounded-lg text-sm hover:bg-neutral-50"
              >
                Huỷ
              </button>
              <button
                onClick={submitForm}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import result modal */}
      {importResult && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Kết quả import</h3>
              <button
                onClick={() => setImportResult(null)}
                className="p-1 rounded hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-[11px] uppercase font-semibold text-emerald-700">Thêm mới</p>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums">
                  {importResult.imported.toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-[11px] uppercase font-semibold text-blue-700">Cập nhật</p>
                <p className="text-2xl font-extrabold text-blue-700 mt-1 tabular-nums">
                  {importResult.updated.toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-[11px] uppercase font-semibold text-amber-700">Bỏ qua</p>
                <p className="text-2xl font-extrabold text-amber-700 mt-1 tabular-nums">
                  {importResult.skipped.toLocaleString('vi-VN')}
                </p>
              </div>
            </div>

            {importResult.errors.length > 0 ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                <p className="text-sm font-medium text-neutral-700 mb-2">
                  Các dòng cần sửa ({importResult.errors.length}
                  {importResult.truncated && '+'} dòng):
                </p>
                <div className="overflow-y-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 sticky top-0">
                      <tr className="text-neutral-500 text-xs">
                        <th className="text-left px-3 py-2 font-medium">Dòng</th>
                        <th className="text-left px-3 py-2 font-medium">Lý do</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.errors.map((e, idx) => (
                        <tr key={idx} className="border-t border-neutral-100">
                          <td className="px-3 py-2 text-neutral-700 font-medium">{e.row}</td>
                          <td className="px-3 py-2 text-neutral-600">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importResult.truncated && (
                  <p className="text-xs text-neutral-500 mt-2">
                    * Chỉ hiển thị 200 dòng lỗi đầu tiên — vui lòng kiểm tra file gốc.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                ✓ Tất cả các dòng đã được xử lý thành công, không có dòng lỗi.
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setImportResult(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
