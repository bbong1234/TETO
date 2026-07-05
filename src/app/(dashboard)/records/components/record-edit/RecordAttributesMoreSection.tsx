'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  OUTCOME_DIRECTION_LABELS,
  OUTCOME_TYPE_LABELS,
  PLACE_TYPE_LABELS,
} from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { CompactInput } from './CompactInput';
import { Activity, BarChart3, Target } from 'lucide-react';

interface RecordAttributesMoreSectionProps {
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

function countFilled(form: RecordEditFormState): number {
  let n = 0;
  if (form.actionText.trim()) n++;
  if (form.eventText.trim()) n++;
  if (form.objectText.trim()) n++;
  if (form.metricName.trim() || form.metricValue.trim()) n++;
  if (form.placeType) n++;
  if (form.timeText.trim() || form.timePrecision) n++;
  if (form.outcomeType || form.outcomeDirection) n++;
  if (form.relationRolesStr.trim()) n++;
  if (form.relatedObjectsStr.trim()) n++;
  return n;
}

export default function RecordAttributesMoreSection({ form, onPatch }: RecordAttributesMoreSectionProps) {
  const [open, setOpen] = useState(false);
  const filled = useMemo(() => countFilled(form), [form]);

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-600"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        更多
        {filled > 0 && <span className="text-slate-300">(已填 {filled} 项)</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <CompactInput icon={<Activity className="h-3 w-3" />} label="动作" value={form.actionText} onChange={(v) => onPatch({ actionText: v })} />
            <CompactInput icon={<Activity className="h-3 w-3" />} label="情境" value={form.eventText} onChange={(v) => onPatch({ eventText: v })} />
            <CompactInput icon={<Target className="h-3 w-3" />} label="对象" value={form.objectText} onChange={(v) => onPatch({ objectText: v })} />
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <BarChart3 className="h-3 w-3 text-slate-400" />
            <input type="text" value={form.metricName} onChange={(e) => onPatch({ metricName: e.target.value })} placeholder="指标名" className="w-16 text-xs focus:outline-none" />
            <input type="number" value={form.metricValue} onChange={(e) => onPatch({ metricValue: e.target.value })} placeholder="值" className="w-12 text-xs focus:outline-none" />
            <input type="text" value={form.metricUnit} onChange={(e) => onPatch({ metricUnit: e.target.value })} placeholder="单位" className="w-12 text-xs focus:outline-none" />
          </div>
          <select
            value={form.placeType}
            onChange={(e) => onPatch({ placeType: e.target.value })}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="">地点类型</option>
            {Object.entries(PLACE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <CompactInput label="模糊时间" value={form.timeText} onChange={(v) => onPatch({ timeText: v })} />
          <select value={form.timePrecision} onChange={(e) => onPatch({ timePrecision: e.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-xs">
            <option value="">时间精度</option>
            <option value="exact">精确</option>
            <option value="approx">大约</option>
            <option value="fuzzy">模糊</option>
            <option value="unknown">未知</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.outcomeType} onChange={(e) => onPatch({ outcomeType: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs">
              <option value="">结果类型</option>
              {Object.entries(OUTCOME_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="flex gap-1">
              {(['positive', 'neutral', 'negative'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onPatch({ outcomeDirection: form.outcomeDirection === d ? '' : d })}
                  className={`rounded px-1.5 py-0.5 text-[9px] ${form.outcomeDirection === d ? 'bg-blue-500 text-white' : 'bg-slate-100'}`}
                >
                  {OUTCOME_DIRECTION_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <CompactInput label="关系角色" value={form.relationRolesStr} onChange={(v) => onPatch({ relationRolesStr: v })} />
          <CompactInput label="关联对象" value={form.relatedObjectsStr} onChange={(v) => onPatch({ relatedObjectsStr: v })} />
        </div>
      )}
    </div>
  );
}
