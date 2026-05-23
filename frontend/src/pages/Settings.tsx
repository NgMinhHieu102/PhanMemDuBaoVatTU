import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Settings as SettingsIcon, RefreshCw, Shield, AlertTriangle } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { ROUTES } from '../utils/constants';
import {
  useConfigs,
  useUpdateConfig,
  useConversionRatios,
  useUpdateConversionRatios,
  useThresholds,
  useUpdateThresholds,
  useAuditLogs,
} from '../hooks/useConfig';
import Card, { CardHeader } from '../components/common/Card';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { ConfigSection } from '../types/config';
import { CONFIG_SECTION_LABELS, DISEASE_TYPE_OPTIONS } from '../types/config';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const thresholdsSchema = z.object({
  thresholds: z.array(
    z.object({
      supply_id: z.number(),
      supply_name: z.string().optional(),
      critical_days: z.number().min(1, 'Phải ≥ 1').max(30, 'Phải ≤ 30'),
      high_days: z.number().min(1, 'Phải ≥ 1').max(60, 'Phải ≤ 60'),
      medium_days: z.number().min(1, 'Phải ≥ 1').max(90, 'Phải ≤ 90'),
    }).refine((v) => v.critical_days < v.high_days, {
      message: 'Ngưỡng nghiêm trọng phải nhỏ hơn ngưỡng cao',
      path: ['critical_days'],
    }).refine((v) => v.high_days < v.medium_days, {
      message: 'Ngưỡng cao phải nhỏ hơn ngưỡng trung bình',
      path: ['high_days'],
    })
  ),
});

const conversionRatiosSchema = z.object({
  ratios: z.array(
    z.object({
      disease_type: z.string().min(1, 'Bắt buộc'),
      supply_id: z.number(),
      supply_name: z.string().optional(),
      ratio: z.number().min(0.001, 'Phải > 0').max(1000, 'Phải ≤ 1000'),
      unit: z.string().optional(),
    })
  ),
});

const generalConfigSchema = z.object({
  configs: z.array(
    z.object({
      config_key: z.string(),
      config_value: z.string().min(1, 'Không được để trống'),
      description: z.string().nullable().optional(),
    })
  ),
});

type ThresholdsForm = z.infer<typeof thresholdsSchema>;
type ConversionRatiosForm = z.infer<typeof conversionRatiosSchema>;
type GeneralConfigForm = z.infer<typeof generalConfigSchema>;

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: ConfigSection; label: string }[] = [
  { id: 'thresholds', label: CONFIG_SECTION_LABELS['thresholds'] },
  { id: 'conversion-ratios', label: CONFIG_SECTION_LABELS['conversion-ratios'] },
  { id: 'lead-times', label: CONFIG_SECTION_LABELS['lead-times'] },
  { id: 'unit-prices', label: CONFIG_SECTION_LABELS['unit-prices'] },
  { id: 'history', label: CONFIG_SECTION_LABELS['history'] },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Inline form field with label */
function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-600">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-neutral-400">{hint}</p>}
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  );
}

/** Number input styled consistently */
function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-neutral-50 disabled:text-neutral-400"
      {...props}
    />
  );
}

/** Text input styled consistently */
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-neutral-50 disabled:text-neutral-400"
      {...props}
    />
  );
}

/** Success / error toast banner */
function SaveStatus({ status }: { status: 'idle' | 'saving' | 'success' | 'error' }) {
  if (status === 'idle') return null;
  if (status === 'saving')
    return (
      <div className="flex items-center gap-2 text-sm text-primary-700 bg-primary-50 border border-primary-200 rounded-lg px-4 py-2">
        <LoadingSpinner size="sm" />
        Đang lưu...
      </div>
    );
  if (status === 'success')
    return (
      <div className="text-sm text-success-700 bg-success-50 border border-success-200 rounded-lg px-4 py-2">
        ✓ Lưu thành công
      </div>
    );
  return (
    <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-2">
      ✗ Lưu thất bại — vui lòng thử lại
    </div>
  );
}

// ─── Thresholds Section ───────────────────────────────────────────────────────

function ThresholdsSection() {
  const { data: thresholds, isLoading } = useThresholds();
  const updateMutation = useUpdateThresholds();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ThresholdsForm>({
    resolver: zodResolver(thresholdsSchema),
    defaultValues: { thresholds: [] },
  });

  useEffect(() => {
    if (thresholds) {
      reset({ thresholds });
    }
  }, [thresholds, reset]);

  const onSubmit = async (values: ThresholdsForm) => {
    setSaveStatus('saving');
    try {
      await updateMutation.mutateAsync({
        thresholds: values.thresholds.map(({ supply_id, critical_days, high_days, medium_days }) => ({
          supply_id,
          critical_days,
          high_days,
          medium_days,
        })),
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center h-48">
          <LoadingSpinner size="lg" label="Đang tải ngưỡng cảnh báo..." />
        </div>
      </Card>
    );
  }

  if (!thresholds || thresholds.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Ngưỡng cảnh báo thiếu hụt"
          subtitle="Cấu hình số ngày tồn kho tương ứng với từng mức độ cảnh báo"
        />
        <p className="text-sm text-neutral-400 text-center py-8">
          Chưa có dữ liệu ngưỡng cảnh báo. Vui lòng kiểm tra kết nối backend.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Ngưỡng cảnh báo thiếu hụt"
        subtitle="Cấu hình số ngày tồn kho để phân loại mức độ cảnh báo cho từng vật tư"
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-danger-50 text-danger-700 border border-danger-200">
          <span className="w-2 h-2 rounded-full bg-danger-500" />
          Nghiêm trọng: thiếu hụt trong vòng N ngày
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-warning-50 text-warning-700 border border-warning-200">
          <span className="w-2 h-2 rounded-full bg-warning-500" />
          Cao: thiếu hụt trong vòng N ngày
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          Trung bình: thiếu hụt trong vòng N ngày
        </span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Vật tư</th>
                <th className="px-4 py-2.5 text-center font-semibold text-danger-600">Nghiêm trọng (ngày)</th>
                <th className="px-4 py-2.5 text-center font-semibold text-warning-600">Cao (ngày)</th>
                <th className="px-4 py-2.5 text-center font-semibold text-yellow-600">Trung bình (ngày)</th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map((threshold, index) => (
                <tr key={threshold.supply_id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-700">
                    {threshold.supply_name ?? `Supply #${threshold.supply_id}`}
                    <input type="hidden" {...register(`thresholds.${index}.supply_id`)} />
                  </td>
                  <td className="px-4 py-2">
                    <Field label="" error={errors.thresholds?.[index]?.critical_days?.message}>
                      <NumberInput
                        min={1}
                        max={30}
                        {...register(`thresholds.${index}.critical_days`, { valueAsNumber: true })}
                      />
                    </Field>
                  </td>
                  <td className="px-4 py-2">
                    <Field label="" error={errors.thresholds?.[index]?.high_days?.message}>
                      <NumberInput
                        min={1}
                        max={60}
                        {...register(`thresholds.${index}.high_days`, { valueAsNumber: true })}
                      />
                    </Field>
                  </td>
                  <td className="px-4 py-2">
                    <Field label="" error={errors.thresholds?.[index]?.medium_days?.message}>
                      <NumberInput
                        min={1}
                        max={90}
                        {...register(`thresholds.${index}.medium_days`, { valueAsNumber: true })}
                      />
                    </Field>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-2">
          <SaveStatus status={saveStatus} />
          <Button
            type="submit"
            variant="primary"
            disabled={!isDirty}
            isLoading={updateMutation.isPending}
            className="ml-auto"
          >
            Lưu ngưỡng cảnh báo
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─── Conversion Ratios Section ────────────────────────────────────────────────

function ConversionRatiosSection() {
  const { data: ratios, isLoading } = useConversionRatios();
  const updateMutation = useUpdateConversionRatios();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ConversionRatiosForm>({
    resolver: zodResolver(conversionRatiosSchema),
    defaultValues: { ratios: [] },
  });

  const { fields } = useFieldArray({ control, name: 'ratios' });

  useEffect(() => {
    if (ratios) {
      reset({ ratios });
    }
  }, [ratios, reset]);

  const onSubmit = async (values: ConversionRatiosForm) => {
    setSaveStatus('saving');
    try {
      await updateMutation.mutateAsync({
        ratios: values.ratios.map(({ disease_type, supply_id, ratio, unit }) => ({
          disease_type,
          supply_id,
          ratio,
          unit: unit ?? undefined,
        })),
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center h-48">
          <LoadingSpinner size="lg" label="Đang tải tỷ lệ quy đổi..." />
        </div>
      </Card>
    );
  }

  if (!fields || fields.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Tỷ lệ quy đổi ca bệnh → vật tư"
          subtitle="Số đơn vị vật tư cần thiết trên mỗi ca bệnh"
        />
        <p className="text-sm text-neutral-400 text-center py-8">
          Chưa có dữ liệu tỷ lệ quy đổi. Vui lòng kiểm tra kết nối backend.
        </p>
      </Card>
    );
  }

  const diseaseLabel = (type: string) =>
    DISEASE_TYPE_OPTIONS.find((d) => d.value === type)?.label ?? type;

  return (
    <Card>
      <CardHeader
        title="Tỷ lệ quy đổi ca bệnh → vật tư"
        subtitle="Số đơn vị vật tư cần thiết trên mỗi ca bệnh theo loại bệnh"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Loại bệnh</th>
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Vật tư</th>
                <th className="px-4 py-2.5 text-center font-semibold text-neutral-600">Tỷ lệ (đơn vị/ca)</th>
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Đơn vị</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-700">
                    {diseaseLabel(field.disease_type)}
                    <input type="hidden" {...register(`ratios.${index}.disease_type`)} />
                    <input type="hidden" {...register(`ratios.${index}.supply_id`)} />
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-700">
                    {field.supply_name ?? `Supply #${field.supply_id}`}
                  </td>
                  <td className="px-4 py-2 text-center max-w-[120px]">
                    <Field label="" error={errors.ratios?.[index]?.ratio?.message}>
                      <NumberInput
                        step="0.001"
                        min={0.001}
                        max={1000}
                        {...register(`ratios.${index}.ratio`, { valueAsNumber: true })}
                      />
                    </Field>
                  </td>
                  <td className="px-4 py-2 max-w-[120px]">
                    <TextInput
                      placeholder="vd: đôi"
                      {...register(`ratios.${index}.unit`)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-2">
          <SaveStatus status={saveStatus} />
          <Button
            type="submit"
            variant="primary"
            disabled={!isDirty}
            isLoading={updateMutation.isPending}
            className="ml-auto"
          >
            Lưu tỷ lệ quy đổi
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─── General Config Section (Lead Times / Unit Prices) ────────────────────────

/** Filters system configs by a key-prefix pattern */
function GeneralConfigSection({
  title,
  subtitle,
  keyFilter,
}: {
  title: string;
  subtitle: string;
  keyFilter: (key: string) => boolean;
}) {
  const { data: allConfigs, isLoading } = useConfigs();
  const updateMutation = useUpdateConfig();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const filteredConfigs = allConfigs?.filter((c) => keyFilter(c.config_key)) ?? [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<GeneralConfigForm>({
    resolver: zodResolver(generalConfigSchema),
    defaultValues: { configs: [] },
  });

  useEffect(() => {
    if (filteredConfigs.length > 0) {
      reset({ configs: filteredConfigs.map(({ config_key, config_value, description }) => ({ config_key, config_value, description })) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allConfigs]);

  const onSubmit = async (values: GeneralConfigForm) => {
    setSaveStatus('saving');
    try {
      await Promise.all(
        values.configs.map(({ config_key, config_value }) =>
          updateMutation.mutateAsync({ key: config_key, data: { config_value } })
        )
      );
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const formatLabel = (key: string) =>
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center h-48">
          <LoadingSpinner size="lg" label="Đang tải cấu hình..." />
        </div>
      </Card>
    );
  }

  if (filteredConfigs.length === 0) {
    return (
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <p className="text-sm text-neutral-400 text-center py-8">
          Không tìm thấy cấu hình phù hợp. Vui lòng kiểm tra kết nối backend.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredConfigs.map((config, index) => (
            <div key={config.config_key} className="space-y-1">
              <input type="hidden" {...register(`configs.${index}.config_key`)} />
              <Field
                label={formatLabel(config.config_key)}
                error={errors.configs?.[index]?.config_value?.message}
                hint={config.description ?? undefined}
              >
                <TextInput
                  {...register(`configs.${index}.config_value`)}
                  placeholder="Nhập giá trị..."
                />
              </Field>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <SaveStatus status={saveStatus} />
          <Button
            type="submit"
            variant="primary"
            disabled={!isDirty}
            isLoading={updateMutation.isPending}
            className="ml-auto"
          >
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─── Change History Section ───────────────────────────────────────────────────

function ChangeHistorySection() {
  const { data: logs, isLoading, refetch } = useAuditLogs({
    limit: 50,
    table_name: 'system_config',
  });

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const formatValue = (val: Record<string, unknown> | null) => {
    if (!val) return '—';
    const str = JSON.stringify(val);
    return str.length > 60 ? str.slice(0, 57) + '...' : str;
  };

  return (
    <Card>
      <CardHeader
        title="Lịch sử thay đổi cấu hình"
        subtitle="50 thay đổi gần nhất trong bảng system_config và thresholds"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            leftIcon={<RefreshCw size={14} />}
            isLoading={isLoading}
          >
            Làm mới
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <LoadingSpinner size="lg" label="Đang tải lịch sử..." />
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-neutral-400 text-sm">
          Chưa có lịch sử thay đổi cấu hình
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Thời gian</th>
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Người thực hiện</th>
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Hành động</th>
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Bảng</th>
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Giá trị cũ</th>
                <th className="px-4 py-2.5 text-left font-semibold text-neutral-600">Giá trị mới</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-neutral-700">
                    {log.username ?? `User #${log.user_id ?? '?'}`}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500">{log.table_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-neutral-400 font-mono text-xs max-w-[180px] truncate" title={JSON.stringify(log.old_value)}>
                    {formatValue(log.old_value)}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700 font-mono text-xs max-w-[180px] truncate" title={JSON.stringify(log.new_value)}>
                    {formatValue(log.new_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const { setPageTitle } = useUIStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ConfigSection>('thresholds');

  useEffect(() => {
    setPageTitle('Cài đặt');
  }, [setPageTitle]);

  // Admin-only guard
  if (user && user.role !== 'Administrator') {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-neutral-900">Cài đặt Hệ thống</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200">
              <Shield size={10} />
              Chỉ dành cho Admin
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Cấu hình ngưỡng cảnh báo, tỷ lệ quy đổi, thời gian đặt hàng và đơn giá vật tư
          </p>
        </div>
      </div>

      {/* Admin warning banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          Thay đổi cấu hình sẽ ảnh hưởng trực tiếp đến cách hệ thống tính toán cảnh báo và kế hoạch
          nhập hàng. Vui lòng xem xét kỹ trước khi lưu.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[120px] px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'thresholds' && <ThresholdsSection />}

      {activeTab === 'conversion-ratios' && <ConversionRatiosSection />}

      {activeTab === 'lead-times' && (
        <GeneralConfigSection
          title="Thời gian đặt hàng (Lead Times)"
          subtitle="Số ngày từ khi đặt hàng đến khi nhận hàng cho từng loại vật tư"
          keyFilter={(key) => key.includes('lead_time') || key.includes('lead-time')}
        />
      )}

      {activeTab === 'unit-prices' && (
        <GeneralConfigSection
          title="Đơn giá vật tư (Unit Prices)"
          subtitle="Đơn giá tham chiếu dùng để ước tính chi phí kế hoạch nhập hàng"
          keyFilter={(key) => key.includes('unit_price') || key.includes('price')}
        />
      )}

      {activeTab === 'history' && <ChangeHistorySection />}

      {/* Help panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 Hướng dẫn cài đặt</h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>
            • <strong>Ngưỡng cảnh báo</strong>: Đặt số ngày tồn kho tương ứng với mỗi mức độ cảnh
            báo (nghiêm trọng &lt; cao &lt; trung bình)
          </li>
          <li>
            • <strong>Tỷ lệ quy đổi</strong>: Số đơn vị vật tư cần thiết trên mỗi ca bệnh — thay
            đổi sẽ ảnh hưởng đến lần tính toán tiếp theo
          </li>
          <li>
            • <strong>Thời gian đặt hàng</strong>: Dùng để tính thời điểm cần đặt hàng trước khi
            hết hàng
          </li>
          <li>
            • <strong>Đơn giá</strong>: Dùng để ước tính tổng chi phí trong kế hoạch nhập hàng
          </li>
          <li>
            • <strong>Lịch sử thay đổi</strong>: Ghi lại mọi sửa đổi cấu hình với thông tin người
            thực hiện và thời gian
          </li>
        </ul>
      </div>
    </div>
  );
}
