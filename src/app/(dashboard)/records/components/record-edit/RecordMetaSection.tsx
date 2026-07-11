'use client';

import type { RecordEditFormState } from '@/lib/activity/record-form';
import { isLegacyRecordType } from '@/lib/activity/record-form';
import type { Record as TetoRecord, RecordType } from '@/types/teto';
import { USER_RECORD_TYPES } from '@/types/teto';
import EditableChipRow from './EditableChipRow';
import RecordDetailSection from './RecordDetailSection';

const LIFECYCLE_LABEL: Record<string, string> = {
  completed: '已完成',
  cancelled: '已取消',
  postponed: '已推迟',
};

const TYPE_COLOR: Record<string, string> = {
  发生: 'bg-blue-500 text-white',
  计划: 'bg-indigo-500 text-white',
  想法: 'bg-purple-500 text-white',
};

interface RecordMetaSectionProps {
  form: RecordEditFormState;
  originalRecord: TetoRecord;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordMetaSection({ form, originalRecord, onPatch }: RecordMetaSectionProps) {
  const showLegacyType = isLegacyRecordType(originalRecord.type) && form.type === originalRecord.type;

  const syncDurationFromTimes = (start: string, end: string) => {
    if (!start || !end) return;
    const s = parseInt(start.split(':')[0], 10) * 60 + parseInt(start.split(':')[1], 10);
    const e = parseInt(end.split(':')[0], 10) * 60 + parseInt(end.split(':')[1], 10);
    if (e > s) onPatch({ durationMinutes: String(e - s) });
  };

  const dateLabel = form.recordDate
    ? new Date(`${form.recordDate}T12:00:00`).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '日期';

  const timeRange =
    form.occurredAt && form.occurredAtEnd
      ? `${form.occurredAt}–${form.occurredAtEnd}`
      : form.occurredAt || '时间';

  const dur = parseInt(form.durationMinutes, 10);
  const durLabel = dur > 0 ? `${dur}分` : '';

  const lifecycle = originalRecord.lifecycle_status;
  const lifecycleLabel =
    lifecycle && lifecycle !== 'active' ? LIFECYCLE_LABEL[lifecycle] ?? lifecycle : '';

  return (
    <RecordDetailSection title="元信息">
      <div className="flex flex-wrap items-center gap-1.5">
        <EditableChipRow value={form.type ?? '发生'}>
          <div className="flex flex-wrap gap-1">
            {USER_RECORD_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onPatch({ type: t as RecordType })}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  form.type === t ? TYPE_COLOR[t] ?? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </EditableChipRow>

        <EditableChipRow value={dateLabel}>
          <input
            type="date"
            value={form.recordDate}
            onChange={(e) => onPatch({ recordDate: e.target.value })}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
          />
        </EditableChipRow>

        <EditableChipRow value={[timeRange, durLabel].filter(Boolean).join(' · ') || '时间'}>
          <div className="space-y-2 min-w-[12rem]">
            <div className="flex gap-2">
              <input
                type="time"
                value={form.occurredAt}
                onChange={(e) => {
                  const v = e.target.value;
                  onPatch({ occurredAt: v });
                  if (v && form.occurredAtEnd) syncDurationFromTimes(v, form.occurredAtEnd);
                }}
                className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
              />
              <span className="text-slate-300">–</span>
              <input
                type="time"
                value={form.occurredAtEnd}
                onChange={(e) => {
                  const v = e.target.value;
                  onPatch({ occurredAtEnd: v });
                  if (form.occurredAt && v) syncDurationFromTimes(form.occurredAt, v);
                }}
                className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
              />
            </div>
            <input
              type="number"
              value={form.durationMinutes}
              onChange={(e) => onPatch({ durationMinutes: e.target.value })}
              placeholder="时长(分钟)"
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
            />
            {form.timeText.trim() && (
              <input
                type="text"
                value={form.timeText}
                onChange={(e) => onPatch({ timeText: e.target.value })}
                placeholder="模糊时间原文"
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
              />
            )}
          </div>
        </EditableChipRow>

        {lifecycleLabel && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
            {lifecycleLabel}
          </span>
        )}

        {showLegacyType && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
            历史类型：{originalRecord.type}
          </span>
        )}
      </div>
    </RecordDetailSection>
  );
}
