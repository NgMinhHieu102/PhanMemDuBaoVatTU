import { Target, TrendingDown, Percent } from 'lucide-react';
import { MetricCard } from '../common/Card';

interface ModelAccuracyCardsProps {
  mae: number;
  rmse: number;
  mape: number;
}

export default function ModelAccuracyCards({ mae, rmse, mape }: ModelAccuracyCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <MetricCard
        title="MAE (Mean Absolute Error)"
        value={mae.toFixed(2)}
        subtitle="Sai số tuyệt đối trung bình"
        icon={<Target size={24} />}
        color="primary"
      />
      <MetricCard
        title="RMSE (Root Mean Square Error)"
        value={rmse.toFixed(2)}
        subtitle="Căn bậc hai sai số bình phương"
        icon={<TrendingDown size={24} />}
        color="warning"
      />
      <MetricCard
        title="MAPE (Mean Absolute % Error)"
        value={`${mape.toFixed(2)}%`}
        subtitle="Sai số phần trăm tuyệt đối"
        icon={<Percent size={24} />}
        color="success"
      />
    </div>
  );
}
