import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { ReportKind } from './ReportTypePicker';

export interface ReportFilterState {
  startDate: string;
  endDate: string;
  diseaseType: string;
  region: string;
  category: string;
}

interface Props {
  kind: ReportKind;
  state: ReportFilterState;
  onChange: (state: ReportFilterState) => void;
  diseases: { key: string; label: string }[];
  regions: string[];
  categories: { key: string; label: string }[];
}

export default function ReportFilterPanel({
  kind,
  state,
  onChange,
  diseases,
  regions,
  categories,
}: Props) {
  const update = (patch: Partial<ReportFilterState>) =>
    onChange({ ...state, ...patch });

  const showDisease = ['epidemic', 'forecast', 'accuracy'].includes(kind);
  const showRegion = ['epidemic', 'forecast'].includes(kind);
  const showCategory = ['inventory', 'shortage', 'procurement'].includes(kind);

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5">
      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
        Bộ lọc báo cáo
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Từ ngày">
          <input
            type="date"
            value={state.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className="w-full h-10 px-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </Field>
        <Field label="Đến ngày">
          <input
            type="date"
            value={state.endDate}
            onChange={(e) => update({ endDate: e.target.value })}
            className="w-full h-10 px-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </Field>

        {showDisease && (
          <Field label="Bệnh dịch">
            <SelectInput
              value={state.diseaseType}
              onChange={(v) => update({ diseaseType: v })}
            >
              <option value="all">Tất cả bệnh</option>
              {diseases.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {showRegion && (
          <Field label="Khu vực">
            <SelectInput
              value={state.region}
              onChange={(v) => update({ region: v })}
            >
              <option value="all">Toàn thành phố</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {showCategory && (
          <Field label="Nhóm vật tư">
            <SelectInput
              value={state.category}
              onChange={(v) => update({ category: v })}
            >
              <option value="all">Tất cả nhóm</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-500 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'appearance-none w-full h-10 pl-3 pr-9 rounded-lg border border-neutral-300 bg-white',
          'text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500',
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
    </div>
  );
}
