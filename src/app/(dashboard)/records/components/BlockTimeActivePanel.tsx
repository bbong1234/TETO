'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Square, Loader2, ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react';
import type { Item, Record as TetoRecord, UserTool, Tag } from '@/types/teto';
import type { PlanPriority } from '@/lib/activity/plan-priority';
import { isSessionPaused } from '@/lib/activity/session-utils';
import ActivitySessionTimer from './ActivitySessionTimer';
import SessionInterruptControls from './SessionInterruptControls';
import BlockSessionTimeline, {
  type BlockTimelineSegment,
  type BlockTimelineSegmentMeta,
} from './BlockSessionTimeline';
import { useBlockSessionSegments, buildBlockSegmentLabel, segmentMetaFromActivity } from '@/hooks/use-block-session-segments';
import { useSubItemTitlesFromRecords } from '@/hooks/use-sub-item-titles-from-records';
import { buildSegmentTimerRecord } from '@/lib/activity/block-segment-timer';
import {
  buildBlockDisplayRecord,
  resolveBlockDisplayContext,
  resolveBlockAttributionItemIds,
} from '@/lib/activity/block-attribution-display';
import { extractActionWordsFromRecords } from '@/lib/activity/action-extract';
import { formatActiveActivityTitle } from '@/lib/activity/recent-context';
import type { SessionActionPayload } from '@/lib/activity/records-mutation';
import BlockAttributionBubbles from './BlockAttributionBubbles';
import ActivityDetailPanel from './ActivityDetailPanel';
import ActivityStructuredPanel from './ActivityStructuredPanel';
import ActivityDialogChat, { type ActionSwitchPayload } from './ActivityDialogChat';

export type CancelWindowMode = 'start' | 'switch';

/** 5 秒倒计时角标：与 cancelWindowExpiresAt 同步 */
function CancelBadge({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
  );
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (remaining <= 0) return null;
  return (
    <span className="ml-0.5 tabular-nums text-[10px] font-normal opacity-60">
      {remaining}s
    </span>
  );
}

export function StopOrCancelButton({
  cancelWindow,
  cancelWindowMode,
  cancelWindowExpiresAt,
  onCancelActivity,
  onRequestStop,
  actionLoading,
  stopSubmitting,
  inBlock = false,
  className,
  iconClassName = 'h-4 w-4',
  size = 'default',
}: {
  cancelWindow?: boolean;
  cancelWindowMode?: CancelWindowMode | null;
  cancelWindowExpiresAt?: number | null;
  onCancelActivity?: () => void;
  onRequestStop: () => void;
  actionLoading: boolean;
  stopSubmitting: boolean;
  inBlock?: boolean;
  className?: string;
  iconClassName?: string;
  size?: 'default' | 'sm';
}) {
  const isSwitchCancel = cancelWindow && cancelWindowMode === 'switch' && onCancelActivity;
  const isStartCancel = cancelWindow && cancelWindowMode === 'start' && onCancelActivity;
  const label = isSwitchCancel || isStartCancel ? '取消' : '停止';
  const onClick = isSwitchCancel || isStartCancel ? onCancelActivity : onRequestStop;
  const pad = size === 'sm' ? 'px-2 py-1.5 text-xs' : 'px-3 py-1.5 text-sm sm:px-4 sm:py-2';
  const freezeActions =
    stopSubmitting || (!cancelWindow && actionLoading && !inBlock);

  return (
    <button
      type="button"
      disabled={freezeActions}
      onClick={() => {
        onClick?.();
      }}
      className={
        className ??
        `flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white ${pad} text-slate-700 hover:bg-slate-50 disabled:opacity-50`
      }
    >
      {stopSubmitting ? (
        <Loader2 className={`${iconClassName} animate-spin`} />
      ) : (
        <Square className={iconClassName} />
      )}
      {label}
      {(isSwitchCancel || isStartCancel) && cancelWindowExpiresAt ? (
        <CancelBadge expiresAt={cancelWindowExpiresAt} />
      ) : null}
    </button>
  );
}

export default function BlockTimeActivePanel({
  activity,
  items,
  tags = [],
  userTools,
  toolsLoading,
  onToolsChange,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onTagCreated,
  actionLoading,
  stopSubmitting,
  todayDate,
  drawerMode = false,
  compact = false,
  onExpandDrawer,
  onCollapseDrawer,
  onRequestStop,
  onSwitch,
  onActivityUpdated,
  onRecordSynced,
  onRecordAdded,
  onError,
  onInlineSwitch,
  onActionSwitch,
  onSessionAction,
  lockedCategoryItemId,
  blockSessionSubItemTitles = new Map<string, string>(),
  todayRecords = [],
  cancelWindow = false,
  cancelWindowMode = null,
  cancelWindowExpiresAt = null,
  blockAttributionGrace = false,
  onItemGraceUndo,
  onActionGraceUndo,
  onCancelActivity,
  onRegisterBlockSegmentPop,
  onRegisterBlockSegmentAppend,
  onRegisterBlockSegmentUpdate,
  onRegisterBlockSegmentReset,
  onRegisterBlockSegmentsRestore,
  onRegisterBlockSegmentsGetter,
  onRegisterAttributionConfirm,
  onRegisterAttributionReset,
}: {
  activity: TetoRecord;
  items: Item[];
  tags?: Tag[];
  userTools?: UserTool[];
  toolsLoading?: boolean;
  onToolsChange?: (tools: UserTool[]) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onTagCreated?: (tag: Tag) => void;
  actionLoading: boolean;
  stopSubmitting: boolean;
  todayDate: string;
  drawerMode?: boolean;
  compact?: boolean;
  onExpandDrawer?: () => void;
  onCollapseDrawer?: () => void;
  onRequestStop: () => void;
  onSwitch: () => void;
  onActivityUpdated: (record: TetoRecord) => void;
  onRecordSynced?: (record: TetoRecord) => void;
  onRecordAdded: (record: TetoRecord, replaceOptimistic?: boolean) => void;
  onError?: (message: string) => void;
  onInlineSwitch?: (payload: {
    content?: string;
    item_id: string | null;
    sub_item_id: string | null;
    sub_item_title?: string | null;
    tag_ids?: string[];
  }) => void;
  onActionSwitch?: (payload: ActionSwitchPayload) => void;
  onSessionAction?: (data: SessionActionPayload) => void;
  lockedCategoryItemId?: string | null;
  /** 块会话内已选 SubItem 标题（进入块时间 / PATCH 时写入） */
  blockSessionSubItemTitles?: ReadonlyMap<string, string>;
  todayRecords?: TetoRecord[];
  cancelWindow?: boolean;
  cancelWindowMode?: CancelWindowMode | null;
  cancelWindowExpiresAt?: number | null;
  /** 块时间 5 秒撤销窗口内：标签切换不新开时间轴段 */
  blockAttributionGrace?: boolean;
  onItemGraceUndo?: (level: 'l2' | 'l3') => void;
  onActionGraceUndo?: () => void;
  onCancelActivity?: () => void;
  onRegisterBlockSegmentPop?: (pop: () => void) => void;
  onRegisterBlockSegmentAppend?: (append: (label: string, startMs?: number) => void) => void;
  onRegisterBlockSegmentUpdate?: (update: (label: string, meta?: BlockTimelineSegmentMeta) => void) => void;
  onRegisterBlockSegmentReset?: (reset: () => void) => void;
  onRegisterBlockSegmentsRestore?: (restore: (segments: BlockTimelineSegment[]) => void) => void;
  onRegisterBlockSegmentsGetter?: (getter: () => BlockTimelineSegment[]) => void;
  onRegisterAttributionConfirm?: (confirm: () => void) => void;
  onRegisterAttributionReset?: (
    reset: (opts?: {
      activity?: TetoRecord;
      segmentMeta?: BlockTimelineSegmentMeta | null;
    }) => void
  ) => void;
}) {
  const paused = isSessionPaused(activity.session_state);
  const pauseLabel = '已暂停';
  const segmentSubItemRecords = useMemo(
    () => [...todayRecords, activity],
    [todayRecords, activity]
  );
  const segmentSubItemTitles = useSubItemTitlesFromRecords(segmentSubItemRecords);
  const mergedSubItemTitles = useMemo(() => {
    const merged = new Map(segmentSubItemTitles);
    for (const [id, title] of blockSessionSubItemTitles) {
      merged.set(id, title);
    }
    return merged;
  }, [segmentSubItemTitles, blockSessionSubItemTitles]);

  const { blockSegments, appendBlockSegment, popBlockSegment, updateLastBlockSegment, pauseBlockSegment, resumeBlockSegment, revertPauseBlockSegment, revertResumeBlockSegment, resetSegments, getBlockSegmentsSnapshot, restoreBlockSegments } =
    useBlockSessionSegments(items, activity, mergedSubItemTitles);

  useEffect(() => {
    onRegisterBlockSegmentPop?.(popBlockSegment);
  }, [onRegisterBlockSegmentPop, popBlockSegment]);

  useEffect(() => {
    onRegisterBlockSegmentAppend?.(appendBlockSegment);
  }, [onRegisterBlockSegmentAppend, appendBlockSegment]);

  useEffect(() => {
    onRegisterBlockSegmentUpdate?.(updateLastBlockSegment);
  }, [onRegisterBlockSegmentUpdate, updateLastBlockSegment]);

  useEffect(() => {
    onRegisterBlockSegmentReset?.(resetSegments);
  }, [onRegisterBlockSegmentReset, resetSegments]);

  useEffect(() => {
    onRegisterBlockSegmentsRestore?.(restoreBlockSegments);
  }, [onRegisterBlockSegmentsRestore, restoreBlockSegments]);

  useEffect(() => {
    onRegisterBlockSegmentsGetter?.(getBlockSegmentsSnapshot);
  }, [onRegisterBlockSegmentsGetter, getBlockSegmentsSnapshot]);

  const timerActivity = useMemo(() => {
    if (!lockedCategoryItemId || blockSegments.length === 0) return activity;
    return buildSegmentTimerRecord(blockSegments, activity);
  }, [activity, blockSegments, lockedCategoryItemId]);

  const currentSegmentMeta = useMemo((): BlockTimelineSegmentMeta | null => {
    const last = [...blockSegments].reverse().find((s) => !s.isGap);
    if (!last) return null;
    return {
      item_id: last.item_id,
      sub_item_id: last.sub_item_id,
      action_text: last.action_text,
      tag_ids: last.tag_ids,
    };
  }, [blockSegments]);

  const displayActivity = useMemo(
    () => buildBlockDisplayRecord(activity, tags, lockedCategoryItemId, currentSegmentMeta),
    [activity, tags, lockedCategoryItemId, currentSegmentMeta]
  );

  const titleLine = formatActiveActivityTitle(items, displayActivity);

  const attributionItemId = useMemo(
    () =>
      resolveBlockAttributionItemIds(activity, lockedCategoryItemId, currentSegmentMeta).item_id,
    [activity, lockedCategoryItemId, currentSegmentMeta]
  );

  const recentActions = useMemo(
    () =>
      extractActionWordsFromRecords(todayRecords, {
        itemId: attributionItemId ?? undefined,
      }),
    [todayRecords, attributionItemId]
  );

  const handleAppendOrUpdateBlockSegment = (
    label: string,
    startMs = Date.now(),
    meta?: BlockTimelineSegmentMeta
  ) => {
    if (blockAttributionGrace) {
      updateLastBlockSegment(label, meta);
    } else {
      appendBlockSegment(label, startMs, meta);
    }
  };

  const handleSessionRecordChange = (record: TetoRecord) => {
    onActivityUpdated(record);
    onRecordSynced?.(record);
  };

  /** 暂停/继续/插一件事/回到父会话：在块时间轴留下对应段落 */
  const handleSessionActionWithSegments = (data: SessionActionPayload) => {
    if (data.syncOnly) {
      if (
        data.action === 'pause' &&
        data.record &&
        data.record.session_state !== 'paused' &&
        data.record.session_state !== 'nested_paused'
      ) {
        revertPauseBlockSegment();
      }
      if (
        data.action === 'resume' &&
        data.record &&
        (data.record.session_state === 'paused' || data.record.session_state === 'nested_paused')
      ) {
        revertResumeBlockSegment();
      }
      onSessionAction?.(data);
      return;
    }

    const nowMs = Date.now();
    if (data.action === 'pause') {
      pauseBlockSegment(nowMs);
    } else if (data.action === 'resume' && data.record) {
      resumeBlockSegment(
        buildBlockSegmentLabel(items, data.record),
        nowMs,
        segmentMetaFromActivity(data.record)
      );
    }
    onSessionAction?.(data);
  };

  const handleBubbleSwitch = (payload: {
    item_id: string;
    sub_item_id: string | null;
    label: string;
  }) => {
    onInlineSwitch?.({
      item_id: payload.item_id,
      sub_item_id: payload.sub_item_id,
      sub_item_title: payload.sub_item_id ? payload.label : undefined,
    });
  };

  const handleActionSwitchWithSegments = (payload: ActionSwitchPayload) => {
    onActionSwitch?.(payload);
  };

  /** 5 秒撤销窗口内不冻结；块时间 PATCH 切换不走 actionLoading */
  const freezeActions =
    stopSubmitting || (!cancelWindow && actionLoading && !lockedCategoryItemId);

  const timerActions = (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={freezeActions}
          onClick={onSwitch}
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 sm:px-4 sm:py-2"
        >
          <ArrowRightLeft className="h-4 w-4" />
          切换
        </button>
        <StopOrCancelButton
          cancelWindow={cancelWindow}
          cancelWindowMode={cancelWindowMode}
          cancelWindowExpiresAt={cancelWindowExpiresAt}
          onCancelActivity={onCancelActivity}
          onRequestStop={onRequestStop}
          actionLoading={actionLoading}
          stopSubmitting={stopSubmitting}
          inBlock={Boolean(lockedCategoryItemId)}
        />
      </div>
      <SessionInterruptControls
        activity={activity}
        disabled={freezeActions}
        onSessionAction={handleSessionActionWithSegments}
        onCurrentChange={(record) => record && handleSessionRecordChange(record)}
        onError={onError}
      />
    </div>
  );

  if (drawerMode) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="shrink-0 flex flex-col items-center justify-center px-4 pb-3 pt-3">
          {onCollapseDrawer && (
            <button
              type="button"
              onClick={onCollapseDrawer}
              className="mb-3 flex w-full flex-col items-center rounded-xl py-1 active:bg-slate-100/80"
              aria-label="收起，查看时间线"
            >
              <span className="h-1 w-12 rounded-full bg-slate-300" />
              <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                <ChevronDown className="h-3.5 w-3.5" />
                查看时间线
              </span>
            </button>
          )}
          <div className="mx-auto flex max-w-lg items-center justify-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${paused ? 'bg-amber-400 ring-amber-100' : 'animate-pulse bg-green-400 ring-green-100'}`} />
            <p className="truncate text-sm font-medium text-slate-600">{titleLine}</p>
            {paused && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">{pauseLabel}</span>}
          </div>
          <ActivitySessionTimer activity={timerActivity} variant="drawer" />
          <div className="mt-4 flex justify-center">{timerActions}</div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-3 border-t border-slate-200/80 bg-white/90 p-3 backdrop-blur-sm min-[520px]:grid-cols-2 min-[520px]:grid-rows-[2fr_3fr] sm:gap-4 sm:p-4">
          <div className="min-h-0 overflow-y-auto min-[520px]:col-start-1 min-[520px]:row-start-1">
            {blockSegments.length > 0 ? (
              <BlockSessionTimeline segments={blockSegments} />
            ) : (
              <p className="px-2 py-3 text-center text-xs text-slate-400">本次块时间暂无段落</p>
            )}
          </div>

          <div className="min-h-0 min-[520px]:col-start-2 min-[520px]:row-start-1">
            <ActivityDetailPanel
              activity={activity}
              displayActivity={displayActivity}
              timerActivity={timerActivity}
              items={items}
              userTools={userTools}
              toolsLoading={toolsLoading}
              onToolsChange={onToolsChange}
              onActivityUpdated={onActivityUpdated}
              onRecordSynced={onRecordSynced}
              onError={onError}
            />
          </div>

          <div className="min-h-0 min-[520px]:col-start-2 min-[520px]:row-start-2">
            <BlockAttributionBubbles
              items={items}
              activity={activity}
              tags={tags}
              lockedCategoryItemId={lockedCategoryItemId}
              currentSegmentMeta={currentSegmentMeta}
              graceActive={blockAttributionGrace}
              graceExpiresAt={cancelWindowExpiresAt}
              onItemGraceUndo={onItemGraceUndo}
              onActionGraceUndo={onActionGraceUndo}
              onItemsChange={onItemsChange}
              onItemCreated={onItemCreated}
              onCreateError={onCreateError}
              onTagCreated={onTagCreated}
              onSwitch={handleBubbleSwitch}
              onActionSwitch={handleActionSwitchWithSegments}
              onRegisterAttributionConfirm={onRegisterAttributionConfirm}
              onRegisterAttributionReset={onRegisterAttributionReset}
            />
          </div>

          <div className="min-h-0 h-full min-[520px]:col-start-1 min-[520px]:row-start-2">
            <ActivityDialogChat
              embedded
              layout="panel"
              activity={activity}
              displayActivity={displayActivity}
              attributionItemId={attributionItemId}
              titleLine={titleLine}
              items={items}
              functionTags={tags.filter((t) => t.type === 'function')}
              lockedCategoryItemId={lockedCategoryItemId}
              date={todayDate}
              onActivityUpdated={onActivityUpdated}
              onRecordSynced={onRecordSynced}
              onRecordAdded={onRecordAdded}
              onError={onError}
              onInlineSwitch={onInlineSwitch}
            onActionSwitch={handleActionSwitchWithSegments}
              onAppendBlockSegment={handleAppendOrUpdateBlockSegment}
              recentActions={recentActions}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {compact ? (
        <div
          role="button"
          tabIndex={0}
          onClick={onExpandDrawer}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onExpandDrawer?.();
            }
          }}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-left active:bg-slate-50 sm:px-4"
        >
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600">
            <ChevronUp className="h-3.5 w-3.5" />
            报备
          </span>
          <span className={`h-2 w-2 shrink-0 rounded-full ${paused ? 'bg-amber-400' : 'animate-pulse bg-green-400'}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-500">
              {titleLine}
              {paused && <span className="ml-1 text-amber-600">· {pauseLabel}</span>}
            </p>
            <ActivitySessionTimer activity={timerActivity} variant="compact" />
          </div>
          <div
            className="flex shrink-0 items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <SessionInterruptControls
              activity={activity}
              size="sm"
              disabled={freezeActions}
              onSessionAction={handleSessionActionWithSegments}
              onCurrentChange={(record) => record && handleSessionRecordChange(record)}
              onError={onError}
            />
            <button
              type="button"
              disabled={freezeActions}
              onClick={onSwitch}
              className="flex items-center gap-1 rounded-lg bg-blue-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              切换
            </button>
            <StopOrCancelButton
              cancelWindow={cancelWindow}
              cancelWindowMode={cancelWindowMode}
              cancelWindowExpiresAt={cancelWindowExpiresAt}
              onCancelActivity={onCancelActivity}
              onRequestStop={onRequestStop}
              actionLoading={actionLoading}
              stopSubmitting={stopSubmitting}
              inBlock={Boolean(lockedCategoryItemId)}
              size="sm"
              iconClassName="h-3.5 w-3.5"
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            />
          </div>
        </div>
      ) : (
        <>
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        {onExpandDrawer && (
          <button
            type="button"
            onClick={onExpandDrawer}
            className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
            aria-label="展开报备面板"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${paused ? 'bg-amber-400 ring-amber-100' : 'bg-green-400 ring-green-100'}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-500">
            {titleLine}
            {paused && <span className="ml-1 text-amber-600">· {pauseLabel}</span>}
          </p>
          <ActivitySessionTimer
            activity={timerActivity}
            variant="default"
            className="mt-0.5 text-3xl font-semibold tracking-tight"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SessionInterruptControls
            activity={activity}
            size="sm"
            disabled={freezeActions}
            onSessionAction={handleSessionActionWithSegments}
            onCurrentChange={(record) => record && handleSessionRecordChange(record)}
            onError={onError}
          />
          <button
            type="button"
            disabled={freezeActions}
            onClick={onSwitch}
            className="flex items-center gap-1 rounded-lg bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            切换
          </button>
          <StopOrCancelButton
            cancelWindow={cancelWindow}
            cancelWindowMode={cancelWindowMode}
            cancelWindowExpiresAt={cancelWindowExpiresAt}
            onCancelActivity={onCancelActivity}
            onRequestStop={onRequestStop}
            actionLoading={actionLoading}
            stopSubmitting={stopSubmitting}
            inBlock={Boolean(lockedCategoryItemId)}
            size="sm"
            iconClassName="h-3.5 w-3.5"
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          />
        </div>
      </div>

      <ActivityStructuredPanel activity={displayActivity} items={items} />

      <ActivityDialogChat
        embedded
        activity={activity}
        displayActivity={displayActivity}
        attributionItemId={attributionItemId}
        titleLine={titleLine}
        items={items}
        functionTags={tags.filter((t) => t.type === 'function')}
        lockedCategoryItemId={lockedCategoryItemId}
        date={todayDate}
        onActivityUpdated={onActivityUpdated}
        onRecordAdded={onRecordAdded}
        onError={onError}
        onInlineSwitch={onInlineSwitch}
        onActionSwitch={handleActionSwitchWithSegments}
        onAppendBlockSegment={handleAppendOrUpdateBlockSegment}
        recentActions={recentActions}
      />
        </>
      )}
    </div>
  );
}

