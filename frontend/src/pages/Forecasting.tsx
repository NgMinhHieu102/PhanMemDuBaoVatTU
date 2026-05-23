import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  CloudRain, Thermometer,
  TrendingUp, Package, BarChart3, Database,
  Play, Loader2, CheckCircle, XCircle, Brain,
  FileSpreadsheet, ArrowDown, AlertTriangle, ShoppingCart
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { forecastV2Service } from '../services/forecastV2Service';
import type { 
  WeatherInput, ForecastResult, SupplyDemandItem, 
  CorrelationResult, SeasonalResult, TrainResult,
  SuggestionItem
} from '../services/forecastV2Service';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

export default function Forecasting() {
  const queryClient = useQueryClient();
  const { setPageTitle } = useUIStore();
  
  // Step statuses
  const [step1Status, setStep1Status] = useState<StepStatus>('pending');
  const [step2Status, setStep2Status] = useState<StepStatus>('pending');
  const [step3Status, setStep3Status] = useState<StepStatus>('pending');
  const [step4Status, setStep4Status] = useState<StepStatus>('pending');
  const [step5Status, setStep5Status] = useState<StepStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  
  // Step 1 results: Import CSV
  const [trainResult, setTrainResult] = useState<TrainResult | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{filename: string; size_mb: number}>>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Step 2 results: AI Training (ratios)
  const [topRatios, setTopRatios] = useState<any[]>([]);
  
  // Step 3: Weather
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2);
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [forecastPeriod, setForecastPeriod] = useState<'tomorrow' | '7days' | 'month'>('month');
  const [prevWeather, setPrevWeather] = useState<WeatherInput>({ temp: 30, humidity: 78, rainfall: 180, aqi: 95 });
  const [forecastWeather, setForecastWeather] = useState<WeatherInput>({ temp: 31, humidity: 82, rainfall: 250, aqi: 100 });
  const [correlation, setCorrelation] = useState<CorrelationResult | null>(null);
  const [seasonal, setSeasonal] = useState<SeasonalResult | null>(null);
  
  // Step 4 results: Forecast
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [supplyDemand, setSupplyDemand] = useState<SupplyDemandItem[]>([]);
  
  // Step 5: Inventory comparison & suggestions
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [inventorySummary, setInventorySummary] = useState<any>(null);
  const [inventoryUploaded, setInventoryUploaded] = useState(false);
  const [inventoryItemCount, setInventoryItemCount] = useState(0);

  useEffect(() => {
    setPageTitle('Dự báo Nhu cầu Vật tư');
    loadUploadedFiles();
  }, [setPageTitle]);

  const loadUploadedFiles = async () => {
    try {
      const result = await forecastV2Service.listUploadedFiles();
      setUploadedFiles(result.files);
      // Auto-select all files
      setSelectedFiles(result.files.map(f => f.filename));
    } catch { /* ignore */ }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    setError(null);
    try {
      await forecastV2Service.uploadCSV(file as any);
      await loadUploadedFiles();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset input
    }
  };

  // ─── STEP 1: Import CSV & Extract Data ─────────────────────────────────
  const runStep1 = async () => {
    setStep1Status('running');
    setError(null);
    try {
      // Pass selected files (full paths) to train
      const filePaths = selectedFiles.length > 0 ? selectedFiles : undefined;
      const result = await forecastV2Service.train(filePaths);
      setTrainResult(result);
      setStep1Status('done');
      // Auto-load ratios for step 2
      runStep2();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi import CSV');
      setStep1Status('error');
    }
  };

  // ─── STEP 2: AI Learning (show patterns) ───────────────────────────────
  const runStep2 = async () => {
    setStep2Status('running');
    try {
      const ratios = await forecastV2Service.getRatios('Bệnh lý hô hấp', 10);
      setTopRatios(ratios.ratios);
      setStep2Status('done');
      // Auto-load weather for step 3
      loadWeather();
    } catch (err: any) {
      setStep2Status('error');
    }
  };

  // ─── STEP 3: Weather + Correlation ─────────────────────────────────────
  const loadWeather = async () => {
    try {
      const result = await forecastV2Service.getWeatherForecast(targetMonth, targetYear);
      setPrevWeather(result.prev_month_weather);
      setForecastWeather(result.forecast_weather);
    } catch { /* use defaults */ }
  };

  const runStep3 = async () => {
    setStep3Status('running');
    setError(null);
    try {
      const corrResult = await forecastV2Service.getCorrelation('total_cases');
      setCorrelation(corrResult.correlation_analysis);
      setSeasonal(corrResult.seasonal_analysis);
      setStep3Status('done');
    } catch (err: any) {
      setError(err.message || 'Lỗi phân tích tương quan');
      setStep3Status('error');
    }
  };

  // ─── STEP 4: Forecast ──────────────────────────────────────────────────
  const runStep4 = async () => {
    setStep4Status('running');
    setError(null);
    try {
      const result = await forecastV2Service.predict({
        prev_month_weather: prevWeather,
        forecast_weather: forecastWeather,
        target_month: targetMonth,
        target_year: targetYear,
        forecast_period: forecastPeriod,
      });
      setForecast(result.forecast);
      setSupplyDemand(result.supply_demand);
      setStep4Status('done');
    } catch (err: any) {
      setError(err.message || 'Lỗi dự báo');
      setStep4Status('error');
    }
  };

  // ─── STEP 5: Compare with inventory & suggest ──────────────────────────
  const runStep5 = async () => {
    setStep5Status('running');
    setError(null);
    try {
      // Lấy tồn kho hiện tại từ uploaded CSV hoặc database
      let inventoryResponse: Record<string, number> = {};
      if (!inventoryUploaded) {
        inventoryResponse = await forecastV2Service.getInventoryForComparison();
      }
      // If uploaded, backend already has it stored; pass empty to use uploaded data
      
      const result = await forecastV2Service.runFullPipeline({
        prev_month_weather: prevWeather,
        forecast_weather: forecastWeather,
        target_month: targetMonth,
        target_year: targetYear,
        current_inventory: inventoryResponse,
        top_n_supplies: 20,
      });
      
      if (result.result.inventory_comparison) {
        setSuggestions(result.result.inventory_comparison.suggestions);
        setInventorySummary(result.result.inventory_comparison.summary);
      }
      setStep5Status('done');
    } catch (err: any) {
      setError(err.message || 'Lỗi so sánh tồn kho');
      setStep5Status('error');
    }
  };

  const handleInventoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await forecastV2Service.uploadInventoryCSV(file as any);
      setInventoryUploaded(true);
      setInventoryItemCount(result.items_count);
    } catch (err: any) {
      setError(err.message || 'Upload tồn kho thất bại');
    }
    e.target.value = '';
  };

  const importSuggestionsToInventory = async () => {
    if (suggestions.length === 0) return;
    setError(null);
    try {
      const items = suggestions
        .filter(s => (s.order_quantity || 0) > 0)
        .map(s => ({
          drug_name: s.DrugName || '',
          quantity: s.order_quantity || 0,
          unit: s.UnitOfMeasure || '',
        }));
      
      if (items.length === 0) {
        setError('Không có vật tư nào cần nhập');
        return;
      }
      
      const res: any = await forecastV2Service.importToInventory(items);
      // Đồng bộ state với trang Cảnh báo và Tồn kho
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      const resolved = res?.alerts_resolved ?? 0;
      alert(
        `✅ Đã nhập ${items.length} vật tư vào tồn kho` +
        (resolved ? ` và xử lý ${resolved} cảnh báo!` : '!'),
      );
    } catch (err: any) {
      setError(err.message || 'Nhập vào tồn kho thất bại');
    }
  };

  const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

  const diseaseLabels: Record<string, string> = {
    respiratory_disease: 'Bệnh hô hấp',
    viral_infection: 'Nhiễm virus',
    seasonal_flu: 'Cúm mùa',
    dengue_fever: 'Sốt xuất huyết',
  };

  const factorLabels: Record<string, string> = {
    temp: 'Nhiệt độ', humidity: 'Độ ẩm', rainfall: 'Lượng mưa', aqi: 'AQI'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-2">🔮 Dự báo Nhu cầu Vật tư Y tế</h1>
        <p className="text-sm text-gray-600 mb-3">
          Đây là điểm bắt đầu của hệ thống. Hoàn tất 5 bước để dữ liệu lan toả qua Dịch tễ học, Tồn kho, Cảnh báo và Báo cáo.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">1. Import CSV</span>
          <span className="text-gray-300">→</span>
          <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded">2. AI học pattern</span>
          <span className="text-gray-300">→</span>
          <span className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded">3. Thời tiết</span>
          <span className="text-gray-300">→</span>
          <span className="px-2 py-1 bg-green-50 text-green-700 rounded">4. Dự báo ca + nhu cầu</span>
          <span className="text-gray-300">→</span>
          <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded">5. So sánh tồn kho</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* STEP 1: Import CSV */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <StepBadge step={1} status={step1Status} />
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Import CSV & Trích xuất dữ liệu
          </h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer">
              {isUploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang upload...</>
              ) : (
                <><FileSpreadsheet className="w-4 h-4" /> Upload CSV</>
              )}
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
            </label>
            <button
              onClick={runStep1}
              disabled={step1Status === 'running'}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {step1Status === 'running' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang xử lý...</>
              ) : (
                <><Database className="w-4 h-4" /> Train Model</>
              )}
            </button>
          </div>
        </div>
        
        <p className="text-sm text-gray-500 mb-3">
          Upload file CSV dữ liệu bệnh viện (mỗi ngày upload file mới), sau đó bấm "Train Model" để AI học từ dữ liệu.
        </p>

        {/* Uploaded files list with checkboxes */}
        {uploadedFiles.length > 0 && (
          <div className="mb-3 bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Chọn file CSV để train ({selectedFiles.length}/{uploadedFiles.length} đã chọn):</p>
            <div className="space-y-1">
              {uploadedFiles.map((f, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer hover:bg-white rounded px-2 py-1">
                  <input 
                    type="checkbox" 
                    checked={selectedFiles.includes(f.filename)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFiles([...selectedFiles, f.filename]);
                      } else {
                        setSelectedFiles(selectedFiles.filter(s => s !== f.filename));
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <FileSpreadsheet className="w-3 h-3 text-green-600" />
                  <span className="text-xs text-gray-700">{f.filename}</span>
                  <span className="text-xs text-gray-400">({f.size_mb} MB)</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step1Status === 'done' && trainResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-800 font-medium text-sm">
              <CheckCircle className="w-4 h-4" /> Import thành công
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
              <div className="bg-white rounded p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{trainResult.data_summary.files_loaded}</p>
                <p className="text-xs text-gray-500">Files CSV</p>
              </div>
              <div className="bg-white rounded p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{(trainResult.data_summary.total_records / 1000).toFixed(0)}K</p>
                <p className="text-xs text-gray-500">Bản ghi</p>
              </div>
              <div className="bg-white rounded p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{trainResult.data_summary.months_available}</p>
                <p className="text-xs text-gray-500">Tháng dữ liệu</p>
              </div>
              <div className="bg-white rounded p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{trainResult.data_summary.disease_groups.length}</p>
                <p className="text-xs text-gray-500">Nhóm bệnh</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Khoảng thời gian: {trainResult.data_summary.date_range.from} → {trainResult.data_summary.date_range.to}
            </p>
          </div>
        )}
      </div>

      {step1Status === 'done' && <ArrowDown className="w-6 h-6 text-gray-300 mx-auto" />}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* STEP 2: AI Learning */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {step1Status === 'done' && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <StepBadge step={2} status={step2Status} />
            <Brain className="w-5 h-5 text-purple-600" />
            AI học từ dữ liệu — Pattern & Conversion Ratio
          </h2>
          
          <p className="text-sm text-gray-500 mb-3">
            AI phân tích: mỗi ca bệnh nhóm X trung bình dùng bao nhiêu vật tư Y (tính từ dữ liệu thực).
          </p>

          {step2Status === 'done' && topRatios.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Top 10 vật tư/thuốc cho Bệnh hô hấp (ratio/ca bệnh):</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-3 py-2">#</th>
                      <th className="text-left px-3 py-2">Tên thuốc/vật tư</th>
                      <th className="text-right px-3 py-2">Ratio/ca</th>
                      <th className="text-center px-3 py-2">ĐVT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRatios.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2 max-w-xs truncate">{r.DrugName?.substring(0, 60)}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium">{r.ratio_per_case?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{r.UnitOfMeasure}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Training metrics */}
              {trainResult?.training_metrics && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Độ chính xác model:</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(trainResult.training_metrics).map(([disease, m]: [string, any]) => {
                      if (!m || 'error' in m) return null;
                      return (
                        <div key={disease} className="bg-purple-50 rounded p-3">
                          <p className="text-xs text-purple-700 font-medium">{diseaseLabels[disease] || disease}</p>
                          <p className="text-lg font-bold text-purple-900">R² = {m.r2?.toFixed(3)}</p>
                          <p className="text-xs text-purple-600">MAE: {m.mae?.toFixed(1)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step2Status === 'done' && <ArrowDown className="w-6 h-6 text-gray-300 mx-auto" />}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* STEP 3: Weather + Correlation */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {step2Status === 'done' && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <StepBadge step={3} status={step3Status} />
              <CloudRain className="w-5 h-5 text-cyan-600" />
              Kết hợp thời tiết & Phân tích tương quan
            </h2>
            <button
              onClick={runStep3}
              disabled={step3Status === 'running'}
              className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
            >
              {step3Status === 'running' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang phân tích...</>
              ) : (
                <><BarChart3 className="w-4 h-4" /> Phân tích tương quan</>
              )}
            </button>
          </div>

          {/* Weather inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tháng dự báo</label>
              <select value={targetMonth} onChange={(e) => setTargetMonth(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{monthNames[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Năm</label>
              <input type="number" value={targetYear} onChange={(e) => setTargetYear(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1">
                <Thermometer className="w-4 h-4" /> Thời tiết tháng trước
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <InputField label="Nhiệt độ (°C)" value={prevWeather.temp} onChange={(v) => setPrevWeather({...prevWeather, temp: v})} />
                <InputField label="Độ ẩm (%)" value={prevWeather.humidity} onChange={(v) => setPrevWeather({...prevWeather, humidity: v})} />
                <InputField label="Mưa (mm)" value={prevWeather.rainfall} onChange={(v) => setPrevWeather({...prevWeather, rainfall: v})} />
                <InputField label="AQI" value={prevWeather.aqi} onChange={(v) => setPrevWeather({...prevWeather, aqi: v})} />
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-orange-900 mb-2 flex items-center gap-1">
                <CloudRain className="w-4 h-4" /> Dự báo thời tiết {monthNames[targetMonth]}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <InputField label="Nhiệt độ (°C)" value={forecastWeather.temp} onChange={(v) => setForecastWeather({...forecastWeather, temp: v})} />
                <InputField label="Độ ẩm (%)" value={forecastWeather.humidity} onChange={(v) => setForecastWeather({...forecastWeather, humidity: v})} />
                <InputField label="Mưa (mm)" value={forecastWeather.rainfall} onChange={(v) => setForecastWeather({...forecastWeather, rainfall: v})} />
                <InputField label="AQI" value={forecastWeather.aqi} onChange={(v) => setForecastWeather({...forecastWeather, aqi: v})} />
              </div>
            </div>
          </div>

          {/* Correlation results */}
          {step3Status === 'done' && correlation && (
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Kết quả phân tích tương quan:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(correlation.correlations.pearson).map(([factor, data]) => (
                  <div key={factor} className="bg-gray-50 rounded p-3 text-center">
                    <p className="text-xs text-gray-500">{factorLabels[factor]}</p>
                    <p className={`text-xl font-bold ${data.coefficient > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {data.coefficient > 0 ? '+' : ''}{data.coefficient.toFixed(3)}
                    </p>
                    <p className="text-xs text-gray-400">{data.strength}</p>
                  </div>
                ))}
              </div>
              {correlation.strongest_factor?.factor && (
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-sm text-purple-800">
                    <strong>Kết luận:</strong> {correlation.strongest_factor.interpretation}
                  </p>
                </div>
              )}
              {seasonal && (
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-sm text-green-800">{seasonal.summary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step3Status === 'done' && <ArrowDown className="w-6 h-6 text-gray-300 mx-auto" />}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* STEP 4: Forecast */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {step3Status === 'done' && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <StepBadge step={4} status={step4Status} />
              <TrendingUp className="w-5 h-5 text-green-600" />
              Dự báo số ca bệnh + Nhu cầu vật tư
            </h2>
            <button
              onClick={runStep4}
              disabled={step4Status === 'running'}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {step4Status === 'running' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang dự báo...</>
              ) : (
                <><Play className="w-4 h-4" /> Chạy dự báo</>
              )}
            </button>
          </div>

          {/* Forecast period selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Khoảng thời gian dự báo:</label>
            <div className="flex gap-2">
              {[
                { value: 'tomorrow' as const, label: 'Ngày mai', desc: '1 ngày' },
                { value: '7days' as const, label: '7 ngày tới', desc: '1 tuần' },
                { value: 'month' as const, label: 'Tháng tới', desc: '30 ngày' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForecastPeriod(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    forecastPeriod === opt.value
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                  <span className="block text-xs opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {step4Status === 'done' && forecast && (
            <div className="space-y-6">
              {/* Forecast formula explanation */}
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium mb-1">Công thức dự báo:</p>
                <p className="text-xs text-blue-700 font-mono">
                  Số ca dự báo = Ca nền cùng kỳ × Hệ số thời tiết × Hệ số xu hướng gần đây
                </p>
              </div>

              {/* Forecast cases */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Số ca bệnh dự báo {forecast.period_label || monthNames[forecast.target_month]} {forecast.target_year}:
                </h3>
                <div className="bg-gradient-to-r from-blue-500 to-blue-700 rounded-lg p-5 text-white mb-4">
                  <p className="text-sm opacity-80">Tổng số ca bệnh dự báo ({forecast.period_label || 'tháng tới'})</p>
                  <p className="text-4xl font-bold">{forecast.total_predicted_cases.toLocaleString()} ca</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(forecast.predictions).map(([disease, pred]) => {
                    if (!pred || typeof pred !== 'object' || !('predicted_cases' in pred)) return null;
                    const details = (pred as any).formula_details;
                    return (
                      <div key={disease} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{diseaseLabels[disease] || disease}</p>
                        <p className="text-2xl font-bold text-gray-900">{pred.predicted_cases} ca</p>
                        <p className="text-xs text-gray-400">CI: {pred.confidence_lower}-{pred.confidence_upper}</p>
                        {details && (
                          <p className="text-xs text-blue-600 mt-1 font-mono">
                            = {details.baseline?.toFixed(0)} × {details.weather_factor?.toFixed(2)} × {details.trend_factor?.toFixed(2)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Supply demand with severity breakdown */}
              {supplyDemand.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-orange-600" />
                    Nhu cầu vật tư/thuốc (phân theo mức độ bệnh × hệ số dự phòng 1.2):
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Tỷ lệ: Nhẹ 65% (×0.7) | Trung bình 25% (×1.0) | Nặng 10% (×2.0)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left px-3 py-2">#</th>
                          <th className="text-left px-3 py-2">Tên thuốc / Vật tư</th>
                          <th className="text-right px-3 py-2">Nhu cầu</th>
                          <th className="text-right px-3 py-2">Có dự phòng</th>
                          <th className="text-center px-3 py-2">ĐVT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplyDemand.slice(0, 20).map((item, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                            <td className="px-3 py-2 max-w-xs truncate" title={item.DrugName}>
                              {item.DrugName.length > 55 ? item.DrugName.substring(0, 55) + '...' : item.DrugName}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{Math.round(item.total_predicted).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-medium text-blue-700">{Math.round(item.total_safety).toLocaleString()}</td>
                            <td className="px-3 py-2 text-center text-gray-600">{item.UnitOfMeasure}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step4Status === 'done' && <ArrowDown className="w-6 h-6 text-gray-300 mx-auto" />}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* STEP 5: Cảnh báo & Đề xuất nhập kho */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {step4Status === 'done' && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <StepBadge step={5} status={step5Status} />
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Cảnh báo & Đề xuất nhập kho
            </h2>
            <button
              onClick={runStep5}
              disabled={step5Status === 'running'}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {step5Status === 'running' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang phân tích...</>
              ) : (
                <><ShoppingCart className="w-4 h-4" /> So sánh tồn kho & Đề xuất</>
              )}
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-3">
            So sánh nhu cầu dự báo với tồn kho hiện tại → Phân loại trạng thái → Đề xuất nhập hàng.
          </p>

          {/* Upload inventory CSV */}
          <div className="flex items-center gap-3 mb-4 bg-gray-50 rounded-lg p-3">
            <label className="flex items-center gap-2 bg-white border text-gray-700 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-100">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              Upload file tồn kho (.csv)
              <input type="file" accept=".csv" onChange={handleInventoryUpload} className="hidden" />
            </label>
            <span className="text-xs text-gray-500">
              {inventoryUploaded ? `✅ Đã upload tồn kho (${inventoryItemCount} vật tư)` : 'Hoặc lấy từ trang Tồn kho nếu đã có dữ liệu'}
            </span>
          </div>

          {step5Status === 'done' && (
            <div className="space-y-4">
              {/* Summary cards */}
              {inventorySummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{inventorySummary.critical || 0}</p>
                    <p className="text-xs text-red-600">Nguy hiểm</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-700">{inventorySummary.low || 0}</p>
                    <p className="text-xs text-yellow-600">Cảnh báo</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-orange-700">{inventorySummary.warning || 0}</p>
                    <p className="text-xs text-orange-600">Cần bổ sung</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{inventorySummary.sufficient || 0}</p>
                    <p className="text-xs text-green-600">An toàn</p>
                  </div>
                </div>
              )}

              {/* Suggestions table */}
              {suggestions.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={importSuggestionsToInventory}
                      className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      <ShoppingCart className="w-4 h-4" /> Nhập đề xuất vào Tồn kho
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-3 py-2">#</th>
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
                      {suggestions.slice(0, 20).map((item, idx) => {
                        const statusColors: Record<string, string> = {
                          'Nguy hiểm': 'bg-red-100 text-red-800',
                          'Cảnh báo': 'bg-yellow-100 text-yellow-800',
                          'An toàn': 'bg-green-100 text-green-800',
                        };
                        const priorityColors: Record<string, string> = {
                          'CAO': 'bg-red-100 text-red-700',
                          'TRUNG BÌNH': 'bg-yellow-100 text-yellow-700',
                          'THẤP': 'bg-gray-100 text-gray-600',
                        };
                        return (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                            <td className="px-3 py-2 max-w-xs truncate" title={item.DrugName}>
                              {item.DrugName?.substring(0, 45)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[item.status] || 'bg-gray-100'}`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">{item.current_stock?.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">{Math.round(item.safety_demand || 0).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-bold text-blue-700">
                              {item.order_quantity > 0 ? item.order_quantity.toLocaleString() : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityColors[item.priority] || ''}`}>
                                {item.priority}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs font-medium">
                              {item.action}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Helper Components ──────────────────────────────────────────────────── */

function StepBadge({ step, status }: { step: number; status: StepStatus }) {
  const colors = {
    pending: 'bg-gray-200 text-gray-600',
    running: 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${colors[status]}`}>
      {status === 'done' ? '✓' : status === 'error' ? '✗' : step}
    </span>
  );
}

function InputField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-600">{label}</label>
      <input type="number" step="0.1" value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border rounded px-2 py-1 text-sm mt-0.5" />
    </div>
  );
}
