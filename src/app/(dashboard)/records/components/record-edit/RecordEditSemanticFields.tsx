'use client';

import {
  Activity,
  BarChart3,
  DollarSign,
  Heart,
  MapPin,
  Smile,
  Target,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { CompactInput } from './CompactInput';

interface RecordEditSemanticFieldsProps {
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordEditSemanticFields({ form, onPatch }: RecordEditSemanticFieldsProps) {
  const patchDuration = (val: string) => {
    onPatch({ durationMinutes: val });
    if (form.occurredAt && val) {
      const dur = parseInt(val, 10);
      if (dur > 0) {
        const parts = form.occurredAt.split(':');
        const startMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        const endMin = startMin + dur;
        if (endMin < 24 * 60) {
          const hh = String(Math.floor(endMin / 60)).padStart(2, '0');
          const mm = String(endMin % 60).padStart(2, '0');
          onPatch({ durationMinutes: val, occurredAtEnd: `${hh}:${mm}` });
          return;
        }
      }
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-semibold text-indigo-500 uppercase tracking-wider">
        语义字段
      </label>

      <CompactInput
        icon={<MapPin className="h-3 w-3" />}
        label="地点"
        value={form.location}
        onChange={(v) => onPatch({ location: v })}
        placeholder="如：公司、家"
      />

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-1 mb-1.5">
          <Target className="h-3 w-3 text-indigo-400" />
          <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">
            事件主干
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <CompactInput icon={<Activity className="h-3 w-3" />} label="动作" value={form.actionText} onChange={(v) => onPatch({ actionText: v })} placeholder="如：开会" />
          <CompactInput icon={<Zap className="h-3 w-3" />} label="情境" value={form.eventText} onChange={(v) => onPatch({ eventText: v })} placeholder="如：会议太长" />
          <CompactInput icon={<Target className="h-3 w-3" />} label="指向对象" value={form.objectText} onChange={(v) => onPatch({ objectText: v })} placeholder="如：会议" />
        </div>
      </div>

      <CompactInput icon={<Activity className="h-3 w-3" />} label="原因" value={form.causeText} onChange={(v) => onPatch({ causeText: v })} placeholder="如：因为昨晚没睡好" />
      <CompactInput icon={<TrendingUp className="h-3 w-3" />} label="结果" value={form.resultText} onChange={(v) => onPatch({ resultText: v })} placeholder="如：迟到了20分钟" />

      <div className="grid grid-cols-4 gap-2">
        <CompactInput icon={<Smile className="h-3 w-3" />} label="心情" value={form.mood} onChange={(v) => onPatch({ mood: v })} placeholder="如：开心" />
        <CompactInput icon={<Zap className="h-3 w-3" />} label="能量" value={form.energy} onChange={(v) => onPatch({ energy: v })} placeholder="如：中" />
        <CompactInput icon={<Activity className="h-3 w-3" />} label="状态" value={form.status} onChange={(v) => onPatch({ status: v })} placeholder="如：专注" />
        <CompactInput icon={<Heart className="h-3 w-3" />} label="身体状态" value={form.bodyState} onChange={(v) => onPatch({ bodyState: v })} placeholder="如：累、困" />
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <CompactInput icon={<DollarSign className="h-3 w-3" />} label="金额" value={form.cost} onChange={(v) => onPatch({ cost: v })} placeholder="0" type="number" />
          <CompactInput icon={<Timer className="h-3 w-3" />} label="时长(分钟)" value={form.durationMinutes} onChange={patchDuration} placeholder="0" type="number" />
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 focus-within:border-blue-400 focus-within:bg-white transition-colors">
          <BarChart3 className="h-3 w-3 text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="block text-[9px] text-slate-400 leading-none mb-0.5">指标</span>
            <div className="flex items-center gap-2">
              <input type="text" value={form.metricName} onChange={(e) => onPatch({ metricName: e.target.value })} placeholder="名称" className="w-20 bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none" />
              <input type="number" value={form.metricValue} onChange={(e) => onPatch({ metricValue: e.target.value })} placeholder="数值" className="w-14 bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none" />
              <input type="text" value={form.metricUnit} onChange={(e) => onPatch({ metricUnit: e.target.value })} placeholder="单位" className="w-14 bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none" />
            </div>
          </div>
        </div>
      </div>

      <CompactInput icon={<Users className="h-3 w-3" />} label="关系人" value={form.peopleStr} onChange={(v) => onPatch({ peopleStr: v })} placeholder="逗号分隔" />
    </div>
  );
}
