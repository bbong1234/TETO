'use client';

import { useEffect, useRef, useState } from 'react';
import type { ActivityEvent, Item, Record as TetoRecord } from '@/types/teto';
import {
  collectStructuredFields,
  type StructuredField,
} from '@/lib/activity/structured-fields';
import { collectStructuredFieldsFromEvents } from '@/lib/activity/event-aggregation';
import { fetchSessionEvents } from '@/lib/activity/activity-events-client';
import { isOptimisticRecordId } from '@/lib/activity/records-mutation';

export { collectStructuredFields, type StructuredField };

interface ActivityStructuredPanelProps {
  activity: TetoRecord;
  items?: Item[];
  layout?: 'inline' | 'panel' | 'section';
}

export default function ActivityStructuredPanel({
  activity,
  items,
  layout = 'inline',
}: ActivityStructuredPanelProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const lastLoadKey = useRef<string>('');

  useEffect(() => {
    const sessionId = activity.id;
    if (!sessionId || isOptimisticRecordId(sessionId)) {
      setEvents([]);
      return;
    }
    // updated_at 变化或会话切换时重新拉取，反映新追加的进度
    const key = `${sessionId}:${activity.updated_at ?? ''}`;
    if (lastLoadKey.current === key) return;
    lastLoadKey.current = key;

    let cancelled = false;
    void fetchSessionEvents(sessionId).then((evs) => {
      if (!cancelled) setEvents(evs);
    });
    return () => {
      cancelled = true;
    };
  }, [activity.id, activity.updated_at]);

  const fields =
    events.length > 0
      ? collectStructuredFieldsFromEvents(activity, events, items)
      : collectStructuredFields(activity, items);

  const fieldList =
    fields.length === 0 ? (
      <p className="text-xs leading-relaxed text-slate-400">
        暂无结构化字段，在左侧对话中补充具体动作、地点、金额等
      </p>
    ) : (
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div
            key={`${field.label}-${field.value}-${index}`}
            className="rounded-lg bg-slate-50 px-3 py-2"
          >
            <p className="text-[10px] text-slate-400">{field.label}</p>
            <p className="mt-0.5 text-sm text-slate-800 break-words">{field.value}</p>
          </div>
        ))}
      </div>
    );

  if (layout === 'section') {
    return (
      <div className="border-b border-slate-100 px-3 py-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          结构化
        </p>
        {fieldList}
      </div>
    );
  }

  if (layout === 'panel') {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-100 px-3 py-2">
          <p className="text-xs font-medium text-slate-600">结构化事项</p>
          <p className="text-[10px] text-slate-400">对话报备后自动更新</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {fields.length === 0 ? (
            <p className="text-center text-xs leading-relaxed text-slate-400 pt-6">
              暂无结构化字段
              <br />
              在左侧对话中补充具体动作、地点、金额等
            </p>
          ) : (
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div
                  key={`${field.label}-${field.value}-${index}`}
                  className="rounded-lg bg-slate-50 px-3 py-2"
                >
                  <p className="text-[10px] text-slate-400">{field.label}</p>
                  <p className="mt-0.5 text-sm text-slate-800 break-words">{field.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-2">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        结构化事项
      </p>
      {fields.length === 0 ? (
        <p className="text-[11px] text-slate-400">暂无，对话报备后会自动填充</p>
      ) : (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {fields.map((field, index) => (
            <div
              key={`${field.label}-${field.value}-${index}`}
              className="inline-flex max-w-full items-baseline gap-1 rounded-md bg-slate-50 px-2 py-1 text-[11px]"
            >
              <span className="shrink-0 text-slate-400">{field.label}</span>
              <span className="min-w-0 truncate text-slate-700">{field.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
