'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo, type MutableRefObject } from 'react';
import { Square, ArrowRightLeft, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Item, Record as TetoRecord, RecordType, CreateRecordPayload, UserTool, Tag } from '@/types/teto';
import InputSuggestChips from '@/components/records/InputSuggestChips';
import AttributionFlowPicker from '@/components/records/AttributionFlowPicker';
import TodayPlansPanel from './TodayPlansPanel';
import { planPriorityToSubcategory, type PlanPriority } from '@/lib/activity/plan-priority';
import { extractActionWordsFromRecords } from '@/lib/activity/action-extract';
import { isSessionPaused } from '@/lib/activity/session-utils';
import ActivitySessionTimer from './ActivitySessionTimer';
import SessionInterruptControls from './SessionInterruptControls';
import { CANCEL_WINDOW_MS, DIARY_ITEM_TITLE } from '@/lib/activity/constants';
import StartActivityPanel, { type StartActivitySubmitPayload } from './StartActivityPanel';
import {
  EMPTY_ACTIVITY_CONTEXT,
  type ActivityContextValue,
} from './ActivityContextPicker';
import { postManualRecord } from '@/lib/activity/post-manual-record';
import {
  resolveContextLabel,
  resolveTargetItemId,
  validateActivityContext,
  resolveActivityContextFromRecord,
  getChildItems,
  extractSwitchLabel,
  normalizeOrgLevels,
} from '@/lib/activity/item-tree';
import { matchByUserRules } from '@/lib/utils/item-match';
import { triggerAiEnhance } from '@/lib/activity/ai-enhance-trigger';
import type { UserRule } from '@/lib/db/user-rules';
import {
  UNASSIGNED_ACTIVE_PLACEHOLDER,
  formatActiveActivityTitle,
  loadLastActivityContext,
  saveLastActivityContext,
} from '@/lib/activity/recent-context';
import QuickSwitchPanel from './QuickSwitchPanel';
import QuickStartBubbles from './QuickStartBubbles';
import type { QuickStartBubble } from '@/lib/activity/quick-start-bubbles';
import type { QuickSwitchEntry } from '@/lib/activity/quick-switch-utils';
import ActivityDialogChat, {
  type ActionSwitchPayload,
} from './ActivityDialogChat';
import BlockSessionTimeline, {
  type BlockTimelineSegment,
  type BlockTimelineSegmentMeta,
} from './BlockSessionTimeline';
import {
  buildBlockItemSwitchSegmentLabel,
  buildBlockSegmentLabel,
  buildBlockAttributionSegmentLabel,
  resolveBlockSegmentSubItemTitles,
  resolveBlockSessionSubItemTitles,
  useBlockSessionSegments,
  loadLockedBlockCategory,
  saveLockedBlockCategory,
  clearLockedBlockCategory,
  clearStoredBlockSegments,
  loadStoredBlockSegments,
  segmentMetaFromActivity,
} from '@/hooks/use-block-session-segments';
import { useSubItemTitlesFromRecords } from '@/hooks/use-sub-item-titles-from-records';
import {
  buildOptimisticStoppedFromBlockSegments,
  persistBlockSessionSegments,
  shouldSplitBlockSessionOnStop,
  activitySegmentsFromBlock,
} from '@/lib/activity/finalize-block-session';
import { buildSegmentTimerRecord } from '@/lib/activity/block-segment-timer';
import {
  buildBlockDisplayRecord,
  buildBlockUndoSnapshotActivity,
  mergeBlockAttributionFromServer,
  resolveBlockAttributionItemIds,
  resolveBlockDisplayContext,
  resolveBlockPatchBaseline,
  resolveOpenBlockSegmentMeta,
} from '@/lib/activity/block-attribution-display';
import {
  buildBlockActionSegmentMeta,
  buildBlockAttributionPatchPlan,
  buildBlockItemSegmentMeta,
  ensureBlockAttributionPutBody,
  shouldAppendBlockSegmentOnSwitch,
  shouldPreserveBlockGraceWindow,
  shouldPushBlockSwitchUndoFrame,
  resolveBlockSwitchKind,
  resolveBlockCancelRoute,
} from '@/lib/activity/block-tag-switch-rules';
import {
  buildSwitchUndoFrame,
  clearSwitchUndoStack,
  peekSwitchUndoFrame,
  popSwitchUndoFrame,
  pushSwitchUndoFrame,
  shouldRearmGraceAfterPop,
  type SwitchUndoFrame,
} from '@/lib/activity/block-switch-undo-stack';
import { getApiErrorMessage, isRecordNotFoundApiError, isStaleRecordReferenceError } from '@/lib/api/client-errors';
import ActivityStructuredPanel from './ActivityStructuredPanel';
import StopSummarySheet from './StopSummarySheet';
import { notifyUnassignedRefresh } from '@/hooks/use-unassigned-count';
import {
  buildOptimisticActiveRecord,
  buildOptimisticManualRecord,
  buildRestoredActiveSnapshot,
  buildStoppedSnapshot,
  isActiveTimingRecord,
  isOptimisticRecordId,
  preserveActiveTimingSnapshot,
  type ActivitySwitchPayload,
  type SessionActionPayload,
} from '@/lib/activity/records-mutation';
import {
  markActivitySwitchPending,
  resolveActivityRecordIdClient,
  settleActivitySwitch,
  hasPendingActivitySwitch,
  waitForPendingActivitySwitch,
} from '@/lib/activity/activity-switch-pending';
import MoodPicker from '@/components/records/MoodPicker';
import ContextualFunctionTagRow from '@/components/records/ContextualFunctionTagRow';
import { persistToolOptionIfNeeded } from '@/components/records/ToolLabelField';
import { CurrentActivityCardSkeleton } from '@/components/ui/PageSkeletons';
import QuickCreateBar from './QuickCreateBar';
import type { NewItemSuggestion } from '@/lib/activity/ai-enhance-trigger';
import BlockCategorySwitchPanel from './BlockCategorySwitchPanel';
import BlockAttributionBubbles from './BlockAttributionBubbles';
import ActivityDetailPanel from './ActivityDetailPanel';
import BlockTimeActivePanel, { StopOrCancelButton } from './BlockTimeActivePanel';
import ActivityIdlePanel from './ActivityIdlePanel';
import { useActivitySession } from '@/contexts/ActivitySessionContext';

interface CurrentActivityCardProps {
  items: Item[];
  itemsLoading?: boolean;
  pageReady?: boolean;
  initialActivity?: TetoRecord | null;
  refreshKey?: number;
  /** 父级快速切换后递增，用于同步当前活动 */
  activitySyncToken?: number;
  syncActivity?: TetoRecord | null;
  /** 时间线删除 tombstone：本地 activity 若已被删则清掉 */
  isRecordDeleted?: (id: string) => boolean;
  recordDeleteToken?: number;
  userTools?: UserTool[];
  toolsLoading?: boolean;
  onToolsChange?: (tools: UserTool[]) => void;
  onActivitySwitch: (data: ActivitySwitchPayload) => void;
  onRecordAdded: (record: TetoRecord, replaceOptimistic?: boolean) => void;
  onRecordDeleted?: (id: string) => void;
  onFallbackRefresh?: () => void;
  onItemsChanged?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onActivityChange?: (activity: TetoRecord | null) => void;
  onError?: (message: string) => void;
  /** 今日记录列表，供 TodayStatusCard 聚合展示 */
  todayRecords?: TetoRecord[];
  todayDate?: string;
  /** 供快速切换聚合的「发生」记录 */
  quickSwitchRecords?: TetoRecord[];
  tags?: Tag[];
  onPlanComplete?: (record: TetoRecord) => void;
  onPlanPriorityChange?: (record: TetoRecord, priority: PlanPriority | null) => void | Promise<void>;
  onTagCreated?: (tag: Tag) => void;
  userRules?: UserRule[];
  onRecordPatched?: (record: TetoRecord) => void;
  onSessionAction?: (data: SessionActionPayload) => void;
  onAiEnhanceStart?: (recordId: string) => void;
  onAiEnhanceEnd?: (recordId: string) => void;
  /** AI 检测到输入中提到了不存在的新事项名 */
  onNewItemSuggested?: (suggestion: NewItemSuggestion) => void;
  /** /切换 inline switch 回调 */
  onInlineSwitch?: (payload: import('./ActivityDialogChat').InlineSwitchPayload) => void;
  /** 计时抽屉：是否展开全屏报备面板 */
  drawerExpanded?: boolean;
  onDrawerExpandedChange?: (expanded: boolean) => void;
}

type AttachType = '想法' | '计划';
type IdleMode = '想法' | '计划' | '发生';

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type CancelWindowMode = 'start' | 'switch';

function cancelWindowRemainingMs(record: TetoRecord | null | undefined): number | null {
  if (!record?.occurred_at || record.occurred_at_end) return null;
  if (record.lifecycle_status !== 'active') return null;
  const elapsed = Date.now() - new Date(record.occurred_at).getTime();
  const remaining = CANCEL_WINDOW_MS - elapsed;
  return remaining > 0 ? remaining : null;
}

function disarmCancelWindow(
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setCancelWindow: (v: boolean) => void,
  setCancelWindowMode: (v: CancelWindowMode | null) => void,
  setCancelWindowExpiresAt: (v: number | null) => void,
  refs?: {
    cancelWindowRef?: MutableRefObject<boolean>;
    cancelWindowModeRef?: MutableRefObject<CancelWindowMode | null>;
    cancelWindowExpiresAtRef?: MutableRefObject<number | null>;
  }
): void {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = null;
  setCancelWindow(false);
  setCancelWindowMode(null);
  setCancelWindowExpiresAt(null);
  if (refs?.cancelWindowRef) refs.cancelWindowRef.current = false;
  if (refs?.cancelWindowModeRef) refs.cancelWindowModeRef.current = null;
  if (refs?.cancelWindowExpiresAtRef) refs.cancelWindowExpiresAtRef.current = null;
}

function tagIdsKey(record: TetoRecord | null | undefined): string {
  return (record?.tags ?? [])
    .map((t) => t.id)
    .sort()
    .join(',');
}

function isBlockSessionLocked(
  lockedRef: string | null | undefined
): boolean {
  return Boolean(lockedRef ?? loadLockedBlockCategory());
}

function attributionDiffers(a: TetoRecord, b: TetoRecord): boolean {
  return (
    a.item_id !== b.item_id ||
    (a.sub_item_id || '') !== (b.sub_item_id || '') ||
    tagIdsKey(a) !== tagIdsKey(b) ||
    (a.action_text || '') !== (b.action_text || '')
  );
}

function armCancelWindow(
  mode: CancelWindowMode,
  record: TetoRecord | null | undefined,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setCancelWindow: (v: boolean) => void,
  setCancelWindowMode: (v: CancelWindowMode | null) => void,
  setCancelWindowExpiresAt: (v: number | null) => void,
  onExpire?: () => void,
  onDisarm?: () => void,
  /** 块时间标签切换：每次重置完整 5 秒，不扣减会话已用时长 */
  fullWindow = false,
  refs?: {
    cancelWindowRef?: MutableRefObject<boolean>;
    cancelWindowModeRef?: MutableRefObject<CancelWindowMode | null>;
    cancelWindowExpiresAtRef?: MutableRefObject<number | null>;
  }
): void {
  const now = Date.now();
  const existingSwitchActive =
    mode === 'start' &&
    refs?.cancelWindowRef?.current &&
    refs.cancelWindowModeRef?.current === 'switch' &&
    (refs.cancelWindowExpiresAtRef?.current == null ||
      refs.cancelWindowExpiresAtRef.current > now);
  if (existingSwitchActive) {
    return;
  }
  const remaining = fullWindow
    ? CANCEL_WINDOW_MS
    : mode === 'switch'
      ? CANCEL_WINDOW_MS
      : cancelWindowRemainingMs(record);
  if (remaining == null || remaining <= 0) return;
  if (timerRef.current) clearTimeout(timerRef.current);
  const expiresAt = Date.now() + remaining;
  setCancelWindowMode(mode);
  setCancelWindow(true);
  setCancelWindowExpiresAt(expiresAt);
  if (refs?.cancelWindowRef) refs.cancelWindowRef.current = true;
  if (refs?.cancelWindowModeRef) refs.cancelWindowModeRef.current = mode;
  if (refs?.cancelWindowExpiresAtRef) refs.cancelWindowExpiresAtRef.current = expiresAt;
  timerRef.current = setTimeout(() => {
    disarmCancelWindow(
      timerRef,
      setCancelWindow,
      setCancelWindowMode,
      setCancelWindowExpiresAt,
      refs
    );
    onDisarm?.();
    onExpire?.();
  }, remaining);
}

export default function CurrentActivityCard({
  items,
  itemsLoading = false,
  pageReady = false,
  refreshKey = 0,
  isRecordDeleted,
  userTools,
  toolsLoading,
  onToolsChange,
  onActivitySwitch,
  onRecordAdded,
  onRecordDeleted,
  onFallbackRefresh,
  onItemsChanged,
  onItemCreated,
  onCreateError,
  onError,
  todayRecords = [],
  todayDate,
  quickSwitchRecords = [],
  tags = [],
  onPlanComplete,
  onPlanPriorityChange,
  onTagCreated,
  userRules = [],
  onRecordPatched,
  onSessionAction,
  onAiEnhanceStart,
  onAiEnhanceEnd,
  onNewItemSuggested,
  onInlineSwitch,
  drawerExpanded = false,
  onDrawerExpandedChange,
}: CurrentActivityCardProps) {
  const session = useActivitySession();
  const publishActivity = useCallback(
    (act: TetoRecord | null) => {
      session.publishActivity(act);
    },
    [session]
  );
  const [activity, setActivity] = useState<TetoRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelWindow, setCancelWindow] = useState(false);
  const [cancelWindowMode, setCancelWindowMode] = useState<CancelWindowMode | null>(null);
  const [cancelWindowExpiresAt, setCancelWindowExpiresAt] = useState<number | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchGenRef = useRef(0);
  const canceledSwitchGensRef = useRef<Set<number>>(new Set());
  const canceledOptimisticIdsRef = useRef<Set<string>>(new Set());
  /** 已被更新一代 switch 取代的服务端孤儿记录，拒绝再 sync 回 UI */
  const supersededSwitchRecordIdsRef = useRef<Set<string>>(new Set());
  const canceledSwitchRestoreRef = useRef<TetoRecord | null>(null);
  const switchUndoStackRef = useRef<SwitchUndoFrame[]>([]);
  const blockSegmentPopRef = useRef<(() => void) | null>(null);
  const blockSegmentAppendRef = useRef<
    ((label: string, startMs?: number, meta?: BlockTimelineSegmentMeta) => void) | null
  >(null);
  const blockSegmentUpdateRef = useRef<
    ((label: string, meta?: BlockTimelineSegmentMeta) => void) | null
  >(null);
  const blockSegmentResetRef = useRef<(() => void) | null>(null);
  const blockSegmentsRestoreRef = useRef<
    ((segments: BlockTimelineSegment[]) => void) | null
  >(null);
  const blockSegmentsGetterRef = useRef<(() => BlockTimelineSegment[]) | null>(null);
  const blockAttributionConfirmRef = useRef<(() => void) | null>(null);
  const blockAttributionResetRef = useRef<
    ((opts?: {
      activity?: TetoRecord;
      segmentMeta?: BlockTimelineSegmentMeta | null;
    }) => void) | null
  >(null);
  const blockSessionSubItemTitlesRef = useRef(new Map<string, string>());
  const [blockSessionSubItemTitles, setBlockSessionSubItemTitles] = useState(
    () => new Map<string, string>()
  );
  const rememberBlockSubItemTitle = useCallback(
    (subItemId: string | null | undefined, title: string | null | undefined) => {
      if (!subItemId || !title?.trim()) return;
      const trimmed = title.trim();
      blockSessionSubItemTitlesRef.current.set(subItemId, trimmed);
      setBlockSessionSubItemTitles((prev) => {
        if (prev.get(subItemId) === trimmed) return prev;
        const next = new Map(prev);
        next.set(subItemId, trimmed);
        return next;
      });
    },
    []
  );
  const patchAttributionGenRef = useRef(0);
  const cancelWindowRef = useRef(false);
  const cancelWindowModeRef = useRef<CancelWindowMode | null>(null);
  const cancelWindowExpiresAtRef = useRef<number | null>(null);
  const cancelWindowSyncRefs = useMemo(
    () => ({
      cancelWindowRef,
      cancelWindowModeRef,
      cancelWindowExpiresAtRef,
    }),
    []
  );
  const hadActivityRef = useRef(false);
  const lockRestoreAttemptedRef = useRef(false);
  const lockedBlockCategoryIdRef = useRef<string | null>(null);
  const [categorySwitchOpen, setCategorySwitchOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'start' | 'switch' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachText, setAttachText] = useState('');
  const [attachType, setAttachType] = useState<AttachType>('想法');
  const [attachSubmitting, setAttachSubmitting] = useState(false);
  const [idleContent, setIdleContent] = useState('');
  const [idleMode, setIdleMode] = useState<IdleMode>('发生');
  const [idleContext, setIdleContext] = useState<ActivityContextValue>(EMPTY_ACTIVITY_CONTEXT);
  const [idleSubItemsCount, setIdleSubItemsCount] = useState(0);
  const handleIdleSubItemsLoaded = useCallback((subs: import('@/types/teto').SubItem[]) => {
    setIdleSubItemsCount(subs.length);
  }, []);
  const [idleToolLabel, setIdleToolLabel] = useState('');
  const [idleMood, setIdleMood] = useState<string | null>(null);
  const [idleTagIds, setIdleTagIds] = useState<string[]>([]);
  const [idleActionTagId, setIdleActionTagId] = useState<string | null>(null);
  const [idlePlanPriority, setIdlePlanPriority] = useState<PlanPriority | null>(null);
  const [idleCost, setIdleCost] = useState<number | null>(null);
  const [idleLocation, setIdleLocation] = useState('');
  const [idleSubmitting, setIdleSubmitting] = useState(false);
  const [contextManualOverride, setContextManualOverride] = useState(false);
  const contextManualOverrideRef = useRef(false);
  contextManualOverrideRef.current = contextManualOverride;
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [lockedBlockCategoryId, setLockedBlockCategoryId] = useState<string | null>(null);
  lockedBlockCategoryIdRef.current = lockedBlockCategoryId;
  const [stopSummaryOpen, setStopSummaryOpen] = useState(false);
  const [panelInitialContent, setPanelInitialContent] = useState('');
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const activityInitializedRef = useRef(false);
  const enteringBlockRef = useRef(false);
  const enterBlockGenRef = useRef(0);
  const blockCancelInFlightRef = useRef(false);
  const activityRef = useRef<TetoRecord | null>(null);
  activityRef.current = activity;
  const subItemTitleRecords = useMemo(() => {
    const merged = [...todayRecords];
    if (activity && !merged.some((r) => r.id === activity.id)) merged.push(activity);
    return merged;
  }, [todayRecords, activity]);
  const subItemTitles = useSubItemTitlesFromRecords(subItemTitleRecords);
  const subItemTitlesRef = useRef(subItemTitles);
  subItemTitlesRef.current = subItemTitles;
  /** 块时间会话内 activity 瞬时为空时仍保持抽屉/面板挂载 */
  const blockActivitySnapshotRef = useRef<TetoRecord | null>(null);
  if (activity && lockedBlockCategoryIdRef.current) {
    blockActivitySnapshotRef.current = activity;
  }
  if (!activity && !lockedBlockCategoryIdRef.current) {
    blockActivitySnapshotRef.current = null;
  }
  const panelActivity =
    activity ??
    (lockedBlockCategoryIdRef.current ? blockActivitySnapshotRef.current : null);

  const clearBlockSessionState = useCallback(() => {
    lockedBlockCategoryIdRef.current = null;
    setLockedBlockCategoryId(null);
    blockActivitySnapshotRef.current = null;
    blockSessionSubItemTitlesRef.current = new Map();
    setBlockSessionSubItemTitles(new Map());
    blockSegmentResetRef.current?.();
    clearLockedBlockCategory();
    clearStoredBlockSegments();
  }, []);

  const isBlockAttributionGraceActive = useCallback(() => {
    return (
      cancelWindowRef.current &&
      Boolean(lockedBlockCategoryIdRef.current) &&
      (cancelWindowExpiresAtRef.current == null ||
        cancelWindowExpiresAtRef.current > Date.now())
    );
  }, []);

  const applyIdleContextFromRecord = useCallback(
    (record: Pick<TetoRecord, 'item_id' | 'sub_item_id' | 'tags'>) => {
      if (!record.item_id) {
        setIdleContext(EMPTY_ACTIVITY_CONTEXT);
        setIdleActionTagId(null);
        return;
      }
      setIdleContext(
        resolveActivityContextFromRecord(
          items,
          record.item_id,
          record.sub_item_id
        ) as ActivityContextValue
      );
      const fnTag = record.tags?.find((t) => t.type === 'function');
      setIdleActionTagId(fnTag?.id ?? null);
    },
    [items]
  );

  const resolveEffectiveIdleContext = useCallback(
    (context: ActivityContextValue, text: string): ActivityContextValue => {
      if (resolveTargetItemId(context)) return context;
      const ruleItemId = text.trim() ? matchByUserRules(text, userRules) : null;
      if (!ruleItemId) return context;
      return resolveActivityContextFromRecord(items, ruleItemId) as ActivityContextValue;
    },
    [items, userRules]
  );

  const runAiEnhance = useCallback(
    (recordId: string, inputText: string, date: string, existingItemId?: string | null) => {
      if (!inputText.trim()) return;
      onAiEnhanceStart?.(recordId);
      void triggerAiEnhance({
        recordId,
        inputText,
        date,
        items,
        userRules,
        existingItemId,
        onFieldsUpdated: (_patch, updated) => {
          onAiEnhanceEnd?.(recordId);
          if (updated) onRecordPatched?.(updated);
        },
        onError: () => onAiEnhanceEnd?.(recordId),
        onNewItemSuggested,
      });
    },
    [items, userRules, onAiEnhanceStart, onAiEnhanceEnd, onRecordPatched, onNewItemSuggested]
  );

  const fetchCurrent = useCallback(async () => {
    try {
      if (blockCancelInFlightRef.current) return;
      if (hasPendingActivitySwitch()) {
        const settled = await waitForPendingActivitySwitch();
        if (settled) {
          setActivity(settled);
          publishActivity(settled);
          return;
        }
      }
      const res = await fetch('/api/v2/activities/current');
      const data = await res.json();
      const act = data.data ?? null;
      if (hasPendingActivitySwitch()) {
        const settled = await waitForPendingActivitySwitch();
        if (settled) {
          setActivity(settled);
          publishActivity(settled);
        }
        return;
      }
      if (!act && isActiveTimingRecord(activityRef.current)) {
        if (lockedBlockCategoryIdRef.current || loadLockedBlockCategory()) {
          return;
        }
      }
      setActivity(act);
      publishActivity(act);
    } catch {
      if (!hasPendingActivitySwitch()) {
        setActivity(null);
        publishActivity(null);
      }
    } finally {
      setLoading(false);
    }
  }, [publishActivity]);

  const resolveActivityRecordId = async (act: TetoRecord): Promise<string | null> =>
    resolveActivityRecordIdClient(act);

  const expireSwitchUndo = useCallback(() => {
    switchUndoStackRef.current = clearSwitchUndoStack();
  }, []);

  useEffect(() => {
    cancelWindowRef.current = cancelWindow;
    cancelWindowModeRef.current = cancelWindowMode;
    cancelWindowExpiresAtRef.current = cancelWindowExpiresAt;
  }, [cancelWindow, cancelWindowMode, cancelWindowExpiresAt]);

  /** 撤销窗口结束（到期或手动关闭）时解除按钮 loading，避免 5 秒边界 UI 闪动 */
  const handleCancelWindowDisarm = useCallback(() => {
    setActionLoading(false);
    setStopSubmitting(false);
  }, []);

  useEffect(() => {
    if (refreshKey > 0) {
      void fetchCurrent();
      return;
    }
    if (!pageReady) return;
    if (!activityInitializedRef.current) {
      activityInitializedRef.current = true;
      const initial = session.activity;
      setActivity(initial);
      setLoading(false);
      const resumedBlock =
        Boolean(session.state.lockedCategoryId ?? loadLockedBlockCategory()) &&
        Boolean(initial && isActiveTimingRecord(initial));
      if (!resumedBlock) {
        armCancelWindow(
          'start',
          initial,
          cancelTimerRef,
          setCancelWindow,
          setCancelWindowMode,
          setCancelWindowExpiresAt,
          expireSwitchUndo,
          handleCancelWindowDisarm,
          false,
          cancelWindowSyncRefs
        );
      }
    }
  }, [
    refreshKey,
    pageReady,
    session.activity,
    session.state.lockedCategoryId,
    fetchCurrent,
    expireSwitchUndo,
    handleCancelWindowDisarm,
  ]);

  useEffect(() => {
    if (blockCancelInFlightRef.current || hasPendingActivitySwitch()) return;
    const next = session.activity;
    const prev = activityRef.current;
    if (next?.id === prev?.id && next === prev) return;
    if (!next && lockedBlockCategoryIdRef.current && prev && isActiveTimingRecord(prev)) {
      return;
    }
    if (next !== prev) {
      setActivity(next);
      setLoading(false);
    }
  }, [session.activity, session.state.sessionGen]);

  useLayoutEffect(() => {
    if (!isRecordDeleted) return;
    const local = activityRef.current;
    if (!local?.id || !isRecordDeleted(local.id)) return;
    disarmCancelWindow(
      cancelTimerRef,
      setCancelWindow,
      setCancelWindowMode,
      setCancelWindowExpiresAt,
      cancelWindowSyncRefs
    );
    switchUndoStackRef.current = clearSwitchUndoStack();
    patchAttributionGenRef.current += 1;
    if (lockedBlockCategoryIdRef.current) {
      clearBlockSessionState();
    }
    setActivity(null);
    publishActivity(null);
  }, [isRecordDeleted, publishActivity, clearBlockSessionState, session.state.tombstones.length]);

  useEffect(() => {
    if (activity) {
      hadActivityRef.current = true;
      return;
    }
    if (hasPendingActivitySwitch()) return;
    // 块时间：activity 瞬时为空时不卸锁、不收起（仅显式停止/取消时清理）
    if (lockedBlockCategoryIdRef.current || loadLockedBlockCategory()) return;
    if (
      blockActivitySnapshotRef.current &&
      isActiveTimingRecord(blockActivitySnapshotRef.current)
    ) {
      return;
    }
    switchUndoStackRef.current = clearSwitchUndoStack();
    disarmCancelWindow(
      cancelTimerRef,
      setCancelWindow,
      setCancelWindowMode,
      setCancelWindowExpiresAt,
      cancelWindowSyncRefs
    );
    setLockedBlockCategoryId(null);
    // 仅在会话真正结束时清理持久化的大类锁定（避免挂载初期误清）
    if (hadActivityRef.current) {
      hadActivityRef.current = false;
      clearLockedBlockCategory();
    }
  }, [activity]);

  /** 块时间：activity 被误同步为 null 时从快照恢复，避免抽屉卸载 */
  useEffect(() => {
    if (activity) return;
    if (blockCancelInFlightRef.current) return;
    if (!lockedBlockCategoryIdRef.current && !loadLockedBlockCategory()) return;
    const snap = blockActivitySnapshotRef.current;
    if (!snap || !isActiveTimingRecord(snap)) return;
    if (isRecordDeleted?.(snap.id)) return;
    setActivity(snap);
    publishActivity(snap);
  }, [activity, lockedBlockCategoryId, publishActivity, isRecordDeleted, session.state.tombstones.length]);

  // 刷新后恢复块时间大类锁定：当前活动的 L1 与存储值一致时恢复
  useEffect(() => {
    if (lockRestoreAttemptedRef.current) return;
    if (!activity?.item_id || items.length === 0) return;
    lockRestoreAttemptedRef.current = true;
    if (lockedBlockCategoryIdRef.current) return;
    const stored = loadLockedBlockCategory();
    if (!stored) return;
    const ctx = resolveActivityContextFromRecord(items, activity.item_id, activity.sub_item_id);
    if (ctx.categoryItemId === stored || activity.item_id === stored) {
      setLockedBlockCategoryId(stored);
    } else {
      clearLockedBlockCategory();
    }
  }, [activity, items]);

  useEffect(() => {
    if (noteOpen) setTimeout(() => noteRef.current?.focus(), 50);
  }, [noteOpen]);

  useEffect(() => {
    const saved = loadLastActivityContext();
    if (!saved?.itemId && !saved?.categoryItemId) return;
    setIdleContext((prev) => (resolveTargetItemId(prev) ? prev : saved as ActivityContextValue));
  }, []);

  const finalizeStop = (opts?: {
    result?: string;
    splitNoteAsIdea?: boolean;
    noteText?: string;
    metricName?: string;
    metricValue?: number;
    metricUnit?: string;
    energy?: string;
    bodyState?: string;
    paymentSource?: string;
    nextStep?: string;
  }) => {
    if (!activity) return;
    const now = new Date().toISOString();
    const prevActivity = activity;
    const segmentsSnapshot =
      blockSegmentsGetterRef.current?.() ??
      loadStoredBlockSegments()?.segments ??
      [];
    const lockedCategorySnapshot =
      lockedBlockCategoryIdRef.current ?? loadLockedBlockCategory();
    const splitOnStop = shouldSplitBlockSessionOnStop(segmentsSnapshot);
    const stoppedSnapshots = splitOnStop
      ? buildOptimisticStoppedFromBlockSegments(
          prevActivity,
          segmentsSnapshot,
          now,
          lockedCategorySnapshot
        )
      : [buildStoppedSnapshot(prevActivity, now)];

    disarmCancelWindow(
      cancelTimerRef,
      setCancelWindow,
      setCancelWindowMode,
      setCancelWindowExpiresAt,
      cancelWindowSyncRefs
    );
    switchUndoStackRef.current = clearSwitchUndoStack();
    clearBlockSessionState();
    blockActivitySnapshotRef.current = null;
    setActivity(null);
    onActivitySwitch({ record: null, stopped: stoppedSnapshots });
    setStopSummaryOpen(false);
    onDrawerExpandedChange?.(false);
    const lastStopped = stoppedSnapshots[stoppedSnapshots.length - 1];
    if (lastStopped) {
      applyIdleContextFromRecord(lastStopped);
    }

    void (async () => {
      markActivitySwitchPending();
      try {
        const capturePatch: Record<string, unknown> = {};
        if (prevActivity.mood) capturePatch.mood = prevActivity.mood;
        if (prevActivity.location?.trim()) capturePatch.location = prevActivity.location.trim();
        if (prevActivity.body_state) capturePatch.body_state = prevActivity.body_state;
        const cost = prevActivity.cost != null && prevActivity.cost > 0 ? prevActivity.cost : null;
        if (cost != null && cost > 0) {
          capturePatch.cost = cost;
          capturePatch.money_direction = 'expense';
          capturePatch.money_currency = 'CNY';
        }
        if (prevActivity.item_id) {
          capturePatch.item_id = prevActivity.item_id;
          capturePatch.sub_item_id = prevActivity.sub_item_id ?? null;
          capturePatch.phase_id = prevActivity.phase_id ?? null;
          capturePatch.review_status = 'confirmed';
        }
        if (opts?.result?.trim()) capturePatch.result = opts.result.trim();
        if (opts?.metricValue != null && !Number.isNaN(opts.metricValue)) {
          capturePatch.metric_value = opts.metricValue;
          if (opts.metricUnit?.trim()) capturePatch.metric_unit = opts.metricUnit.trim();
          if (opts.metricName?.trim()) capturePatch.metric_name = opts.metricName.trim();
        }
        if (opts?.energy) capturePatch.energy = opts.energy;
        if (opts?.bodyState) capturePatch.body_state = opts.bodyState;
        if (opts?.paymentSource && cost != null && cost > 0) {
          capturePatch.tool_label = opts.paymentSource;
        }

        if (splitOnStop) {
          const stopRes = await fetch('/api/v2/activities/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const stopData = await stopRes.json();
          if (!stopRes.ok) {
            throw new Error(stopData.error?.message ?? '停止失败');
          }

          const segmentCapture = { ...capturePatch };
          delete segmentCapture.item_id;
          delete segmentCapture.sub_item_id;
          delete segmentCapture.phase_id;
          const stopped = await persistBlockSessionSegments(
            prevActivity,
            segmentsSnapshot,
            now,
            resolveActivityRecordId,
            segmentCapture,
            lockedCategorySnapshot
          );
          onActivitySwitch({ record: null, stopped });
          notifyUnassignedRefresh();
          if (stopped.length > 0) {
            applyIdleContextFromRecord(stopped[stopped.length - 1]);
          }
          if (opts?.splitNoteAsIdea && opts.noteText?.trim() && stopped[0]) {
            try {
              const idea = await postManualRecord({
                content: opts.noteText.trim(),
                type: '想法',
                date: todayDateStr(),
                item_id: stopped[0].item_id ?? undefined,
                sub_item_id: stopped[0].sub_item_id ?? null,
                phase_id: stopped[0].phase_id ?? null,
                input_source: 'manual',
                review_status: 'confirmed',
                lifecycle_status: 'completed',
              });
              onRecordAdded?.(idea);
            } catch {
              /* 不影响主停止流程 */
            }
          }
          if (opts?.nextStep?.trim() && stopped[0]) {
            try {
              const plan = await postManualRecord({
                content: opts.nextStep.trim(),
                type: '计划',
                date: todayDateStr(),
                item_id: stopped[0].item_id ?? undefined,
                sub_item_id: stopped[0].sub_item_id ?? null,
                phase_id: stopped[0].phase_id ?? null,
                input_source: 'manual',
                review_status: 'confirmed',
                lifecycle_status: 'active',
              });
              onRecordAdded?.(plan);
            } catch {
              /* 不影响主停止流程 */
            }
          }
          settleActivitySwitch(null);
          return;
        }

        const stopRes = await fetch('/api/v2/activities/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const stopData = await stopRes.json();
        if (!stopRes.ok) {
          throw new Error(stopData.error?.message ?? '停止失败');
        }

        const switchPayload = stopData.data as ActivitySwitchPayload;
        let stopped = switchPayload.stopped[0];

        if (stopped && Object.keys(capturePatch).length > 0) {
          const patchRes = await fetch(`/api/v2/records/${stopped.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(capturePatch),
          });
          const patchData = await patchRes.json();
          if (!patchRes.ok) {
            throw new Error(patchData.error?.message ?? '保存补充信息失败');
          }
          stopped = patchData.data ?? stopped;
        }

        onActivitySwitch({
          record: null,
          stopped: stopped ? [stopped] : switchPayload.stopped,
        });
        notifyUnassignedRefresh();

        if (opts?.splitNoteAsIdea && opts.noteText?.trim() && stopped) {
          try {
            const idea = await postManualRecord({
              content: opts.noteText.trim(),
              type: '想法',
              date: todayDateStr(),
              item_id: stopped.item_id ?? undefined,
              sub_item_id: stopped.sub_item_id ?? null,
              phase_id: stopped.phase_id ?? null,
              input_source: 'manual',
              review_status: 'confirmed',
              lifecycle_status: 'completed',
            });
            onRecordAdded(idea, false);
          } catch {
            /* 笔记拆分失败不阻断主流程 */
          }
        }

        if (opts?.nextStep && stopped) {
          try {
            const today = todayDateStr();
            const plan = await postManualRecord({
              content: opts.nextStep,
              type: '计划',
              date: today,
              item_id: stopped.item_id ?? undefined,
              sub_item_id: stopped.sub_item_id ?? null,
              phase_id: stopped.phase_id ?? null,
              time_anchor_date: today,
              input_source: 'manual',
              review_status: 'confirmed',
              lifecycle_status: 'active',
            });
            onRecordAdded(plan, false);
          } catch {
            /* 下一步计划创建失败不阻断主流程 */
          }
        }
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '停止失败，请重试');
      } finally {
        settleActivitySwitch(null);
      }
    })();
  };

  const postSwitch = async (payload: {
    content?: string;
    item_id?: string | null;
    sub_item_id?: string | null;
    sub_item_title?: string | null;
    phase_id?: string | null;
    tool_label?: string | null;
    tag_ids?: string[];
    action_text?: string | null;
    start_paused?: boolean;
    /** 大类切换等：虽非 idle 进入，仍需开启 5 秒撤销窗口 */
    forceCancelWindow?: boolean;
  }) => {
    const today = todayDateStr();
    switchGenRef.current += 1;
    patchAttributionGenRef.current += 1;
    const gen = switchGenRef.current;
    canceledSwitchRestoreRef.current = null;
    markActivitySwitchPending();
    const optimistic = buildOptimisticActiveRecord({
      content: payload.content,
      item_id: payload.item_id,
      sub_item_id: payload.sub_item_id,
      phase_id: payload.phase_id,
      tool_label: payload.tool_label,
      tag_ids: payload.tag_ids,
      action_text: payload.action_text ?? null,
      tags,
      items,
      date: today,
      start_paused: payload.start_paused,
    });
    const priorActivity = activity ?? null;
    const isFreshStart = !priorActivity;
    const isBlockSwitch =
      !isFreshStart &&
      !!lockedBlockCategoryIdRef.current &&
      payload.forceCancelWindow !== true;
    if (isBlockSwitch && priorActivity?.occurred_at) {
      const nextItemId =
        payload.item_id !== undefined ? payload.item_id : priorActivity.item_id;
      const nextSubId =
        payload.sub_item_id !== undefined
          ? payload.sub_item_id
          : priorActivity.sub_item_id ?? null;
      const sameItemContext =
        nextItemId === priorActivity.item_id &&
        (nextSubId ?? null) === (priorActivity.sub_item_id ?? null);
      if (sameItemContext) {
        optimistic.occurred_at = priorActivity.occurred_at;
        optimistic.paused_at = priorActivity.paused_at ?? null;
        optimistic.paused_total_seconds = priorActivity.paused_total_seconds ?? 0;
        optimistic.session_state = priorActivity.session_state ?? 'running';
      }
    }
    const shouldArmStartCancel = isFreshStart || payload.forceCancelWindow === true;
    onActivitySwitch({
      record: optimistic,
      stopped: priorActivity ? [buildStoppedSnapshot(priorActivity)] : [],
    });
    setActivity(optimistic);
    publishActivity(optimistic);
    // 父级由 onActivitySwitch → applyActivitySwitch 同步
    setActionLoading(false);
    setStopSubmitting(false);
    const nextItemId =
      payload.item_id !== undefined ? payload.item_id : priorActivity?.item_id ?? null;
    const nextSubId =
      payload.sub_item_id !== undefined
        ? payload.sub_item_id
        : priorActivity?.sub_item_id ?? null;
    const isBlockItemContextChange =
      isBlockSwitch &&
      !!priorActivity &&
      (nextItemId !== priorActivity.item_id ||
        (nextSubId ?? null) !== (priorActivity.sub_item_id ?? null));

    if (isBlockSwitch && priorActivity) {
      if (isBlockItemContextChange && lockedBlockCategoryIdRef.current) {
        const segmentsBefore = blockSegmentsGetterRef.current?.() ?? [];
        rememberBlockSubItemTitle(
          optimistic.sub_item_id,
          payload.sub_item_title ?? extractSwitchLabel(optimistic.content)
        );
        const subItemTitlesMap = resolveBlockSessionSubItemTitles(optimistic.sub_item_id, {
          patchSubItemTitle: payload.sub_item_title,
          recordSubItemTitles: subItemTitlesRef.current,
          sessionSubItemTitles: blockSessionSubItemTitlesRef.current,
          blockSegments: segmentsBefore,
        });
        blockSegmentAppendRef.current?.(
          buildBlockSegmentLabel(
            items,
            optimistic,
            optimistic.action_text ?? undefined,
            subItemTitlesMap
          ),
          Date.now(),
          segmentMetaFromActivity(optimistic)
        );
        switchUndoStackRef.current = pushSwitchUndoFrame(
          switchUndoStackRef.current,
          {
            previousActivity: { ...priorActivity },
            attributionOnly: true,
            blockSegmentAppended: true,
            blockSegmentsSnapshot:
              segmentsBefore.length > 0 ? [...segmentsBefore] : undefined,
          }
        );
        blockAttributionConfirmRef.current?.();
      } else {
        switchUndoStackRef.current = pushSwitchUndoFrame(
          switchUndoStackRef.current,
          { previousActivity: { ...priorActivity }, attributionOnly: true }
        );
      }
      armCancelWindow(
        'switch',
        optimistic,
        cancelTimerRef,
        setCancelWindow,
        setCancelWindowMode,
        setCancelWindowExpiresAt,
        expireSwitchUndo,
        handleCancelWindowDisarm,
        true,
        cancelWindowSyncRefs
      );
    } else if (shouldArmStartCancel) {
      switchUndoStackRef.current = clearSwitchUndoStack();
      armCancelWindow(
        'start',
        optimistic,
        cancelTimerRef,
        setCancelWindow,
        setCancelWindowMode,
        setCancelWindowExpiresAt,
        expireSwitchUndo,
        handleCancelWindowDisarm,
        false,
        cancelWindowSyncRefs
      );
    } else {
      switchUndoStackRef.current = clearSwitchUndoStack();
      disarmCancelWindow(
        cancelTimerRef,
        setCancelWindow,
        setCancelWindowMode,
        setCancelWindowExpiresAt,
        cancelWindowSyncRefs
      );
    }

    try {
      const res = await fetch('/api/v2/activities/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error?.message ?? '操作失败');
      }
      const data = d.data as ActivitySwitchPayload;
      let finalRecord = data.record;
      if (finalRecord && optimistic.occurred_at) {
        if (!finalRecord.occurred_at) {
          finalRecord = { ...finalRecord, occurred_at: optimistic.occurred_at };
        } else {
          const optMs = Date.parse(optimistic.occurred_at);
          const srvMs = Date.parse(finalRecord.occurred_at);
          if (Number.isFinite(optMs) && Number.isFinite(srvMs) && srvMs > optMs) {
            finalRecord = { ...finalRecord, occurred_at: optimistic.occurred_at };
          }
        }
      }
      if (payload.action_text?.trim() && finalRecord?.id && !isOptimisticRecordId(finalRecord.id)) {
        try {
          const patchRes = await fetch(`/api/v2/records/${finalRecord.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action_text: payload.action_text.trim() }),
          });
          const patchData = await patchRes.json();
          if (patchRes.ok && patchData.data) {
            finalRecord = preserveActiveTimingSnapshot(
              patchData.data as TetoRecord,
              finalRecord ?? optimistic
            );
          }
        } catch {
          /* action_text 补丁失败不阻断主流程 */
        }
      }
      const merged = { ...data, record: finalRecord };
      if (gen !== switchGenRef.current) {
        const wasCanceled = canceledSwitchGensRef.current.delete(gen);
        if (blockCancelInFlightRef.current) {
          if (wasCanceled && finalRecord?.id && !isOptimisticRecordId(finalRecord.id)) {
            try {
              const delRes = await fetch(`/api/v2/records/${finalRecord.id}`, { method: 'DELETE' });
              if (delRes.ok) onRecordDeleted?.(finalRecord.id);
            } catch {
              /* ignore */
            }
          }
          settleActivitySwitch(null);
          return merged;
        }
        if (wasCanceled && finalRecord?.id && !isOptimisticRecordId(finalRecord.id)) {
          try {
            const delRes = await fetch(`/api/v2/records/${finalRecord.id}`, { method: 'DELETE' });
            if (delRes.ok) onRecordDeleted?.(finalRecord.id);
          } catch (e) {
          }
          const restoredForSettle = canceledSwitchRestoreRef.current ?? activityRef.current ?? null;
          if (restoredForSettle) {
            setActivity(restoredForSettle);
            publishActivity(restoredForSettle);
          }
          settleActivitySwitch(restoredForSettle);
        } else {
          const undo = peekSwitchUndoFrame(switchUndoStackRef.current);
          let resolvedAsUndoPrevious = false;
          if (
            finalRecord &&
            undo?.previousActivity &&
            isOptimisticRecordId(undo.previousActivity.id) &&
            !isOptimisticRecordId(finalRecord.id) &&
            finalRecord.item_id === undo.previousActivity.item_id
          ) {
            const previous = undo.previousActivity;
            const resolvedPrevious = preserveActiveTimingSnapshot(
              {
                ...finalRecord,
                item_id: previous.item_id,
                sub_item_id: previous.sub_item_id,
                tags: previous.tags,
                action_text: previous.action_text,
                content: previous.content,
                item: previous.item ?? finalRecord.item,
              },
              previous
            );
            switchUndoStackRef.current = [
              ...switchUndoStackRef.current.slice(0, -1),
              {
                ...undo,
                previousActivity: resolvedPrevious,
              },
            ];
            resolvedAsUndoPrevious = true;
            supersededSwitchRecordIdsRef.current.delete(finalRecord.id);
          }
          if (!resolvedAsUndoPrevious) {
            const localActivity = activityRef.current;
            const restoreTargetId =
              (canceledSwitchRestoreRef.current as TetoRecord | null)?.id ?? null;
            const undoPrevId =
              peekSwitchUndoFrame(switchUndoStackRef.current)?.previousActivity?.id ?? null;
            const staleRecordId = finalRecord?.id ?? null;
            const isProtectedUndoTarget =
              Boolean(staleRecordId) &&
              (staleRecordId === restoreTargetId ||
                (staleRecordId === undoPrevId &&
                  undoPrevId &&
                  !isOptimisticRecordId(undoPrevId)));
            if (
              staleRecordId &&
              !isOptimisticRecordId(staleRecordId) &&
              !isProtectedUndoTarget &&
              localActivity &&
              localActivity.id !== staleRecordId
            ) {
              supersededSwitchRecordIdsRef.current.add(staleRecordId);
              try {
                const delRes = await fetch(`/api/v2/records/${staleRecordId}`, {
                  method: 'DELETE',
                });
                if (delRes.ok) onRecordDeleted?.(staleRecordId);
              } catch (e) {
              }
            }
          }
          settleActivitySwitch(activityRef.current ?? null);
        }
        return merged;
      }
      if (blockCancelInFlightRef.current) {
        settleActivitySwitch(null);
        return merged;
      }
      onActivitySwitch(merged);
      const localRecord = activityRef.current ?? optimistic;
      const inBlockGrace =
        Boolean(lockedBlockCategoryIdRef.current) &&
        cancelWindowRef.current &&
        (cancelWindowExpiresAtRef.current == null ||
          cancelWindowExpiresAtRef.current > Date.now());
      const preserveLocalAttribution = Boolean(
        finalRecord && (isBlockSwitch || inBlockGrace)
      );
      const serverRecord =
        finalRecord && preserveLocalAttribution
          ? {
              ...finalRecord,
              item_id: localRecord.item_id,
              sub_item_id: localRecord.sub_item_id,
              tags: localRecord.tags,
              action_text: localRecord.action_text,
              content: localRecord.content,
              item: localRecord.item ?? finalRecord.item,
            }
          : finalRecord;
      const syncedRecord = serverRecord
        ? preserveActiveTimingSnapshot(serverRecord, localRecord)
        : null;
      if (blockCancelInFlightRef.current) {
        settleActivitySwitch(null);
        return merged;
      }
      setActivity(syncedRecord);
      publishActivity(syncedRecord ?? null);
      settleActivitySwitch(syncedRecord);
      if (isBlockSwitch && priorActivity) {
        const existingUndo = peekSwitchUndoFrame(switchUndoStackRef.current);
        if (existingUndo) {
          switchUndoStackRef.current = [
            ...switchUndoStackRef.current.slice(0, -1),
            {
              ...existingUndo,
              previousActivity: { ...priorActivity },
              blockSegmentAppended:
                existingUndo.blockSegmentAppended || isBlockItemContextChange,
              blockSegmentsSnapshot:
                existingUndo.blockSegmentsSnapshot ??
                (blockSegmentsGetterRef.current?.()?.length
                  ? [...(blockSegmentsGetterRef.current?.() ?? [])]
                  : undefined),
            },
          ];
        }
        // 乐观阶段已 armCancelWindow，服务端返回不再重置倒计时
      } else if (shouldArmStartCancel && finalRecord) {
        const switchGraceAlreadyActive =
          cancelWindowRef.current &&
          cancelWindowModeRef.current === 'switch' &&
          (cancelWindowExpiresAtRef.current == null ||
            cancelWindowExpiresAtRef.current > Date.now());
        if (!switchGraceAlreadyActive && switchUndoStackRef.current.length === 0) {
          switchUndoStackRef.current = clearSwitchUndoStack();
          armCancelWindow(
            'start',
            finalRecord,
            cancelTimerRef,
            setCancelWindow,
            setCancelWindowMode,
            setCancelWindowExpiresAt,
            expireSwitchUndo,
            handleCancelWindowDisarm,
            false,
            cancelWindowSyncRefs
          );
        }
      }
      return merged;
    } catch (e) {
      settleActivitySwitch(null);
      if (blockCancelInFlightRef.current) {
        return null;
      }
      if (priorActivity) {
        setActivity(priorActivity);
        publishActivity(priorActivity);
        onActivitySwitch({ record: priorActivity, stopped: [] });
      } else {
        setActivity(null);
        publishActivity(null);
        onActivitySwitch({ record: null, stopped: [] });
      }
      disarmCancelWindow(
        cancelTimerRef,
        setCancelWindow,
        setCancelWindowMode,
        setCancelWindowExpiresAt,
        cancelWindowSyncRefs
      );
      switchUndoStackRef.current = clearSwitchUndoStack();
      throw e;
    } finally {
      setActionLoading(false);
    }
  };

  const handleSwitchUndo = useCallback(async () => {
    const { frame: undo, stack: remainingStack } = popSwitchUndoFrame(
      switchUndoStackRef.current
    );
    const deleting = activityRef.current;
    if (!undo || !deleting) {
      if (undo) {
        switchUndoStackRef.current = pushSwitchUndoFrame(remainingStack, undo);
      }
      return;
    }
    switchUndoStackRef.current = remainingStack;
    setActionLoading(false);
    setStopSubmitting(false);
    switchGenRef.current += 1;
    const revertSwitchGen = switchGenRef.current;
    patchAttributionGenRef.current += 1;
    const revertPatchGen = patchAttributionGenRef.current;
    disarmCancelWindow(
      cancelTimerRef,
      setCancelWindow,
      setCancelWindowMode,
      setCancelWindowExpiresAt,
      cancelWindowSyncRefs
    );

    const previous = undo.previousActivity;
    const inBlock = isBlockSessionLocked(lockedBlockCategoryIdRef.current);
    const useAttributionRevert =
      inBlock ||
      undo.attributionOnly === true ||
      deleting.id === previous.id;

    if (useAttributionRevert) {
      const segSnapshot = undo.blockSegmentsSnapshot;
      const restoredBase = buildRestoredActiveSnapshot(
        segSnapshot?.length
          ? buildBlockUndoSnapshotActivity(previous, segSnapshot, tags)
          : previous
      );
      let restored = preserveActiveTimingSnapshot(
        isOptimisticRecordId(deleting.id)
          ? restoredBase
          : {
              ...restoredBase,
              id: deleting.id,
            },
        deleting
      );
      const restoredItem = items.find((i) => i.id === restored.item_id);
      if (restoredItem) {
        restored = {
          ...restored,
          item: { id: restoredItem.id, title: restoredItem.title },
        };
      }
      activityRef.current = restored;
      supersededSwitchRecordIdsRef.current.delete(restored.id);
      if (undo.blockSegmentsSnapshot && undo.blockSegmentsSnapshot.length > 0) {
        blockSegmentsRestoreRef.current?.(undo.blockSegmentsSnapshot);
      } else if (undo.blockSegmentAppended) {
        blockSegmentPopRef.current?.();
      } else {
        const subItemTitlesMap = resolveBlockSegmentSubItemTitles(restored.sub_item_id, {
          subItemTitle: extractSwitchLabel(restored.content),
          subItemTitles: subItemTitlesRef.current,
        });
        blockSegmentUpdateRef.current?.(
          buildBlockSegmentLabel(
            items,
            restored,
            restored.action_text ?? undefined,
            subItemTitlesMap
          ),
          {
            item_id: restored.item_id,
            sub_item_id: restored.sub_item_id ?? null,
            action_text: restored.action_text ?? null,
            tag_ids:
              restored.tags?.filter((t) => t.type === 'function').map((t) => t.id) ?? undefined,
          }
        );
      }
      setActivity(restored);
      publishActivity(restored);
      onRecordPatched?.(restored);
      blockAttributionResetRef.current?.({
        activity: restored,
        segmentMeta: undo.blockSegmentsSnapshot?.length
          ? resolveOpenBlockSegmentMeta(undo.blockSegmentsSnapshot)
          : {
              item_id: restored.item_id,
              sub_item_id: restored.sub_item_id ?? null,
              action_text: restored.action_text ?? null,
              tag_ids:
                restored.tags?.filter((t) => t.type === 'function').map((t) => t.id) ?? undefined,
            },
      });
      settleActivitySwitch(restored);
      onDrawerExpandedChange?.(true);

      if (shouldRearmGraceAfterPop(switchUndoStackRef.current)) {
        armCancelWindow(
          'switch',
          restored,
          cancelTimerRef,
          setCancelWindow,
          setCancelWindowMode,
          setCancelWindowExpiresAt,
          expireSwitchUndo,
          handleCancelWindowDisarm,
          true,
          cancelWindowSyncRefs
        );
      }

      void (async () => {
        try {
          const recordId = await resolveActivityRecordIdClient(deleting);
          if (recordId && !isOptimisticRecordId(recordId)) {
            if (revertSwitchGen !== switchGenRef.current) return;
            if (
              activityRef.current?.id !== recordId &&
              activityRef.current?.id !== restored.id
            ) {
              return;
            }
            if (revertPatchGen !== patchAttributionGenRef.current) return;
            const fnTagIds =
              restored.tags?.filter((t) => t.type === 'function').map((t) => t.id) ?? [];
            const undoBody = ensureBlockAttributionPutBody(
              {
                tag_ids: fnTagIds,
                action_text: restored.action_text,
                content: restored.content,
              },
              {
                item_id: restored.item_id,
                sub_item_id: restored.sub_item_id ?? null,
              }
            );
            const res = await fetch(`/api/v2/records/${recordId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(undoBody),
            });
            const data = await res.json();
            if (!res.ok) return;
            if (revertSwitchGen !== switchGenRef.current) return;
            if (revertPatchGen !== patchAttributionGenRef.current) return;
            if (
              activityRef.current?.id !== recordId &&
              activityRef.current?.id !== restored.id
            ) {
              return;
            }
            if (data.data) {
              const synced = preserveActiveTimingSnapshot(
                {
                  ...(data.data as TetoRecord),
                  id: recordId,
                  item_id: restored.item_id,
                  sub_item_id: restored.sub_item_id,
                  tags: restored.tags?.length ? restored.tags : (data.data as TetoRecord).tags,
                  action_text: restored.action_text,
                  content: restored.content ?? (data.data as TetoRecord).content,
                  item: restored.item ?? (data.data as TetoRecord).item,
                },
                restored
              );
              activityRef.current = synced;
              setActivity(synced);
              publishActivity(synced);
              onRecordPatched?.(synced);
              blockAttributionConfirmRef.current?.();
            }
          }
          if (previous.item_id !== deleting.item_id) notifyUnassignedRefresh();
        } catch {
          /* 本地已撤销；后台同步失败不打扰用户 */
        }
      })();
      return;
    }

    const restored = buildRestoredActiveSnapshot(previous);
    const localDeleteId = deleting.id;
    canceledSwitchGensRef.current.add(revertSwitchGen);
    canceledSwitchRestoreRef.current = restored;
    if (isOptimisticRecordId(localDeleteId)) {
      canceledOptimisticIdsRef.current.add(localDeleteId);
    }

    setActionLoading(true);
    markActivitySwitchPending();
    activityRef.current = restored;
    supersededSwitchRecordIdsRef.current.delete(restored.id);
    setActivity(restored);
    publishActivity(restored);
    onActivitySwitch({
      record: restored,
      stopped: [],
      undoDeleteId: localDeleteId,
    });
    blockSegmentPopRef.current?.();

    try {
      const newRecordId = await resolveActivityRecordIdClient(deleting);
      if (newRecordId && !isOptimisticRecordId(newRecordId)) {
        const delRes = await fetch(`/api/v2/records/${newRecordId}`, { method: 'DELETE' });
        if (!delRes.ok) {
          const delData = await delRes.json().catch(() => ({}));
          if (!isRecordNotFoundApiError(delData, delRes.status)) {
            throw new Error(
              (delData as { error?: { message?: string } }).error?.message ??
                '删除误切换记录失败'
            );
          }
        }
        if (newRecordId !== localDeleteId) onRecordDeleted?.(newRecordId);
      } else {
        onRecordDeleted?.(localDeleteId);
      }

      if (!isOptimisticRecordId(previous.id)) {
        const fnTagIds =
          restored.tags?.filter((t) => t.type === 'function').map((t) => t.id) ?? [];
        const putRes = await fetch(`/api/v2/records/${previous.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lifecycle_status: 'active',
            occurred_at_end: null,
            duration_minutes: null,
            session_state: previous.session_state ?? 'running',
            paused_at: previous.paused_at ?? null,
            paused_total_seconds: previous.paused_total_seconds ?? 0,
            item_id: restored.item_id,
            sub_item_id: restored.sub_item_id ?? null,
            action_text: restored.action_text,
            tag_ids: fnTagIds,
            content: restored.content,
          }),
        });
        const putData = await putRes.json();
        if (!putRes.ok) {
          throw new Error(putData.error?.message ?? '恢复计时失败');
        }
        if (putData.data) {
          const serverRestored = preserveActiveTimingSnapshot(
            {
              ...(putData.data as TetoRecord),
              item_id: restored.item_id,
              sub_item_id: restored.sub_item_id,
              tags: restored.tags?.length ? restored.tags : (putData.data as TetoRecord).tags,
              action_text: restored.action_text,
              content: restored.content ?? (putData.data as TetoRecord).content,
              item: restored.item ?? (putData.data as TetoRecord).item,
            },
            restored
          );
          setActivity(serverRestored);
          publishActivity(serverRestored);
          onActivitySwitch({
            record: serverRestored,
            stopped: [],
            undoDeleteId: localDeleteId,
          });
        }
      }
      notifyUnassignedRefresh();
    } catch (e) {
      setActivity(deleting);
      publishActivity(deleting);
      onActivitySwitch({
        record: deleting,
        stopped: [buildStoppedSnapshot(previous)],
      });
      onError?.(e instanceof Error ? e.message : '撤销切换失败');
    } finally {
      switchUndoStackRef.current = clearSwitchUndoStack();
      settleActivitySwitch(restored);
      setActionLoading(false);
    }
  }, [
    items,
    tags,
    publishActivity,
    onActivitySwitch,
    onError,
    onRecordDeleted,
    onRecordPatched,
    expireSwitchUndo,
    handleCancelWindowDisarm,
    onDrawerExpandedChange,
  ]);

  const handleCancelActivity = useCallback(async () => {
    const currentActivity =
      activityRef.current ??
      activity ??
      blockActivitySnapshotRef.current;
    if (!currentActivity) return;

    const mode = cancelWindowModeRef.current ?? cancelWindowMode;
    const inBlock = Boolean(
      lockedBlockCategoryIdRef.current ?? loadLockedBlockCategory()
    );
    const graceActive = Boolean(
      cancelWindowRef.current &&
        (cancelWindowExpiresAtRef.current == null ||
          cancelWindowExpiresAtRef.current > Date.now())
    );

    const cancelRoute = resolveBlockCancelRoute({
      inBlock,
      graceActive,
      undoStackDepth: switchUndoStackRef.current.length,
      mode,
    });

    /** 块内标签切换撤销：有 undo 栈时 pop；无栈的 entry grace 走下方整段退出 */
    if (cancelRoute === 'switch_undo') {
      await handleSwitchUndo();
      onDrawerExpandedChange?.(true);
      return;
    }
    if (cancelRoute === 'disarm_only') {
      disarmCancelWindow(
        cancelTimerRef,
        setCancelWindow,
        setCancelWindowMode,
        setCancelWindowExpiresAt,
        cancelWindowSyncRefs
      );
      onDrawerExpandedChange?.(true);
      return;
    }

    // 进入块时间 grace 内取消：未改标签或仅 grace 内改标签 → 整段退出
    if (mode === 'start' || cancelRoute === 'entry_full') {
      const inflightGen = switchGenRef.current;
      canceledSwitchGensRef.current.add(inflightGen);
      blockCancelInFlightRef.current = true;
      switchGenRef.current += 1;
      patchAttributionGenRef.current += 1;
      enterBlockGenRef.current += 1;
      enteringBlockRef.current = false;
      disarmCancelWindow(
        cancelTimerRef,
        setCancelWindow,
        setCancelWindowMode,
        setCancelWindowExpiresAt,
        cancelWindowSyncRefs
      );
      switchUndoStackRef.current = clearSwitchUndoStack();

      const prevActivity = currentActivity;
      const localId = currentActivity.id;
      setActionLoading(true);
      setActivity(null);
      publishActivity(null);
      onActivitySwitch({ record: null, stopped: [] });
      onRecordDeleted?.(localId);
      clearBlockSessionState();
      onDrawerExpandedChange?.(false);
      settleActivitySwitch(null);

      try {
        markActivitySwitchPending();
        const stopRes = await fetch('/api/v2/activities/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const stopData = await stopRes.json();
        if (!stopRes.ok) {
          throw new Error(stopData.error?.message ?? '取消失败');
        }

        let recordId = isOptimisticRecordId(localId)
          ? await resolveActivityRecordIdClient(prevActivity)
          : localId;
        if (!recordId) {
          try {
            const curRes = await fetch('/api/v2/activities/current');
            const curData = await curRes.json();
            const running = curData.data as TetoRecord | null;
            if (running?.id && !isOptimisticRecordId(running.id)) {
              recordId = running.id;
            }
          } catch {
            /* ignore */
          }
        }
        if (recordId && !isOptimisticRecordId(recordId)) {
          const delRes = await fetch(`/api/v2/records/${recordId}`, { method: 'DELETE' });
          if (!delRes.ok) {
            const delData = await delRes.json().catch(() => ({}));
            if (!isRecordNotFoundApiError(delData, delRes.status)) {
              throw new Error(
                (delData as { error?: { message?: string } }).error?.message ??
                  '删除记录失败'
              );
            }
          }
          if (recordId !== localId) onRecordDeleted?.(recordId);
        }
        notifyUnassignedRefresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (
          !isStaleRecordReferenceError(msg) &&
          !msg.includes('取消失败') &&
          !msg.includes('删除记录失败')
        ) {
          onError?.(msg || '取消失败');
        }
      } finally {
        blockCancelInFlightRef.current = false;
        settleActivitySwitch(null);
        setActionLoading(false);
      }
      return;
    }

    if (inBlock) {
      disarmCancelWindow(
        cancelTimerRef,
        setCancelWindow,
        setCancelWindowMode,
        setCancelWindowExpiresAt,
        cancelWindowSyncRefs
      );
      onDrawerExpandedChange?.(true);
      return;
    }

    switchGenRef.current += 1;
    disarmCancelWindow(
      cancelTimerRef,
      setCancelWindow,
      setCancelWindowMode,
      setCancelWindowExpiresAt,
      cancelWindowSyncRefs
    );
    switchUndoStackRef.current = clearSwitchUndoStack();

    const prevActivity = activity;
    const localId = activity.id;
    const previousLockedCategoryId = lockedBlockCategoryIdRef.current;
    setActionLoading(true);
    markActivitySwitchPending();
    setActivity(null);
    onActivitySwitch({ record: null, stopped: [buildStoppedSnapshot(activity)] });
    onRecordDeleted?.(localId);
    clearBlockSessionState();

    try {
      const stopRes = await fetch('/api/v2/activities/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const stopData = await stopRes.json();
      if (!stopRes.ok) {
        throw new Error(stopData.error?.message ?? '取消失败');
      }

      const recordId = await resolveActivityRecordIdClient(prevActivity);
      if (recordId && !isOptimisticRecordId(recordId)) {
        if (recordId !== localId) onRecordDeleted?.(recordId);
        const delRes = await fetch(`/api/v2/records/${recordId}`, { method: 'DELETE' });
        if (!delRes.ok) {
          const delData = await delRes.json();
          throw new Error(delData.error?.message ?? '删除记录失败');
        }
      }
      notifyUnassignedRefresh();
    } catch (e) {
      setActivity(prevActivity);
      if (prevActivity) blockActivitySnapshotRef.current = prevActivity;
      if (previousLockedCategoryId) {
        lockedBlockCategoryIdRef.current = previousLockedCategoryId;
        setLockedBlockCategoryId(previousLockedCategoryId);
        saveLockedBlockCategory(previousLockedCategoryId);
      }
      publishActivity(prevActivity);
      onActivitySwitch({ record: prevActivity, stopped: [] });
      onError?.(e instanceof Error ? e.message : '取消失败');
    } finally {
      settleActivitySwitch(null);
      setActionLoading(false);
    }
  }, [
    activity,
    cancelWindowMode,
    handleSwitchUndo,
    publishActivity,
    onActivitySwitch,
    onError,
    onRecordDeleted,
    onDrawerExpandedChange,
    clearBlockSessionState,
  ]);

  /** 块时间 5 秒撤销窗口内：原地 PATCH 归属/动作，不 postSwitch 拆成多条记录 */
  const patchBlockAttribution = useCallback(
    async (patch: {
      item_id?: string | null;
      sub_item_id?: string | null;
      sub_item_title?: string | null;
      tag_ids?: string[];
      action_text?: string | null;
      content?: string;
    }) => {
      const raw = activityRef.current;
      if (!raw) return;
      let lockedCategoryId =
        lockedBlockCategoryIdRef.current ?? loadLockedBlockCategory();
      if (lockedCategoryId && !lockedBlockCategoryIdRef.current) {
        lockedBlockCategoryIdRef.current = lockedCategoryId;
        setLockedBlockCategoryId(lockedCategoryId);
      }
      if (!lockedCategoryId) return;

      onDrawerExpandedChange?.(true);

      const segments = blockSegmentsGetterRef.current?.() ?? [];
      const baseline = resolveBlockPatchBaseline(
        raw,
        lockedCategoryId,
        segments
      );

      const graceActive =
        cancelWindowRef.current &&
        Boolean(lockedCategoryId) &&
        (cancelWindowExpiresAtRef.current == null ||
          cancelWindowExpiresAtRef.current > Date.now());
      const inActiveSwitchWindow =
        cancelWindowRef.current &&
        cancelWindowModeRef.current === 'switch' &&
        (cancelWindowExpiresAtRef.current == null ||
          cancelWindowExpiresAtRef.current > Date.now());
      const switchKind = resolveBlockSwitchKind(patch);
      const willAppendSegment = shouldAppendBlockSegmentOnSwitch(graceActive, switchKind);
      const shouldPushUndo = shouldPushBlockSwitchUndoFrame(switchKind, graceActive);

      if (shouldPushUndo) {
        switchUndoStackRef.current = pushSwitchUndoFrame(
          switchUndoStackRef.current,
          buildSwitchUndoFrame(baseline, segments, tags, {
            attributionOnly: true,
            blockSegmentAppended: willAppendSegment,
            switchKind,
          })
        );
      }

      const gen = ++patchAttributionGenRef.current;
      const pushedUndo = shouldPushUndo;

      const plan = buildBlockAttributionPatchPlan(baseline, patch, tags);
      const { body, optimisticFields, segmentMeta } = plan;

      let optimistic: TetoRecord = {
        ...baseline,
        occurred_at: baseline.occurred_at,
        occurred_at_end: null,
        lifecycle_status: 'active',
        ...(optimisticFields.item_id !== undefined ? { item_id: optimisticFields.item_id } : {}),
        ...(optimisticFields.sub_item_id !== undefined
          ? { sub_item_id: optimisticFields.sub_item_id }
          : {}),
        ...(optimisticFields.tags !== undefined ? { tags: optimisticFields.tags } : {}),
        ...(optimisticFields.action_text !== undefined
          ? { action_text: optimisticFields.action_text }
          : {}),
        ...(optimisticFields.content !== undefined ? { content: optimisticFields.content } : {}),
      };

      if (
        optimisticFields.item_id !== undefined &&
        optimisticFields.item_id !== baseline.item_id &&
        optimisticFields.item_id
      ) {
        const item = items.find((i) => i.id === optimisticFields.item_id);
        if (item) optimistic = { ...optimistic, item: { id: item.id, title: item.title } };
      }

      ensureBlockAttributionPutBody(body, {
        item_id: optimistic.item_id ?? baseline.item_id,
        sub_item_id:
          optimistic.sub_item_id !== undefined
            ? optimistic.sub_item_id
            : baseline.sub_item_id ?? null,
      });

      activityRef.current = optimistic;
      setActivity(optimistic);
      publishActivity(optimistic);
      onRecordPatched?.(optimistic);

      if (patch.sub_item_id && patch.sub_item_title?.trim()) {
        rememberBlockSubItemTitle(patch.sub_item_id, patch.sub_item_title);
      }
      if (optimistic.sub_item_id && patch.sub_item_title?.trim()) {
        rememberBlockSubItemTitle(optimistic.sub_item_id, patch.sub_item_title);
      }

      const blockSegmentsSnapshot = blockSegmentsGetterRef.current?.() ?? [];
      const subItemTitlesForLabel = resolveBlockSessionSubItemTitles(
        optimistic.sub_item_id,
        {
          patchSubItemTitle: patch.sub_item_title,
          recordSubItemTitles: subItemTitlesRef.current,
          sessionSubItemTitles: blockSessionSubItemTitlesRef.current,
          blockSegments: blockSegmentsSnapshot,
        }
      );

      const segLabel = buildBlockAttributionSegmentLabel(
        items,
        optimistic,
        {
          item_id: patch.item_id,
          sub_item_id: patch.sub_item_id,
          sub_item_title: patch.sub_item_title,
          tag_ids: patch.tag_ids,
          attributionChanged: plan.attributionChanged,
        },
        subItemTitlesForLabel
      );
      if (willAppendSegment) {
        blockSegmentAppendRef.current?.(segLabel, Date.now(), segmentMeta);
      } else {
        blockSegmentUpdateRef.current?.(segLabel, segmentMeta);
      }

      const keepExistingGraceWindow = shouldPreserveBlockGraceWindow({
        inActiveSwitchWindow: graceActive,
        hasUndo: switchUndoStackRef.current.length > 0,
      });
      if (!keepExistingGraceWindow) {
        armCancelWindow(
          'switch',
          optimistic,
          cancelTimerRef,
          setCancelWindow,
          setCancelWindowMode,
          setCancelWindowExpiresAt,
          expireSwitchUndo,
          handleCancelWindowDisarm,
          true,
          cancelWindowSyncRefs
        );
      }

      try {
        const latest = activityRef.current ?? baseline;
        if (gen !== patchAttributionGenRef.current) return;

        let recordId: string | null = null;
        try {
          const currentRes = await fetch('/api/v2/activities/current');
          const currentData = await currentRes.json();
          const running = currentData.data as TetoRecord | null;
          if (running?.id && !isOptimisticRecordId(running.id)) {
            recordId = running.id;
          }
        } catch {
          /* fallback below */
        }
        if (!recordId) {
          recordId = isOptimisticRecordId(latest.id)
            ? await resolveActivityRecordId(latest)
            : latest.id;
        }
        if (!recordId || gen !== patchAttributionGenRef.current) return;
        const res = await fetch(`/api/v2/records/${recordId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (gen !== patchAttributionGenRef.current) return;
          if (isRecordNotFoundApiError(data, res.status)) return;
          const errMsg = getApiErrorMessage(data, '');
          if (isStaleRecordReferenceError(errMsg)) return;
          throw new Error(errMsg || '更新失败');
        }
        if (gen !== patchAttributionGenRef.current) return;
        if (blockCancelInFlightRef.current) return;
        if (data.data) {
          const local = activityRef.current ?? optimistic;
          const server = data.data as TetoRecord;
          const merged = mergeBlockAttributionFromServer(
            local,
            server,
            lockedCategoryId
          );
          const synced = preserveActiveTimingSnapshot(
            {
              ...server,
              ...merged,
              item_id: local.item_id ?? merged.item_id ?? server.item_id,
              sub_item_id:
                local.sub_item_id !== undefined
                  ? local.sub_item_id
                  : merged.sub_item_id ?? server.sub_item_id ?? null,
              tags: local.tags !== undefined ? local.tags : merged.tags ?? server.tags,
              action_text:
                local.action_text !== undefined ? local.action_text : merged.action_text,
              content: local.content ?? merged.content ?? server.content,
              item: local.item ?? server.item,
            },
            local
          );
          setActivity(synced);
          publishActivity(synced);
          onRecordPatched?.(synced);
          blockAttributionConfirmRef.current?.();
        }
        if ('item_id' in body) notifyUnassignedRefresh();
      } catch (e) {
        if (gen !== patchAttributionGenRef.current) return;
        if (pushedUndo) {
          switchUndoStackRef.current = popSwitchUndoFrame(switchUndoStackRef.current).stack;
        }
        const msg = e instanceof Error ? e.message : '';
        setActivity(baseline);
        publishActivity(baseline);
        blockAttributionConfirmRef.current?.();
        if (
          isStaleRecordReferenceError(msg) ||
          msg.includes('记录不存在')
        ) {
          return;
        }
        onError?.(msg || '更新失败，请重试');
      }
    },
    [
      items,
      tags,
      publishActivity,
      onRecordPatched,
      onError,
      expireSwitchUndo,
      handleCancelWindowDisarm,
      onDrawerExpandedChange,
    ]
  );

  /** 5 秒窗内：动作进度条点击 → 仅清除动作，保持 grace 计时 */
  const handleActionGraceUndo = useCallback(() => {
    void patchBlockAttribution({
      tag_ids: [],
      action_text: null,
    }).catch(() => {
      /* onError handled inside patchBlockAttribution */
    });
  }, [patchBlockAttribution]);

  /** 5 秒窗内：事项进度条点击 → L2 回到一类；L3 回到二类 */
  const handleItemGraceUndo = useCallback(
    (level: 'l2' | 'l3') => {
      const lockedId =
        lockedBlockCategoryIdRef.current ?? loadLockedBlockCategory();
      if (!lockedId) return;
      const raw = activityRef.current;
      if (!raw) return;
      const segments = blockSegmentsGetterRef.current?.() ?? [];
      const baseline = resolveBlockPatchBaseline(raw, lockedId, segments);

      if (level === 'l2') {
        void patchBlockAttribution({
          item_id: lockedId,
          sub_item_id: null,
          tag_ids: [],
          action_text: null,
        }).catch(() => {
          /* onError handled inside patchBlockAttribution */
        });
        return;
      }

      const org = normalizeOrgLevels(
        items,
        baseline.item_id ?? '',
        baseline.sub_item_id ?? undefined
      );
      const l2Id = org.l2ItemId;
      if (!l2Id) return;
      const segMeta = resolveOpenBlockSegmentMeta(segments);
      const fnTagIds = segMeta?.tag_ids?.length ? [...segMeta.tag_ids] : [];
      void patchBlockAttribution({
        item_id: l2Id,
        sub_item_id: null,
        ...(fnTagIds.length > 0
          ? { tag_ids: fnTagIds, action_text: segMeta?.action_text ?? undefined }
          : { tag_ids: [], action_text: null }),
      }).catch(() => {
        /* onError handled inside patchBlockAttribution */
      });
    },
    [items, patchBlockAttribution]
  );

  const handleInlineSwitch = useCallback(
    async (payload: {
      content?: string;
      item_id: string | null;
      sub_item_id: string | null;
      sub_item_title?: string | null;
      tag_ids?: string[];
    }) => {
      const inBlock = isBlockSessionLocked(lockedBlockCategoryIdRef.current);
      const tagIds = payload.tag_ids ?? [];

      if (inBlock) {
        void patchBlockAttribution({
          item_id: payload.item_id,
          sub_item_id: payload.sub_item_id,
          sub_item_title: payload.sub_item_title,
          ...(tagIds.length > 0 ? { tag_ids: tagIds } : {}),
        }).catch(() => {
          /* onError handled inside patchBlockAttribution */
        });
        return;
      }

      try {
        await postSwitch({
          content: payload.content || undefined,
          item_id: payload.item_id,
          sub_item_id: payload.sub_item_id,
          tag_ids: tagIds.length > 0 ? tagIds : undefined,
        });
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '切换失败');
      }
    },
    [onError, patchBlockAttribution, postSwitch]
  );

  const handleActionSwitch = useCallback(
    async (payload: ActionSwitchPayload) => {
      const current = activityRef.current;
      if (!current) return;
      const inBlock = isBlockSessionLocked(lockedBlockCategoryIdRef.current);
      const isClearing = payload.tag_ids.length === 0;

      if (inBlock) {
        if (isClearing) {
          void patchBlockAttribution({
            tag_ids: [],
            action_text: null,
          }).catch(() => {
            /* onError handled inside patchBlockAttribution */
          });
          return;
        }
        void patchBlockAttribution({
          tag_ids: payload.tag_ids,
          action_text: payload.actionLabel,
        }).catch(() => {
          /* onError handled inside patchBlockAttribution */
        });
        return;
      }

      try {
        await postSwitch({
          content: payload.content || payload.actionLabel,
          item_id: current.item_id ?? null,
          sub_item_id: current.sub_item_id ?? null,
          phase_id: current.phase_id ?? null,
          tag_ids: payload.tag_ids.length > 0 ? payload.tag_ids : undefined,
          action_text: payload.actionLabel,
        });
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '行动切换失败');
      }
    },
    [onError, isBlockAttributionGraceActive, patchBlockAttribution, postSwitch, handleSwitchUndo]
  );

  const resolveLockedCategoryId = useCallback(
    (context: ActivityContextValue): string | null => {
      const targetId = resolveTargetItemId(context);
      if (!targetId) return context.categoryItemId ?? null;
      const ctx = resolveActivityContextFromRecord(items, targetId) as ActivityContextValue;
      return ctx.categoryItemId ?? null;
    },
    [items]
  );

  const handleCategorySwitch = useCallback(
    async (newCategoryId: string) => {
      if (newCategoryId === lockedBlockCategoryId) {
        setCategorySwitchOpen(false);
        return;
      }
      switchGenRef.current += 1;
      setCategorySwitchOpen(false);
      disarmCancelWindow(
        cancelTimerRef,
        setCancelWindow,
        setCancelWindowMode,
        setCancelWindowExpiresAt,
        cancelWindowSyncRefs
      );
      switchUndoStackRef.current = clearSwitchUndoStack();
      lockedBlockCategoryIdRef.current = newCategoryId;
      setLockedBlockCategoryId(newCategoryId);
      saveLockedBlockCategory(newCategoryId);
      try {
        const result = await postSwitch({
          item_id: newCategoryId,
          sub_item_id: null,
          tag_ids: [],
        });
        if (result?.record) {
          blockSegmentAppendRef.current?.(
            buildBlockSegmentLabel(items, result.record),
            Date.now(),
            segmentMetaFromActivity(result.record)
          );
        }
      } catch (e) {
        onFallbackRefresh?.();
        onError?.(e instanceof Error ? e.message : '切换大类失败');
      } finally {
        setActionLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lockedBlockCategoryId, items, onError, onFallbackRefresh]
  );

  const enterBlockTimeFromContext = useCallback(
    async (context: ActivityContextValue) => {
      if (enteringBlockRef.current) {
        return;
      }
      const targetId = resolveTargetItemId(context);
      const categoryId = resolveLockedCategoryId(context);
      const itemId = targetId || categoryId;
      if (!itemId) {
        return;
      }

      enteringBlockRef.current = true;
      const enterGen = ++enterBlockGenRef.current;
      rememberBlockSubItemTitle(context.subItemId, context.subItemTitle);
      onDrawerExpandedChange?.(true);
      if (categoryId) {
        lockedBlockCategoryIdRef.current = categoryId;
        setLockedBlockCategoryId(categoryId);
        saveLockedBlockCategory(categoryId);
      }
      try {
        const result = await postSwitch({
          content: undefined,
          item_id: itemId,
          sub_item_id: context.subItemId || null,
          phase_id: context.phaseId || null,
          tag_ids: idleActionTagId ? [idleActionTagId] : undefined,
          forceCancelWindow: true,
        });
        if (enterGen !== enterBlockGenRef.current) return;
        if (result?.record && categoryId) {
          setLockedBlockCategoryId(categoryId);
          saveLockedBlockCategory(categoryId);
        }
      } catch (e) {
        if (enterGen !== enterBlockGenRef.current || blockCancelInFlightRef.current) {
          return;
        }
        onError?.(e instanceof Error ? e.message : '进入块时间失败');
        clearBlockSessionState();
      } finally {
        enteringBlockRef.current = false;
        if (enterGen === enterBlockGenRef.current) {
          setActionLoading(false);
          setStopSubmitting(false);
        }
      }
    },
    [postSwitch, resolveLockedCategoryId, idleActionTagId, onError, onDrawerExpandedChange, rememberBlockSubItemTitle]
  );

  const handlePanelSubmit = async (payload: StartActivitySubmitPayload) => {
    try {
      if (!payload.item_id && !payload.content?.trim()) {
        setActionLoading(true);
        markActivitySwitchPending();
        setActivity(null);
        publishActivity(null);
        onActivitySwitch({
          record: null,
          stopped: activity ? [buildStoppedSnapshot(activity)] : [],
        });
        try {
          const res = await fetch('/api/v2/activities/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error?.message ?? '操作失败');
          onActivitySwitch(d.data as ActivitySwitchPayload);
          settleActivitySwitch(null);
        } catch (e) {
          settleActivitySwitch(null);
          throw e;
        } finally {
          setActionLoading(false);
        }
      } else {
        await postSwitch({
          content: payload.content,
          item_id: payload.item_id,
          sub_item_id: payload.sub_item_id,
          phase_id: payload.phase_id,
          tool_label: payload.tool_label,
        });
      }
      setPanelInitialContent('');
      setIdleContent('');
    } catch (e) {
      onFallbackRefresh?.();
      throw e;
    }
  };

  const patchActivityMeta = async (body: Record<string, unknown>) => {
    if (!activity) return;
    const prev = activity;
    const optimistic = { ...activity, ...body } as TetoRecord;
    setActivity(optimistic);
    publishActivity(optimistic);
    try {
      const recordId = await resolveActivityRecordId(activity);
      if (!recordId) return;
      if (recordId !== activity.id) {
        const synced = { ...optimistic, id: recordId };
        setActivity(synced);
        publishActivity(synced);
      }
      const payload = { ...body };
      if (payload.money_direction === null) {
        payload.money_direction = 'none';
      }
      const res = await fetch(`/api/v2/records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? '更新失败');
      if (data.data) {
        const synced = data.data as TetoRecord;
        setActivity(synced);
        publishActivity(synced);
        onRecordPatched?.(synced);
      }
      if ('item_id' in body) notifyUnassignedRefresh();
    } catch (e) {
      setActivity(prev);
      publishActivity(prev);
      onError?.(e instanceof Error ? e.message : '更新失败，请重试');
    }
  };

  const handleSaveNote = async () => {
    if (!activity || !noteText.trim()) return;
    setNoteSubmitting(true);
    try {
      const recordId = await resolveActivityRecordId(activity);
      if (!recordId) throw new Error('记录尚未就绪，请稍后再试');
      const res = await fetch(`/api/v2/records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? '保存笔记失败');
      setActivity((prev) => (prev ? { ...prev, note: noteText.trim() } : prev));
      setNoteOpen(false);
      setNoteText('');
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '保存笔记失败');
    } finally {
      setNoteSubmitting(false);
    }
  };


  const handleIdleSubmit = async () => {
    const text = idleContent.trim();
    // 发生模式也尝试从当前 context（picker 选择）或文本规则中解析归属
    const effectiveContext = resolveEffectiveIdleContext(idleContext, text);
    const effectiveTargetId = resolveTargetItemId(effectiveContext);
    const effectiveCategoryId = effectiveContext.categoryItemId || null;
    const effectiveItemId = effectiveTargetId ?? effectiveCategoryId;
    const allowsActionOnly = idleMode === '发生' && Boolean(effectiveCategoryId && idleActionTagId);
    const contextErr = allowsActionOnly
      ? null
      : validateActivityContext(effectiveContext, items, idleSubItemsCount);
    if (contextErr) {
      onError?.(contextErr);
      return;
    }
    const resolved = resolveContextLabel(effectiveContext, items, text);
    setIdleSubmitting(true);
    const today = todayDateStr();
    try {
      if (idleMode === '发生') {
        const contentForSwitch = text || UNASSIGNED_ACTIVE_PLACEHOLDER;
        const resolvedItemId = effectiveItemId ?? null;
        setIdleContent('');
        setIdleSubmitting(false);
        try {
          const switchData = await postSwitch({
            content: contentForSwitch,
            item_id: resolvedItemId,
            sub_item_id: effectiveContext.subItemId || null,
            tag_ids: idleActionTagId ? [idleActionTagId] : undefined,
          });
          if (text && switchData?.record?.id) {
            runAiEnhance(switchData.record.id, text, today, resolvedItemId);
          }
        } catch (e) {
          onFallbackRefresh?.();
          onError?.(e instanceof Error ? e.message : '开始失败');
        }
      } else {
        if (!text) {
          onError?.('想法/计划请填写具体内容');
          setIdleSubmitting(false);
          return;
        }
        const itemId = effectiveItemId ?? undefined;
        const payload: CreateRecordPayload = {
          content: text,
          type: idleMode as RecordType,
          date: today,
          item_id: itemId,
          sub_item_id: effectiveContext.subItemId || null,
          phase_id: effectiveContext.phaseId || null,
          tool_label: idleToolLabel.trim() || null,
          mood: idleMood ?? undefined,
          input_source: 'manual',
          review_status: 'unchecked',
        };
        if (idleCost != null && idleCost > 0) {
          payload.cost = idleCost;
          payload.money_direction = 'expense';
          payload.money_currency = 'CNY';
        }
        if (idleLocation.trim()) {
          payload.location = idleLocation.trim();
        }
        if (idleMode === '计划') {
          payload.lifecycle_status = 'active';
          payload.time_anchor_date = today;
          if (idlePlanPriority) {
            payload.subcategory = planPriorityToSubcategory(idlePlanPriority) ?? undefined;
          }
        }
        const mergedTagIds = Array.from(
          new Set([...idleTagIds.filter((id) => id !== idleActionTagId), ...(idleActionTagId ? [idleActionTagId] : [])])
        );
        if (mergedTagIds.length > 0) {
          payload.tag_ids = mergedTagIds;
        }
        const optimistic = buildOptimisticManualRecord(payload, items, tags);
        onRecordAdded(optimistic, false);
        saveLastActivityContext(effectiveContext);
        setIdleContext(effectiveContext);
        setIdleContent('');
        setIdleToolLabel('');
        setIdleMood(null);
        setIdleActionTagId(null);
        setIdleTagIds([]);
        setIdlePlanPriority(null);
        setIdleCost(null);
        setIdleLocation('');
        setIdleSubmitting(false);
        if (idleToolLabel.trim()) void persistToolOptionIfNeeded(idleToolLabel);
        try {
          const created = await postManualRecord(payload);
          onRecordAdded(created, true);
          runAiEnhance(created.id, text, today, itemId ?? null);
        } catch (e) {
          onFallbackRefresh?.();
          onError?.(e instanceof Error ? e.message : '保存失败');
        }
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '操作失败');
      setIdleSubmitting(false);
    }
  };

  const handleSelectCategory = useCallback((bubble: { label: string; categoryItemId: string }) => {
    const ctx = resolveActivityContextFromRecord(items, bubble.categoryItemId) as ActivityContextValue;
    setIdleContext(ctx);
  }, [items]);

  // 随手记输入框 → 标签栏自动同步（只更新选中状态，不进入块时间）
  const handleQuickCreateAttributionResolved = useCallback(
    (context: ActivityContextValue | null) => {
      if (contextManualOverrideRef.current) return;
      setIdleContext(context ?? EMPTY_ACTIVITY_CONTEXT);
    },
    []
  );

  const handleIdleContextChange = useCallback((v: ActivityContextValue) => {
    setIdleContext(v);
    setContextManualOverride(true);
  }, []);

  /** 用户手动改动作也视为最终选择，后续输入不再自动覆盖归属。 */
  const handleIdleActionTagChange = useCallback((tagId: string | null) => {
    setIdleActionTagId(tagId);
    setContextManualOverride(true);
  }, []);

  const handleQuickCreateInputClear = useCallback(({
    preserveManualSelection,
  }: {
    preserveManualSelection: boolean;
  }) => {
    if (preserveManualSelection) return;
    setIdleContext(EMPTY_ACTIVITY_CONTEXT);
    setIdleActionTagId(null);
    setIdleTagIds([]);
    setContextManualOverride(false);
  }, []);

  const handleEnterBlockTime = useCallback(() => {
    void enterBlockTimeFromContext(idleContext);
  }, [idleContext, enterBlockTimeFromContext]);

  const handleAttachRecord = async () => {
    if (!activity || !attachText.trim()) return;
    const text = attachText.trim();
    const today = todayDateStr();
    const payload: CreateRecordPayload = {
      content: text,
      type: attachType,
      date: today,
      item_id: activity.item_id ?? undefined,
      sub_item_id: activity.sub_item_id ?? null,
      input_source: 'manual',
      review_status: 'confirmed',
    };
    if (attachType === '计划') {
      payload.lifecycle_status = 'active';
      payload.time_anchor_date = today;
    }
    const optimistic = buildOptimisticManualRecord(payload, items, tags);
    onRecordAdded(optimistic, false);
    setAttachText('');
    setAttachOpen(false);
    setAttachSubmitting(false);
    try {
      const created = await postManualRecord(payload);
      onRecordAdded(created, true);
    } catch (e) {
      onFallbackRefresh?.();
      onError?.(e instanceof Error ? e.message : '挂载失败');
    }
  };

  const handleQuickSwitch = useCallback(
    (data: ActivitySwitchPayload) => {
      onActivitySwitch(data);
      setActivity(data.record);
      publishActivity(data.record ?? null);
      // 乐观切换后 Idle/QuickSwitch 会卸载，finally 里的 onSwitchStateChange(false) 可能不再执行
      setActionLoading(false);
      setStopSubmitting(false);
      if (!data.record) return;
      if (lockedBlockCategoryIdRef.current && activity) {
        switchUndoStackRef.current = pushSwitchUndoFrame(
          switchUndoStackRef.current,
          { previousActivity: { ...activity }, attributionOnly: true }
        );
        armCancelWindow(
          'switch',
          data.record,
          cancelTimerRef,
          setCancelWindow,
          setCancelWindowMode,
          setCancelWindowExpiresAt,
          expireSwitchUndo,
          handleCancelWindowDisarm,
          true,
          cancelWindowSyncRefs
        );
      } else {
        switchUndoStackRef.current = clearSwitchUndoStack();
        armCancelWindow(
          'start',
          data.record,
          cancelTimerRef,
          setCancelWindow,
          setCancelWindowMode,
          setCancelWindowExpiresAt,
          expireSwitchUndo,
          handleCancelWindowDisarm,
          false,
          cancelWindowSyncRefs
        );
      }
    },
    [activity, expireSwitchUndo, handleCancelWindowDisarm, onActivitySwitch, publishActivity]
  );

  const handleQuickSwitchSelect = useCallback(
    (entry: QuickSwitchEntry, toolLabel: string | null) => {
      const ctx = resolveActivityContextFromRecord(
        items,
        entry.item_id,
        entry.sub_item_id
      ) as ActivityContextValue;
      setIdleContext(ctx);
      if (toolLabel?.trim()) setIdleToolLabel(toolLabel.trim());
      setContextManualOverride(true);
    },
    [items]
  );

  const inBlockSession = Boolean(
    lockedBlockCategoryIdRef.current || loadLockedBlockCategory()
  );

  const blockStopSummary =
    stopSummaryOpen && inBlockSession
      ? {
          recordCount: Math.max(
            1,
            activitySegmentsFromBlock(
              blockSegmentsGetterRef.current?.() ??
                loadStoredBlockSegments()?.segments ??
                []
            ).length
          ),
        }
      : null;

  const timingDrawerEnabled =
    Boolean(onDrawerExpandedChange) || Boolean(panelActivity) || inBlockSession;
  const isDrawerExpanded = timingDrawerEnabled && (drawerExpanded ?? true);

  if (!pageReady || (loading && !inBlockSession && !panelActivity)) {
    return timingDrawerEnabled && isDrawerExpanded ? (
      <div className="fixed inset-x-0 top-[calc(3rem+env(safe-area-inset-top,0px))] z-40 flex items-center justify-center bg-slate-100 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:top-0 lg:bottom-0">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    ) : (
      <CurrentActivityCardSkeleton />
    );
  }

  const activePanel = panelActivity ? (
    <BlockTimeActivePanel
      activity={panelActivity}
      items={items}
      actionLoading={actionLoading}
      stopSubmitting={stopSubmitting}
      todayDate={todayDate ?? todayDateStr()}
      compact={timingDrawerEnabled && !isDrawerExpanded}
      lockedCategoryItemId={lockedBlockCategoryId}
      blockSessionSubItemTitles={blockSessionSubItemTitles}
      todayRecords={todayRecords}
      cancelWindow={cancelWindow}
      cancelWindowMode={cancelWindowMode}
      cancelWindowExpiresAt={cancelWindowExpiresAt}
      blockAttributionGrace={
        cancelWindow && cancelWindowMode === 'switch' && Boolean(lockedBlockCategoryId)
      }
      onItemGraceUndo={(level) => {
        void handleItemGraceUndo(level);
      }}
      onActionGraceUndo={() => {
        void handleActionGraceUndo();
      }}
      onCancelActivity={handleCancelActivity}
      onRegisterBlockSegmentPop={(pop) => {
        blockSegmentPopRef.current = pop;
      }}
      onRegisterBlockSegmentAppend={(append) => {
        blockSegmentAppendRef.current = append;
      }}
      onRegisterBlockSegmentUpdate={(update) => {
        blockSegmentUpdateRef.current = update;
      }}
      onRegisterBlockSegmentReset={(reset) => {
        blockSegmentResetRef.current = reset;
      }}
      onRegisterBlockSegmentsRestore={(restore) => {
        blockSegmentsRestoreRef.current = restore;
      }}
      onRegisterBlockSegmentsGetter={(getter) => {
        blockSegmentsGetterRef.current = getter;
      }}
      onRegisterAttributionConfirm={(confirm) => {
        blockAttributionConfirmRef.current = confirm;
      }}
      onRegisterAttributionReset={(reset) => {
        blockAttributionResetRef.current = reset;
      }}
      onExpandDrawer={
        timingDrawerEnabled && !isDrawerExpanded
          ? () => onDrawerExpandedChange?.(true)
          : undefined
      }
      onRequestStop={() => setStopSummaryOpen(true)}
      onSwitch={() => setCategorySwitchOpen(true)}
      onActivityUpdated={(record) => {
        setActivity(record);
        publishActivity(record);
      }}
      onRecordSynced={(record) => {
        setActivity(record);
        publishActivity(record);
        onRecordPatched?.(record);
      }}
      onSessionAction={onSessionAction}
      onRecordAdded={onRecordAdded}
      onError={onError}
      onInlineSwitch={handleInlineSwitch}
      onActionSwitch={handleActionSwitch}
    />
  ) : null;

  const showInlineActive = Boolean(panelActivity && !(timingDrawerEnabled && isDrawerExpanded));
  const showDrawerActive = Boolean(panelActivity && timingDrawerEnabled && isDrawerExpanded);

  return (
    <>
      <div
        className={[
          'overflow-x-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
          showInlineActive ? 'flex min-h-[min(340px,38vh)] flex-col' : '',
        ].join(' ')}
      >
        {showInlineActive ? (
          activePanel
        ) : !panelActivity ? (
          <ActivityIdlePanel
            items={items}
            itemsLoading={itemsLoading}
            userTools={userTools}
            toolsLoading={toolsLoading}
            onToolsChange={onToolsChange}
            onItemsChange={onItemsChanged}
            onItemCreated={onItemCreated}
            onCreateError={onCreateError}
            tags={tags}
            todayRecords={todayRecords}
            todayDate={todayDate ?? todayDateStr()}
            quickSwitchRecords={quickSwitchRecords}
            onQuickSwitch={handleQuickSwitch}
            onQuickSwitchSelect={handleQuickSwitchSelect}
            onQuickSwitchStateChange={setActionLoading}
            onPlanComplete={onPlanComplete}
            onRecordPlanPriorityChange={onPlanPriorityChange}
            content={idleContent}
            mode={idleMode}
            context={idleContext}
            toolLabel={idleToolLabel}
            mood={idleMood}
            actionTagId={idleActionTagId}
            submitting={idleSubmitting}
            onContentChange={setIdleContent}
            onModeChange={setIdleMode}
            onContextChange={handleIdleContextChange}
            onToolLabelChange={setIdleToolLabel}
            onMoodChange={setIdleMood}
            onActionTagChange={handleIdleActionTagChange}
            onAutoActionTagResolved={setIdleActionTagId}
            selectedTagIds={idleTagIds}
            onTagIdsChange={setIdleTagIds}
            onTagCreated={onTagCreated}
            planPriority={idlePlanPriority}
            onPlanPriorityChange={setIdlePlanPriority}
            onSubItemsLoaded={handleIdleSubItemsLoaded}
            onSubmit={handleIdleSubmit}
            onCustomStart={() => setPanelMode('start')}
            onContextHintSelect={(hint) => {
              if (hint.kind === 'cost') setIdleCost(Number(hint.value));
              else if (hint.kind === 'location') setIdleLocation(String(hint.value));
              else if (hint.kind === 'content') setIdleContent(String(hint.value));
            }}
            onSelectCategory={handleSelectCategory}
            onEnterBlockTime={handleEnterBlockTime}
            onQuickCreateAttributionResolved={handleQuickCreateAttributionResolved}
            onQuickCreateInputClear={handleQuickCreateInputClear}
            contextManualOverride={contextManualOverride}
            userRules={userRules}
            onRecordAdded={onRecordAdded}
            onAiEnhanceStart={onAiEnhanceStart}
            onAiEnhanceEnd={onAiEnhanceEnd}
            onRecordPatched={onRecordPatched}
            onFallbackRefresh={onFallbackRefresh}
            onNewItemSuggested={onNewItemSuggested}
            onQuickCreateError={onError}
          />
        ) : null}
      </div>

      {panelActivity && !(timingDrawerEnabled && isDrawerExpanded) && (
        <div className="px-1 pt-2">
          <QuickCreateBar
            items={items}
            userRules={userRules}
            tags={tags}
            onRecordAdded={onRecordAdded}
            onError={onError}
            onAiEnhanceStart={onAiEnhanceStart}
            onAiEnhanceEnd={onAiEnhanceEnd}
            onRecordPatched={onRecordPatched}
            onFallbackRefresh={onFallbackRefresh}
            onNewItemSuggested={onNewItemSuggested}
          />
        </div>
      )}

      {showDrawerActive && panelActivity && (
        <div
          className={[
            'fixed inset-x-0 z-40 flex flex-col overflow-hidden bg-gradient-to-b from-white to-slate-100 shadow-[0_-8px_32px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out',
            'top-[calc(3rem+env(safe-area-inset-top,0px))] bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:top-0 lg:bottom-0',
          ].join(' ')}
        >
          <div className="min-h-0 flex-1">
            <BlockTimeActivePanel
              activity={panelActivity}
              items={items}
              tags={tags}
              userTools={userTools}
              toolsLoading={toolsLoading}
              onToolsChange={onToolsChange}
              onItemsChange={onItemsChanged}
              onItemCreated={onItemCreated}
              onCreateError={onCreateError}
              onTagCreated={onTagCreated}
              actionLoading={actionLoading}
              stopSubmitting={stopSubmitting}
              todayDate={todayDate ?? todayDateStr()}
              drawerMode
              lockedCategoryItemId={lockedBlockCategoryId}
              blockSessionSubItemTitles={blockSessionSubItemTitles}
              todayRecords={todayRecords}
              cancelWindow={cancelWindow}
              cancelWindowMode={cancelWindowMode}
              cancelWindowExpiresAt={cancelWindowExpiresAt}
              blockAttributionGrace={
                cancelWindow && cancelWindowMode === 'switch' && Boolean(lockedBlockCategoryId)
              }
              onItemGraceUndo={(level) => {
                void handleItemGraceUndo(level);
              }}
              onActionGraceUndo={() => {
                void handleActionGraceUndo();
              }}
              onCancelActivity={handleCancelActivity}
              onRegisterBlockSegmentPop={(pop) => {
                blockSegmentPopRef.current = pop;
              }}
              onRegisterBlockSegmentAppend={(append) => {
                blockSegmentAppendRef.current = append;
              }}
              onRegisterBlockSegmentUpdate={(update) => {
                blockSegmentUpdateRef.current = update;
              }}
              onRegisterBlockSegmentReset={(reset) => {
                blockSegmentResetRef.current = reset;
              }}
              onRegisterBlockSegmentsRestore={(restore) => {
                blockSegmentsRestoreRef.current = restore;
              }}
              onRegisterBlockSegmentsGetter={(getter) => {
                blockSegmentsGetterRef.current = getter;
              }}
              onRegisterAttributionConfirm={(confirm) => {
                blockAttributionConfirmRef.current = confirm;
              }}
              onRegisterAttributionReset={(reset) => {
                blockAttributionResetRef.current = reset;
              }}
              onCollapseDrawer={() => onDrawerExpandedChange?.(false)}
              onRequestStop={() => setStopSummaryOpen(true)}
              onSwitch={() => setCategorySwitchOpen(true)}
              onSessionAction={onSessionAction}
              onActivityUpdated={(record) => {
                setActivity(record);
                publishActivity(record);
              }}
              onRecordSynced={(record) => {
                setActivity(record);
                publishActivity(record);
                onRecordPatched?.(record);
              }}
              onRecordAdded={onRecordAdded}
              onError={onError}
              onInlineSwitch={handleInlineSwitch}
              onActionSwitch={handleActionSwitch}
            />
          </div>
        </div>
      )}

      <StartActivityPanel
        open={panelMode !== null}
        mode={panelMode ?? 'start'}
        items={items}
        onItemsChange={onItemsChanged}
        onItemCreated={onItemCreated}
        onCreateError={onCreateError}
        initialContent={panelInitialContent || undefined}
        backfillDate={todayDateStr()}
        onClose={() => {
          setPanelMode(null);
          setPanelInitialContent('');
        }}
        onSubmit={handlePanelSubmit}
      />

      <BlockCategorySwitchPanel
        open={categorySwitchOpen}
        items={items}
        currentCategoryId={lockedBlockCategoryId}
        submitting={actionLoading}
        onClose={() => setCategorySwitchOpen(false)}
        onConfirm={(categoryId) => void handleCategorySwitch(categoryId)}
      />

      {(panelActivity ?? activity) && (
        <StopSummarySheet
          open={stopSummaryOpen}
          activity={(panelActivity ?? activity)!}
          items={items}
          submitting={stopSubmitting}
          blockSummary={blockStopSummary}
          onConfirm={() => {
            setStopSummaryOpen(false);
            void finalizeStop();
          }}
          onCancel={() => setStopSummaryOpen(false)}
        />
      )}
    </>
  );
}
