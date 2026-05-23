import { Edit, TrendingUp, AlertCircle } from 'lucide-react';
import Button from '../common/Button';
import StockStatusBadge from './StockStatusBadge';
import type { Inventory } from '../../types/inventory';
import { formatNumber } from '../../utils/formatters';

interface InventoryTableProps {
  inventory: Inventory[];
  onUpdateStock: (item: Inventory) => void;
  isLoading?: boolean;
}

const categoryLabels: Record<string, string> = {
  mask: 'Khẩu trang',
  glove: 'Găng tay',
  test_kit: 'Kit xét nghiệm',
  disinfectant: 'Dung dịch sát khuẩn',
  medicine: 'Thuốc',
  iv_fluid: 'Dịch truyền',
  other: 'Khác',
};

export default function InventoryTable({
  inventory,
  onUpdateStock,
  isLoading = false,
}: InventoryTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Đang tải dữ liệu...</div>
      </div>
    );
  }

  if (inventory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
        <AlertCircle className="w-12 h-12 mb-2" />
        <p className="text-sm">Không có dữ liệu tồn kho</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Tên vật tư
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Danh mục
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Trạng thái
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Tồn kho
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Mức an toàn
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Dự báo nhu cầu
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Thời gian giao
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Mức độ rủi ro
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Thao tác
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {inventory.map((item) => {
            const onHand = item.quantity_on_hand ?? item.current_stock ?? 0;
            const safetyLevel = item.safety_stock_level ?? item.safety_stock ?? 0;
            const stockRatio = safetyLevel > 0 ? onHand / safetyLevel : 1;
            const forecastedDemand = Math.round(onHand * 0.3);
            const stockStatus = item.stock_status || (stockRatio < 0.3 ? 'critical' : stockRatio < 0.7 ? 'low' : 'safe');
            const riskLevel =
              stockStatus === 'critical'
                ? 'Cao'
                : stockStatus === 'low'
                ? 'Trung bình'
                : 'Thấp';
            const riskColor =
              stockStatus === 'critical'
                ? 'text-red-600'
                : stockStatus === 'low'
                ? 'text-yellow-600'
                : 'text-green-600';
            const supplyName = item.supply?.name || item.name || '—';
            const supplyUnit = item.supply?.unit || item.unit || '—';
            const supplyCategory = item.supply?.category || item.category || 'general';
            const leadTimeDays = item.supply?.lead_time_days || item.lead_time_days || 7;

            return (
              <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-neutral-900">{supplyName}</div>
                  <div className="text-xs text-neutral-500">{supplyUnit}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-neutral-700">
                    {categoryLabels[supplyCategory] || supplyCategory}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <StockStatusBadge status={stockStatus as any} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-sm font-semibold text-neutral-900">
                    {formatNumber(onHand)}
                  </div>
                  <div className="text-xs text-neutral-500">{supplyUnit}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-sm text-neutral-700">
                    {formatNumber(safetyLevel)}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {safetyLevel > 0 ? (
                      stockRatio < 1 ? (
                        <span className="text-red-600">
                          {((1 - stockRatio) * 100).toFixed(0)}% thiếu
                        </span>
                      ) : (
                        <span className="text-green-600">
                          {((stockRatio - 1) * 100).toFixed(0)}% dư
                        </span>
                      )
                    ) : '—'}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <TrendingUp className="w-3 h-3 text-blue-500" />
                    <span className="text-sm font-medium text-neutral-900">
                      {formatNumber(forecastedDemand)}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">7 ngày tới</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-sm text-neutral-700">{leadTimeDays} ngày</div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-semibold ${riskColor}`}>{riskLevel}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onUpdateStock(item)}
                    className="inline-flex items-center gap-1"
                  >
                    <Edit className="w-3 h-3" />
                    Cập nhật
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
