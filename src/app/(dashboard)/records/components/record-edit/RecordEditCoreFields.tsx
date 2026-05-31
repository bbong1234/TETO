'use client';

import { Clock } from 'lucide-react';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { isLegacyRecordType } from '@/lib/activity/record-form';
import type { Record, RecordType } from '@/types/teto';
import { USER_RECORD_TYPES } from '@/types/teto';
import { CompactInput } from './CompactInput';

interface RecordEditCoreFieldsProps {
  form: RecordEditFormState;
  originalRecord: Record;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordEditCoreFields({
  form,
  originalRecord,
  onPatch,
}: RecordEditCoreFieldsProps) {
  const showLegacyType = isLegacyRecordType(originalRecord.type) && form.type === originalRecord.type;

  const syncDurationFromTimes = (start: string, end: string) => {
    if (!start || !end) return;
    const s = parseInt(start.split(':')[0]) * 60 + parseInt(start.split(':')[1]);
    const e = parseInt(end.split(':')[0]) * 60 + parseInt(end.split(':')[1]);
    if (e > s) onPatch({ durationMinutes: String(e - s) });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          主内容
        </label>
        <textarea
          value={form.content}
          onChange={(e) => onPatch({ content: e.target.value })}
          rows={3}
          placeholder="可选，留空表示仅选归属路径"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          主类型
        </label>
        <div className="flex flex-wrap gap-1 items-center">
          {USER_RECORD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPatch({ type: t as RecordType })}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                form.type === t
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
          {showLegacyType && (
            <span className="rounded-md px-2 py-1 text-[11px] font-medium bg-amber-100 text-amber-700">
              当前：{originalRecord.type}（历史类型，请选上方类型保存）
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          时间
        </label>
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-400">归属日</label>
          <input
            type="date"
            value={form.recordDate}
            onChange={(e) => onPatch({ recordDate: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <CompactInput
            icon={<Clock className="h-3 w-3" />}
            label="时间表达"
            value={form.timeText}
            onChange={(v) => onPatch({ timeText: v })}
            placeholder="如：昨晚、明天"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="mb-0.5 block text-[10px] text-slate-400">开始</label>
            <input
              type="time"
              value={form.occurredAt}
              onChange={(e) => {
                const v = e.target.value;
                onPatch({ occurredAt: v });
                if (v && form.occurredAtEnd) syncDurationFromTimes(v, form.occurredAtEnd);
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <span className="text-slate-300 mt-4">–</span>
          <div className="flex-1">
            <label className="mb-0.5 block text-[10px] text-slate-400">结束</label>
            <input
              type="time"
              value={form.occurredAtEnd}
              onChange={(e) => {
                const v = e.target.value;
                onPatch({ occurredAtEnd: v });
                if (form.occurredAt && v) syncDurationFromTimes(form.occurredAt, v);
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        {form.occurredAt && form.occurredAtEnd && (() => {
          const s = parseInt(form.occurredAt.split(':')[0]) * 60 + parseInt(form.occurredAt.split(':')[1]);
          const e = parseInt(form.occurredAtEnd.split(':')[0]) * 60 + parseInt(form.occurredAtEnd.split(':')[1]);
          const diff = e - s;
          return diff > 0 ? (
            <div className="text-[10px] text-slate-400 text-center">
              约 {diff >= 60 ? `${Math.floor(diff / 60)}小时${diff % 60 ? `${diff % 60}分钟` : ''}` : `${diff}分钟`}
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}
