'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { Item, Record as TetoRecord, UserTool } from '@/types/teto';
import ToolLabelField, { persistToolOptionIfNeeded } from '@/components/records/ToolLabelField';
import { buildTimelineTagPath } from '@/lib/activity/item-tree';
import { collectStructuredFields } from '@/lib/activity/structured-fields';
import { isSessionPaused } from '@/lib/activity/session-utils';
import { formatElapsedClock } from '@/lib/activity/stats-utils';
import { useSessionElapsedSeconds } from '@/hooks/use-elapsed-seconds';
import { resolveActivityRecordIdClient } from '@/lib/activity/activity-switch-pending';

interface ActivityDetailPanelProps {
  activity: TetoRecord;
  items: Item[];
  /** 块时间展示：标签路径等用合并后的当前段归属 */
  displayActivity?: TetoRecord;
  /** 块时间展示：已进行时长按当前段起点计 */
  timerActivity?: TetoRecord;
  userTools?: UserTool[];
  toolsLoading?: boolean;
  onToolsChange?: (tools: UserTool[]) => void;
  /** 乐观更新当前活动（不写时间线列表） */
  onActivityUpdated: (record: TetoRecord) => void;
  /** 服务端持久化成功后同步时间线 */
  onRecordSynced?: (record: TetoRecord) => void;
  onError?: (message: string) => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </p>
  );
}

function fmtStartTime(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 块时间「当前记录」：只读展示标签路径、时间与记录总结；工具在此编辑。
 * 事项/动作切换见右下 BlockAttributionBubbles。
 */
function ActivityDetailPanel({
  activity,
  items,
  displayActivity,
  timerActivity,
  userTools,
  toolsLoading,
  onToolsChange,
  onActivityUpdated,
  onRecordSynced,
  onError,
}: ActivityDetailPanelProps) {
  const [toolLabel, setToolLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const toolPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSeqRef = useRef(0);
  const activityRef = useRef(activity);
  activityRef.current = activity;

  const paused = isSessionPaused(activity.session_state);
  const pathRecord = displayActivity ?? activity;
  const elapsedRecord = timerActivity ?? activity;
  const elapsedSeconds = useSessionElapsedSeconds(elapsedRecord);
  const tagPath = buildTimelineTagPath(pathRecord, items);
  const structuredFields = collectStructuredFields(pathRecord, items);

  useEffect(() => {
    setToolLabel(activity.tool_label?.trim() ?? '');
  }, [activity.id, activity.tool_label]);

  const persistPatch = useCallback(
    async (body: Record<string, unknown>) => {
      const seq = ++persistSeqRef.current;
      const recordId = await resolveActivityRecordIdClient(activityRef.current);
      if (!recordId) {
        onError?.('活动尚未同步，请稍后再试');
        return;
      }
      if (seq !== persistSeqRef.current) return;

      setSaving(true);
      try {
        const res = await fetch(`/api/v2/records/${recordId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (seq !== persistSeqRef.current) return;
        if (!res.ok) {
          onError?.(data.error?.message ?? '保存失败');
          return;
        }
        if (data.data) {
          const synced = data.data as TetoRecord;
          onActivityUpdated(synced);
          onRecordSynced?.(synced);
        }
      } catch (e) {
        if (seq !== persistSeqRef.current) return;
        onError?.(e instanceof Error ? e.message : '保存失败');
      } finally {
        if (seq === persistSeqRef.current) setSaving(false);
      }
    },
    [onActivityUpdated, onRecordSynced, onError]
  );

  const handleToolChange = (value: string) => {
    setToolLabel(value);
    if (toolPersistTimerRef.current) clearTimeout(toolPersistTimerRef.current);
    toolPersistTimerRef.current = setTimeout(() => {
      const trimmed = value.trim() || null;
      if (trimmed) void persistToolOptionIfNeeded(value);
      void persistPatch({ tool_label: trimmed });
    }, 450);
  };

  useEffect(() => {
    return () => {
      if (toolPersistTimerRef.current) clearTimeout(toolPersistTimerRef.current);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <header className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-slate-50/90 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">当前记录</span>
          <span
            className={
              paused
                ? 'inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600'
                : 'inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600'
            }
          >
            {paused ? '已暂停' : '计时中'}
          </span>
          {saving && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              保存中
            </span>
          )}
        </div>
        {tagPath && (
          <p className="mt-1.5 truncate text-sm font-medium text-slate-800" title={tagPath}>
            {tagPath}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] tabular-nums text-slate-500">
          <span>开始 {fmtStartTime(activity.occurred_at)}</span>
          <span>已进行 {formatElapsedClock(elapsedSeconds)}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <section>
          <SectionTitle>记录总结</SectionTitle>
          {structuredFields.length === 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
              <p className="text-[11px] leading-relaxed text-slate-400">
                在左侧说「跑步 40 分钟」「在星巴克花了 35」等，会自动提取到这里
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {structuredFields.map((field, index) => (
                <div
                  key={`${field.label}-${field.value}-${index}`}
                  className="inline-flex max-w-full items-baseline gap-1 rounded-lg bg-slate-100/90 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="shrink-0 text-slate-400">{field.label}</span>
                  <span className="min-w-0 font-medium text-slate-800 break-words">
                    {field.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-slate-100 pt-4">
          <SectionTitle>工具</SectionTitle>
          <ToolLabelField
            compact
            hideLabel
            tools={userTools}
            toolsLoading={toolsLoading}
            onToolsChange={onToolsChange}
            value={toolLabel}
            onChange={handleToolChange}
          />
        </section>
      </div>
    </div>
  );
}

export default memo(ActivityDetailPanel);
