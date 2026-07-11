'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, RotateCcw, LayoutGrid, ChevronsLeft, ChevronsRight, Funnel, Search, X } from 'lucide-react';
import { planPriorityToSubcategory, type PlanPriority } from '@/lib/activity/plan-priority';
import type { Goal, Item, Record, Tag, RecordType, UserTool } from '@/types/teto';
import type { UserRule } from '@/lib/db/user-rules';
import { type IngestClarifyState } from './components/QuickInput';
import FilterBar from './components/FilterBar';
import DayRecordGroup from './components/DayRecordGroup';
import RecordEditDrawer from './components/RecordEditDrawer';
import CurrentActivityCard from './components/CurrentActivityCard';
import { recordBelongsToDay } from '@/lib/activity/timeline-utils';
import { ensureCategoryItems, needsCategorySeed } from '@/lib/activity/ensure-categories';
import { sortRecords } from '@/lib/activity/sort-records';
import {
  replaceOptimisticRecord,
  enrichRecord,
  isOptimisticRecordId,
  isOptimisticBlockSegmentId,
  type ActivitySwitchPayload,
  type SessionActionPayload,
} from '@/lib/activity/records-mutation';
import { loadLockedBlockCategory } from '@/hooks/use-block-session-segments';
import { filterRecordsForBootstrap } from '@/lib/activity/select-timeline-records';
import {
  loadDeletedRecordTombstones,
  removeDeletedRecordTombstone,
} from '@/lib/activity/deleted-records-tombstone';
import {
  ActivitySessionProvider,
  type ActivitySessionContextValue,
} from '@/contexts/ActivitySessionContext';
import TodayActivityTimeline from './components/TodayActivityTimeline';
import TodayStatusCard from './components/TodayStatusCard';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { RecordsDayContentSkeleton, RecordsMultiDaySkeleton } from '@/components/ui/PageSkeletons';
import NewItemConfirmBubble from './components/NewItemConfirmBubble';
import type { NewItemSuggestion } from '@/lib/activity/ai-enhance-trigger';
import { initSeedRulesOnce } from '@/lib/activity/seed-user-rules';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 生成从 startDate 往前 count 天的日期数组（升序） */
function generateDatesBefore(startDate: string, count: number): string[] {
  const start = new Date(startDate + 'T00:00:00');
  const dates: string[] = [];
  for (let i = 1; i <= count; i++) {
    const dd = new Date(start);
    dd.setDate(dd.getDate() - i);
    dates.push(formatDate(dd));
  }
  return dates.reverse();
}

/** 生成从 startDate 往后 count 天的日期数组（升序） */
function generateDatesAfter(startDate: string, count: number): string[] {
  const start = new Date(startDate + 'T00:00:00');
  const dates: string[] = [];
  for (let i = 1; i <= count; i++) {
    const dd = new Date(start);
    dd.setDate(dd.getDate() + i);
    dates.push(formatDate(dd));
  }
  return dates;
}

function buildInitialMultiDayDates(): string[] {
  const d = new Date();
  const dates: string[] = [];
  for (let i = -2; i <= 2; i++) {
    const dd = new Date(d);
    dd.setDate(dd.getDate() + i);
    dates.push(formatDate(dd));
  }
  return dates;
}

const LOAD_BATCH = 7;

const STORAGE_KEY_MULTI_DAY = 'teto_records_multi_day';
const STORAGE_KEY_PENDING_INPUTS = 'teto_records_pending_inputs_v1';

/** 时间轴会话卡生命周期（同一 input 单槽位） */
export type SessionLifecycle =
  | 'parsing'
  | 'awaiting_confirmation'
  | 'deferred'
  | 'saved'
  | 'cancelled'
  | 'failed';

export interface PendingInputDraft {
  /** 稳定列表主键：session:${client_session_id} */
  id: string;
  client_session_id: string;
  content: string;
  date: string;
  createdAt: string;
  lifecycle: SessionLifecycle;
  inputId?: string;
  rawContext?: string;
  clarifySnapshot?: IngestClarifyState;
  errorMessage?: string;
}

function migratePendingDraft(raw: { [key: string]: unknown }): PendingInputDraft | null {
  const id = typeof raw.id === 'string' ? raw.id : '';
  const content = typeof raw.content === 'string' ? raw.content : '';
  const date = typeof raw.date === 'string' ? raw.date : '';
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  const legacyKind = raw.kind as string | undefined;
  let lifecycle = raw.lifecycle as SessionLifecycle | undefined;
  if (!lifecycle) {
    if (legacyKind === 'await_confirm') lifecycle = 'deferred';
    else lifecycle = 'parsing';
  }
  if (id.startsWith('defer:')) {
    const inputId = id.slice('defer:'.length);
    return {
      id: `session:legacy-defer-${inputId}`,
      client_session_id: `legacy-defer-${inputId}`,
      content,
      date,
      createdAt,
      lifecycle: 'deferred',
      inputId,
      rawContext: typeof raw.rawContext === 'string' ? raw.rawContext : content,
      clarifySnapshot: raw.clarifySnapshot as IngestClarifyState | undefined,
    };
  }
  const client_session_id =
    typeof raw.client_session_id === 'string'
      ? raw.client_session_id
      : id.startsWith('session:')
        ? id.slice('session:'.length)
        : id.startsWith('pending:')
          ? id.replace(/^pending:/, '')
          : id || `mig-${createdAt}`;
  return {
    id: id.startsWith('session:') ? id : `session:${client_session_id}`,
    client_session_id,
    content,
    date,
    createdAt,
    lifecycle: lifecycle ?? 'parsing',
    inputId: typeof raw.inputId === 'string' ? raw.inputId : undefined,
    rawContext: typeof raw.rawContext === 'string' ? raw.rawContext : undefined,
    clarifySnapshot: raw.clarifySnapshot as IngestClarifyState | undefined,
    errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : undefined,
  };
}

function loadPendingDraftsFromStorage(): PendingInputDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PENDING_INPUTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { [key: string]: unknown }[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => migratePendingDraft(row)).filter((x): x is PendingInputDraft => x != null);
  } catch {
    return [];
  }
}

function toPendingRecord(draft: PendingInputDraft): Record {
  const mainLine = draft.content;
  const rawLine = draft.rawContext && draft.lifecycle === 'deferred' ? draft.rawContext : draft.content;
  const pendingUi = {
    lifecycle: draft.lifecycle,
    errorMessage: draft.errorMessage ?? null,
  };
  return {
    id: draft.id,
    user_id: 'pending',
    record_day_id: `pending:${draft.date}`,
    content: mainLine,
    type: '发生',
    occurred_at: null,
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: draft.lifecycle === 'failed' && draft.errorMessage ? draft.errorMessage : null,
    item_id: null,
    phase_id: null,
    sub_item_id: null,
    sort_order: 0,
    is_starred: false,
    cost: null,
    metric_value: null,
    metric_unit: null,
    metric_name: null,
    duration_minutes: null,
    raw_input: rawLine,
    parsed_semantic: { _session_ui: pendingUi } as unknown as Record['parsed_semantic'],
    time_anchor_date: draft.date,
    linked_record_id: null,
    location: null,
    people: [],
    batch_id: null,
    input_id: draft.inputId ?? null,
    parent_input_id: null,
    lifecycle_status: 'active',
    review_status: 'unchecked',
    confidence_level: null,
    input_source: 'ai',
    created_at: draft.createdAt,
    updated_at: draft.createdAt,
    date: draft.date,
    tags: [],
    item: null,
    linked_records: [],
  };
}

export default function RecordsClient() {
  const searchParams = useSearchParams();

  // 从 URL date 参数计算初始偏移量
  const getInitialOffset = useCallback(() => {
    const dateParam = searchParams.get('date');
    if (!dateParam) return 0;
    try {
      const target = new Date(dateParam + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.round((target.getTime() - today.getTime()) / 86400000);
    } catch { return 0; }
  }, [searchParams]);

  // 从 localStorage 恢复模式选择
  const [isMultiDay, setIsMultiDayRaw] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY_MULTI_DAY) === 'true';
  });
  const [singleDayOffset, setSingleDayOffset] = useState(getInitialOffset);
  const [multiDayDates, setMultiDayDates] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    if (localStorage.getItem(STORAGE_KEY_MULTI_DAY) === 'true') {
      return buildInitialMultiDayDates();
    }
    return [];
  });
  const [multiDayEarliestOffset, setMultiDayEarliestOffset] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY_MULTI_DAY) === 'true' ? -2 : 0
  );
  const [records, setRecords] = useState<Record[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [userTools, setUserTools] = useState<UserTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [filterType, setFilterType] = useState<RecordType | ''>('');
  const [filterTagId, setFilterTagId] = useState(() => searchParams.get('tag_id') || '');
  const [filterItemId, setFilterItemId] = useState(() => searchParams.get('item_id') || '');
  const [filterSearch, setFilterSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingRecord, setEditingRecord] = useState<Record | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [pageReady, setPageReady] = useState(false);
  const [pendingInputs, setPendingInputs] = useState<PendingInputDraft[]>([]);
  const [resumeClarify, setResumeClarify] = useState<{
    nonce: number;
    snapshot: IngestClarifyState;
  } | null>(null);
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [timingPanelsExpanded, setTimingPanelsExpanded] = useState(true);
  const sessionRef = useRef<ActivitySessionContextValue | null>(null);
  const [userRules, setUserRules] = useState<UserRule[]>([]);
  const [aiEnhancingIds, setAiEnhancingIds] = useState<Set<string>>(() => new Set());
  const [newItemSuggestionQueue, setNewItemSuggestionQueue] = useState<NewItemSuggestion[]>([]);
  const currentSuggestion = newItemSuggestionQueue[0] ?? null;
  const tagsLoadedRef = useRef(false);
  const bootstrapMetaLoadedRef = useRef(false);

  const hasActiveFilters = Boolean(filterType || filterItemId || filterSearch);

  useEffect(() => {
    setPendingInputs(loadPendingDraftsFromStorage());
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_PENDING_INPUTS, JSON.stringify(pendingInputs));
    } catch {
      /* ignore */
    }
  }, [pendingInputs]);

  const aiPendingIds = useMemo(() => {
    const ids = new Set(
      pendingInputs.filter((p) => p.lifecycle === 'parsing').map((p) => p.id)
    );
    for (const id of aiEnhancingIds) ids.add(id);
    return ids;
  }, [pendingInputs, aiEnhancingIds]);
  const { toasts, showError, dismissToast } = useToast();

  // 计划完成/推迟对话框状态
  const [completingRecord, setCompletingRecord] = useState<Record | null>(null);
  const [completeDate, setCompleteDate] = useState('');
  const [completeTime, setCompleteTime] = useState('');
  const [completionContent, setCompletionContent] = useState('');
  const [postponingRecord, setPostponingRecord] = useState<Record | null>(null);
  const [postponeDate, setPostponeDate] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const prevTimelineCountRef = useRef(0);
  const todayColRef = useRef<HTMLDivElement>(null);
  // 加载更早时，记录需要补偿的 scrollLeft 偏移量
  const scrollAdjustRef = useRef<number | null>(null);

  // 切换模式时持久化到 localStorage
  const setIsMultiDay = (value: boolean | ((prev: boolean) => boolean)) => {
    setIsMultiDayRaw((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_MULTI_DAY, String(next));
      }
      return next;
    });
  };

  const todayStr = formatDate(new Date());

  const singleDayDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + singleDayOffset);
    return formatDate(d);
  }, [singleDayOffset]);

  const isOnToday = isMultiDay
    ? multiDayDates.includes(todayStr)
    : singleDayOffset === 0;

  const blockCategoryLocked =
    typeof window !== 'undefined' ? Boolean(loadLockedBlockCategory()) : false;

  const resolveSession = () => sessionRef.current;

  // 多天模式初始化：前天、昨天、今天、明天、后天（共5天）
  const initMultiDayDates = useCallback(() => {
    const d = new Date();
    const dates: string[] = [];
    for (let i = -2; i <= 2; i++) {
      const dd = new Date(d);
      dd.setDate(dd.getDate() + i);
      dates.push(formatDate(dd));
    }
    setMultiDayDates(dates);
    setMultiDayEarliestOffset(-2);
  }, []);

  // 进入多日视图时自动滚动到今天列（等数据加载完成后再滚动）
  const needScrollToTodayRef = useRef(false);
  useEffect(() => {
    if (isMultiDay && multiDayDates.includes(todayStr)) {
      needScrollToTodayRef.current = true;
    }
  }, [isMultiDay, multiDayDates.length]);

  // loading 从 true → false 时执行滚动
  useEffect(() => {
    if (!recordsLoading && needScrollToTodayRef.current && isMultiDay) {
      needScrollToTodayRef.current = false;
      requestAnimationFrame(() => {
        todayColRef.current?.scrollIntoView({
          behavior: 'instant',
          inline: 'center',
          block: 'nearest',
        });
      });
    }
  }, [recordsLoading, isMultiDay]);

  // 加载更早后恢复滚动位置（往左追加列时，scrollLeft 需要补偿新列的宽度）
  useLayoutEffect(() => {
    if (scrollAdjustRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += scrollAdjustRef.current;
      scrollAdjustRef.current = null;
    }
  });

  // 多天模式加载更早（往左追加7天，保持滚动位置不变）
  const handleLoadEarlier = useCallback(() => {
    if (scrollContainerRef.current) {
      // 每列: 380px 宽 + 12px gap = 392px
      scrollAdjustRef.current = LOAD_BATCH * 392;
    }
    const earliestDate = multiDayDates[0];
    const newDates = generateDatesBefore(earliestDate, LOAD_BATCH);
    setMultiDayDates((prev) => [...newDates, ...prev]);
    setMultiDayEarliestOffset((prev) => prev - LOAD_BATCH);
  }, [multiDayDates]);

  // 多天模式加载更晚（往右追加7天，无需调整滚动）
  const handleLoadLater = useCallback(() => {
    const latestDate = multiDayDates[multiDayDates.length - 1];
    const newDates = generateDatesAfter(latestDate, LOAD_BATCH);
    setMultiDayDates((prev) => [...prev, ...newDates]);
  }, [multiDayDates]);

  const loadGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/goals');
      const data = await res.json();
      if (data.data) setGoals(data.data);
    } catch (err) {
      console.error('加载目标失败:', err);
    }
  }, []);

  // 加载 tags 和 items
  const reloadItems = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/items?lite=true');
      const data = await res.json();
      if (data.data) setItems(data.data);
    } catch (err) {
      console.error('加载事项失败:', err);
    }
  }, []);

  const handleItemCreated = useCallback((item: Item) => {
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
  }, []);

  const handleTagCreated = useCallback((tag: Tag) => {
    setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
  }, []);

  // 加载记录页首屏（合并 items / records / 当前活动 / 工具）
  const fetchRecords = useCallback(async () => {
    if (isMultiDay && multiDayDates.length === 0) return;

    const isFirstLoad = !bootstrapMetaLoadedRef.current;
    setRecordsLoading(true);
    if (isFirstLoad) {
      setItemsLoading(true);
      setToolsLoading(true);
    }
    try {
      const params = new URLSearchParams();
      if (isMultiDay) {
        params.set('date_from', multiDayDates[0]);
        params.set('date_to', multiDayDates[multiDayDates.length - 1]);
      } else {
        params.set('date', singleDayDate);
        params.set('limit', '200');
      }
      if (filterType) params.set('type', filterType);
      if (filterTagId) params.set('tag_id', filterTagId);
      if (filterItemId) params.set('item_id', filterItemId);
      if (filterSearch.trim()) params.set('search', filterSearch.trim());

      const res = await fetch(`/api/v2/records/bootstrap?${params.toString()}`);
      let data = await res.json();
      // 500 时重试一次（种子规则并发写入可能导致瞬时连接池打满）
      if (!res.ok && res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1200));
        const retryRes = await fetch(`/api/v2/records/bootstrap?${params.toString()}`);
        data = await retryRes.json();
        if (!retryRes.ok && !data.data) {
          showError(typeof data.error === 'string' ? data.error : data.error?.message ?? '加载记录失败');
          return;
        }
      } else if (!res.ok) {
        showError(typeof data.error === 'string' ? data.error : data.error?.message ?? '加载记录失败');
        return;
      }
      if (data.data) {
        const loadedItems = data.data.items ?? [];
        const loadedRecords = (data.data.records ?? []) as Record[];
        const tombstones = loadDeletedRecordTombstones();
        for (const id of [...tombstones]) {
          if (!loadedRecords.some((r) => r.id === id)) {
            removeDeletedRecordTombstone(tombstones, id);
          }
        }
        resolveSession()?.reconcileTombstones(loadedRecords.map((r) => r.id));
        const filteredRecords = filterRecordsForBootstrap(loadedRecords, [...tombstones]);
        setRecords(sortRecords(filteredRecords));
        setItems(loadedItems);
        setUserTools(data.data.tools ?? []);
        if (isFirstLoad) {
          const current = data.data.current_activity as Record | null | undefined;
          resolveSession()?.hydrateFromBootstrap(current);
        }
        if (isFirstLoad && data.data.tags) {
          setTags(data.data.tags);
          tagsLoadedRef.current = true;
        }
        if (isFirstLoad && Array.isArray(data.data.user_rules)) {
          setUserRules(data.data.user_rules);
        }
        bootstrapMetaLoadedRef.current = true;
        setPageReady(true);
        if (needsCategorySeed(loadedItems)) {
          void ensureCategoryItems(loadedItems).then((next) => {
            if (next) setItems(next);
          });
        }
        if (isFirstLoad) {
          void initSeedRulesOnce(loadedItems);
        }
      } else if (data.error) {
        showError(data.error.message ?? '加载记录失败');
      }
    } catch (err) {
      console.error('加载记录失败:', err);
      showError('加载记录失败，请刷新重试');
    } finally {
      setRecordsLoading(false);
      setItemsLoading(false);
      setToolsLoading(false);
    }
  }, [isMultiDay, multiDayDates, singleDayDate, filterType, filterTagId, filterItemId, filterSearch]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, refreshKey]);

  useEffect(() => {
    if (editingRecord) {
      void loadGoals();
    }
  }, [editingRecord, loadGoals]);

  const applySessionAction = useCallback((data: SessionActionPayload) => {
    resolveSession()?.applySessionAction(data);
  }, []);

  const applyActivitySwitch = useCallback((data: ActivitySwitchPayload) => {
    if (data.record) {
      setTimingPanelsExpanded(true);
    } else {
      setTimingPanelsExpanded(false);
    }
    sessionRef.current?.applyActivitySwitchPayload(data);
  }, []);

  const applyRecordAdded = useCallback(
    (record: Record, replaceOptimistic = true) => {
      if (resolveSession()?.isTombstoned(record.id)) return;
      setRecords((prev) =>
        replaceOptimistic
          ? replaceOptimisticRecord(prev, record, items, singleDayDate)
          : sortRecords([enrichRecord(record, items, singleDayDate), ...prev])
      );
    },
    [items, singleDayDate]
  );

  const handleRecordCreated = () => {
    // 新记录已从录入框入库：关掉右侧编辑抽屉，避免误以为还要「改原文」
    setEditingRecord(null);
    setRefreshKey((k) => k + 1);
  };

  const applyRecordUpdated = useCallback(
    (updated: Record) => {
      if (resolveSession()?.state.activity?.id === updated.id) {
        setTimingPanelsExpanded(true);
      }
      resolveSession()?.applyRecordUpdated(updated);
    },
    []
  );

  const applyRecordDeleted = useCallback((id: string) => {
    resolveSession()?.applyRecordDeleted(id);
  }, []);

  const isRecordDeleted = useCallback(
    (recordId: string) => resolveSession()?.isTombstoned(recordId) ?? false,
    []
  );

  const handleRecordUpdated = useCallback(
    (updated: Record) => {
      applyRecordUpdated(updated);
      setEditingRecord((prev) => (prev?.id === updated.id ? updated : prev));
    },
    [applyRecordUpdated]
  );

  const handleConfirmClassification = useCallback(
    async (record: Record) => {
      try {
        const res = await fetch(`/api/v2/records/${record.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ review_status: 'confirmed' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data?.id) applyRecordUpdated(data.data as Record);
        }
        // 确认后写入关键词词典，下次同类输入自动归属
        if (record.item_id) {
          const parsed = record.parsed_semantic as { action_text?: string } | null | undefined;
          const keyword = (parsed?.action_text?.trim()) ||
            (record.raw_input?.trim().replace(/[¥￥\d.,元块小时分钟]+/g, '').trim()) ||
            record.content?.trim();
          if (keyword && keyword.length >= 2) {
            void fetch('/api/v2/user-rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rule_type: 'item_mapping',
                trigger_pattern: keyword.slice(0, 20),
                target_id: record.item_id,
                target_type: 'item',
                source: 'user_confirm',
                confidence: 'high',
                is_active: true,
              }),
            });
          }
        }
      } catch {
        showError('确认归属失败');
      }
    },
    [applyRecordUpdated, showError]
  );

  const handlePlanPriorityChange = useCallback(
    async (record: Record, priority: PlanPriority | null) => {
      try {
        const res = await fetch(`/api/v2/records/${record.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subcategory: planPriorityToSubcategory(priority) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message ?? '更新优先级失败');
        if (data.data) applyRecordUpdated(data.data);
      } catch (e) {
        showError(e instanceof Error ? e.message : '更新优先级失败');
      }
    },
    [applyRecordUpdated, showError]
  );

  const handlePlanCompleteFromCard = useCallback((record: Record) => {
    setCompletingRecord(record);
    setCompleteDate(todayStr);
    setCompleteTime(
      new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    );
    setCompletionContent('');
  }, [todayStr]);

  const handleRecordDeleted = useCallback(
    (id: string) => {
      applyRecordDeleted(id);
      setEditingRecord(null);
    },
    [applyRecordDeleted]
  );

  const handleDeleteFailed = useCallback((record: Record) => {
    if (isOptimisticRecordId(record.id) || isOptimisticBlockSegmentId(record.id)) {
      return;
    }
    resolveSession()?.onDeleteFailed(record);
  }, []);

  // 多天模式 ←/→（一次移动2天）
  const handleMultiPrev = () => {
    setMultiDayDates((prev) => prev.map((d) => {
      const dd = new Date(d + 'T00:00:00');
      dd.setDate(dd.getDate() - 2);
      return formatDate(dd);
    }));
  };
  const handleMultiNext = () => {
    setMultiDayDates((prev) => prev.map((d) => {
      const dd = new Date(d + 'T00:00:00');
      dd.setDate(dd.getDate() + 2);
      return formatDate(dd);
    }));
  };

  // 单日模式导航
  const handleSinglePrev = () => setSingleDayOffset((prev) => prev - 1);
  const handleSingleNext = () => setSingleDayOffset((prev) => prev + 1);
  const handleBackToToday = () => {
    if (isMultiDay) {
      if (multiDayDates.includes(todayStr)) {
        // 今天已在视图中，直接滚动到今天列（保留已加载数据）
        todayColRef.current?.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      } else {
        // 今天不在视图中，重置为昨天/今天/明天
        initMultiDayDates();
      }
    } else {
      setSingleDayOffset(0);
    }
  };

  // 多天模式切换
  const handleToggleMultiDay = () => {
    if (isMultiDay) {
      setIsMultiDay(false);
      setSingleDayOffset(0);
    } else {
      initMultiDayDates();
      setIsMultiDay(true);
    }
  };

  const pendingAsRecords = useMemo(() => pendingInputs.map(toPendingRecord), [pendingInputs]);
  const recordsWithPending = useMemo(
    () => sortRecords([...pendingAsRecords, ...records]),
    [pendingAsRecords, records]
  );

  const groupedRecords = useMemo(() => {
    return multiDayDates.map((date) => {
      const dayRecords = recordsWithPending.filter((r) => recordBelongsToDay(r, date));
      return { date, records: dayRecords };
    });
  }, [recordsWithPending, multiDayDates]);

  // 单日模式数据（包含计划投影）
  const singleDayRecords = recordsWithPending.filter((r) =>
    recordBelongsToDay(r, singleDayDate)
  );
  const totalRecords = isMultiDay
    ? recordsWithPending.length
    : singleDayRecords.length;

  useLayoutEffect(() => {
    if (isMultiDay) return;
    const el = timelineScrollRef.current;
    if (!el) return;
    const count = recordsWithPending.length;
    const prev = prevTimelineCountRef.current;
    prevTimelineCountRef.current = count;
    // 仅新增记录时滚到底；删除/刷新/服务端落库替换时不滚，避免闪烁
    if (count > prev) {
      el.scrollTop = el.scrollHeight;
    }
  }, [isMultiDay, recordsWithPending.length]);

  const isPendingRecord = useCallback((id: string) => id.startsWith('session:'), []);

  const handlePendingCreated = useCallback((clientSessionId: string, content: string, date: string) => {
    const nowIso = new Date().toISOString();
    const id = `session:${clientSessionId}`;
    setPendingInputs((prev) => [
      ...prev.filter((p) => p.client_session_id !== clientSessionId),
      { id, client_session_id: clientSessionId, content, date, createdAt: nowIso, lifecycle: 'parsing' },
    ]);
  }, []);

  const handlePendingResolved = useCallback((clientSessionId: string) => {
    setPendingInputs((prev) => prev.filter((p) => p.client_session_id !== clientSessionId));
  }, []);

  const handlePendingSessionPatch = useCallback(
    (
      clientSessionId: string,
      patch: Partial<
        Pick<PendingInputDraft, 'lifecycle' | 'inputId' | 'clarifySnapshot' | 'errorMessage' | 'rawContext'>
      >
    ) => {
      setPendingInputs((prev) =>
        prev.map((p) => (p.client_session_id === clientSessionId ? { ...p, ...patch } : p))
      );
    },
    []
  );

  const handleDeferResolved = useCallback((inputId: string) => {
    setPendingInputs((prev) => prev.filter((p) => p.inputId !== inputId));
  }, []);

  const handleRecordClick = useCallback(
    (record: Record) => {
      if (record.id.startsWith('session:')) {
        const draft = pendingInputs.find((p) => p.id === record.id);
        if (
          draft?.clarifySnapshot &&
          (draft.lifecycle === 'deferred' || draft.lifecycle === 'awaiting_confirmation')
        ) {
          setResumeClarify({
            nonce: Date.now(),
            snapshot: {
              ...draft.clarifySnapshot,
              client_session_id:
                draft.clarifySnapshot.client_session_id ?? draft.client_session_id,
            },
          });
        }
        return;
      }
      if (isPendingRecord(record.id)) return;
      setEditingRecord(record);
    },
    [isPendingRecord, pendingInputs]
  );

  const handleStarToggle = async (record: Record) => {
    if (record.id.startsWith('session:')) return;
    try {
      await fetch(`/api/v2/records/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_starred: !record.is_starred }),
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('切换星标失败:', err);
      showError('操作失败，请重试');
    }
  };

  // 完成计划：生成一条“发生”记录，原记录变为 completed
  const handleComplete = async (record: Record) => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    setCompleteDate(dateStr);
    setCompleteTime(timeStr);
    setCompletionContent('');
    setCompletingRecord(record);
  };

  const confirmComplete = async () => {
    if (!completingRecord) return;
    const record = completingRecord;
    setCompletingRecord(null);
    try {
      const occurredAt = `${completeDate}T${completeTime}:00+08:00`;
      const payload: { [key: string]: string } = { occurred_at: occurredAt, date: completeDate };
      if (completionContent.trim()) payload.completion_content = completionContent.trim();
      const res = await fetch(`/api/v2/records/${record.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setRefreshKey(k => k + 1);
      } else {
        const err = await res.json();
        showError(err.error || '完成操作失败');
      }
    } catch {
      showError('完成操作失败，请重试');
    }
  };

  // 推迟计划：弹出日期选择器（默认明天）
  const handlePostpone = async (record: Record) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    setPostponeDate(tomorrowStr);
    setPostponingRecord(record);
  };

  const confirmPostpone = async () => {
    if (!postponingRecord || !postponeDate) return;
    const record = postponingRecord;
    setPostponingRecord(null);
    try {
      const res = await fetch(`/api/v2/records/${record.id}/postpone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_date: postponeDate }),
      });
      if (res.ok) {
        setRefreshKey(k => k + 1);
      } else {
        const err = await res.json();
        showError(err.error || '推迟操作失败');
      }
    } catch {
      showError('推迟操作失败，请重试');
    }
  };

  // 取消计划：将计划记录标记为 cancelled，不生成新记录
  const handleCancel = async (record: Record) => {
    if (!window.confirm(`确认取消计划：「${record.content}」？\n取消后不会生成任何新记录。`)) return;
    try {
      const res = await fetch(`/api/v2/records/${record.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setRefreshKey(k => k + 1);
      } else {
        const err = await res.json();
        showError(err.error || '取消操作失败');
      }
    } catch {
      showError('取消操作失败，请重试');
    }
  };

  // 想法→计划：将想法类型记录转为计划类型
  const handleConvertToPlan = async (record: Record) => {
    if (!window.confirm(`将「${record.content}」转为计划？`)) return;
    try {
      const updatePayload: { [key: string]: unknown } = {
        type: '计划',
        lifecycle_status: 'active',
      };
      // 如果记录没有 time_anchor_date，设为今天（计划需要出现在时间线上）
      if (!record.time_anchor_date) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        updatePayload.time_anchor_date = todayStr;
      }
      const res = await fetch(`/api/v2/records/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      if (res.ok) {
        setRefreshKey(k => k + 1);
      } else {
        const err = await res.json();
        showError(err.error || '转换失败');
      }
    } catch {
      showError('转换失败，请重试');
    }
  };

  // 想法→事项：用想法内容创建新事项
  const handleConvertToItem = async (record: Record) => {
    const title = window.prompt('新事项名称：', record.content?.slice(0, 30) || '');
    if (!title?.trim()) return;
    try {
      const res = await fetch('/api/v2/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        // 将记录关联到新事项
        if (data.data?.id) {
          await fetch(`/api/v2/records/${record.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: data.data.id }),
          });
        }
        setRefreshKey(k => k + 1);
      } else if (res.status === 409) {
        // 同名事项冲突
        const data = await res.json();
        showError(data.conflict?.message || '已存在同名事项');
      } else {
        const err = await res.json();
        showError(err.error || '创建事项失败');
      }
    } catch {
      showError('创建事项失败，请重试');
    }
  };

  // 记录→目标：用记录内容创建新目标
  const handleConvertToGoal = async (record: Record) => {
    const title = window.prompt('新目标名称：', record.content?.slice(0, 30) || '');
    if (!title?.trim()) return;
    try {
      const res = await fetch('/api/v2/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: record.content,
          source: 'manual',
          ...(record.item_id ? { item_id: record.item_id } : {}),
        }),
      });
      if (res.ok) {
        setRefreshKey(k => k + 1);
      } else {
        const err = await res.json();
        showError(err.error || '创建目标失败');
      }
    } catch {
      showError('创建目标失败，请重试');
    }
  };

  return (
    <ActivitySessionProvider
      items={items}
      tags={tags}
      fallbackDate={singleDayDate}
      records={records}
      setRecords={setRecords}
      onError={showError}
    >
      {(session) => {
        sessionRef.current = session;
        const currentActivity = session.activity;
        const isTimingActive =
          !isMultiDay && isOnToday && Boolean(currentActivity ?? session.isInBlock);
        const inBlockSession =
          !isMultiDay && isOnToday && (isTimingActive || session.isInBlock || blockCategoryLocked);
        const isTimingFullscreen = inBlockSession && timingPanelsExpanded;
        const timelineRecords = session.selectTimelineRecords(recordsWithPending);

        return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* 顶部工具栏（计时全屏时隐藏） */}
      {!isTimingFullscreen && (
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className={`mx-auto flex items-center justify-between ${isMultiDay ? 'max-w-7xl' : 'max-w-2xl'}`}>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">记录</h1>
            {/* 单日模式：日期 + ←/→ + 回今日 */}
            {!isMultiDay && (
              <>
                <button
                  onClick={handleSinglePrev}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-blue-600 transition-colors"
                  aria-label="前一天"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium text-slate-700 min-w-[7rem] text-center">
                  {singleDayOffset === 0 ? '今天' : singleDayOffset === -1 ? '昨天' : singleDayOffset === 1 ? '明天' : singleDayDate}
                </span>
                <button
                  onClick={handleSingleNext}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-blue-600 transition-colors"
                  aria-label="后一天"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {!isOnToday && (
                  <button
                    onClick={handleBackToToday}
                    className="flex items-center gap-1 rounded-lg bg-blue-500 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-600 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    回今天
                  </button>
                )}
              </>
            )}
            {/* 多日模式：←/→ + 回今天（始终可见） */}
            {isMultiDay && (
              <>
                <button
                  onClick={handleMultiPrev}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-blue-600 transition-colors"
                  aria-label="前移2天"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={handleMultiNext}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-blue-600 transition-colors"
                  aria-label="后移2天"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={handleBackToToday}
                  className="flex items-center gap-1 rounded-lg bg-blue-500 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-600 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  回今天
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setFilterSearch(searchInput.trim());
                }}
                placeholder="搜索记录…"
                className="w-36 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-xs text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setFilterSearch('');
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="清除搜索"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={handleToggleMultiDay}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isMultiDay
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              {isMultiDay ? '单日' : '多天'}
            </button>
            <button
              type="button"
              onClick={() => setShowFilterBar((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                showFilterBar || hasActiveFilters
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              aria-expanded={showFilterBar}
              aria-label="筛选"
            >
              <Funnel className="h-3.5 w-3.5" />
              筛选
            </button>
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
              {totalRecords} 条
            </span>
          </div>
        </div>

        {/* 单日模式：筛选 */}
        {!isMultiDay && showFilterBar && (
          <div className="mx-auto max-w-2xl mt-3">
            <FilterBar
              filterType={filterType}
              filterItemId={filterItemId}
              items={items}
              onFilterTypeChange={setFilterType}
              onFilterItemChange={setFilterItemId}
            />
          </div>
        )}

        {/* 多日模式：筛选（折叠） */}
        {isMultiDay && showFilterBar && (
          <div className="mx-auto max-w-7xl mt-2">
            <FilterBar
              filterType={filterType}
              filterItemId={filterItemId}
              items={items}
              onFilterTypeChange={setFilterType}
              onFilterItemChange={setFilterItemId}
            />
          </div>
        )}

      </div>
      )}

      {/* 内容区（填满剩余高度） */}
      <div className="flex-1 min-h-0">
        {!isMultiDay ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="mx-auto flex w-full max-w-2xl flex-1 min-h-0 flex-col overflow-hidden px-4">
              <div className="shrink-0 pt-4 sm:hidden">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setFilterSearch(searchInput.trim());
                    }}
                    placeholder="搜索记录内容…"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm focus:border-blue-300 focus:outline-none"
                  />
                  {filterSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setFilterSearch('');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600"
                    >
                      清除
                    </button>
                  )}
                </div>
                {filterSearch && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    搜索「{filterSearch}」共 {records.length} 条
                  </p>
                )}
              </div>

              {/* 统计抬头：sticky 吸顶，不随任何内容滚动 */}
              {isOnToday && (
                <div className="sticky top-0 z-20 shrink-0 bg-slate-100 pt-3 pb-1">
                  <TodayStatusCard
                    date={todayStr}
                    records={singleDayRecords}
                    currentActivity={currentActivity}
                    items={items}
                    compact
                  />
                </div>
              )}

              {/* 时间轴区域：内部白卡片自带滚动 */}
              <div
                ref={timelineScrollRef}
                className="flex-1 min-h-0 overflow-hidden py-4"
              >
                {recordsLoading && records.length === 0 ? (
                  <RecordsDayContentSkeleton />
                ) : (
                  <TodayActivityTimeline
                    records={timelineRecords}
                    date={singleDayDate}
                    items={items}
                    onRecordClick={handleRecordClick}
                    onPlanComplete={handleComplete}
                    onRecordDeleted={applyRecordDeleted}
                    onDeleteFailed={handleDeleteFailed}
                    onError={showError}
                  />
                )}
              </div>

              {isOnToday && (
                <div className="shrink-0 pb-4">
                  <CurrentActivityCard
                    items={items}
                    itemsLoading={itemsLoading}
                    pageReady={pageReady}
                    refreshKey={refreshKey}
                    isRecordDeleted={isRecordDeleted}
                    userTools={userTools}
                    toolsLoading={toolsLoading}
                    onToolsChange={setUserTools}
                    onActivitySwitch={applyActivitySwitch}
                    onRecordAdded={applyRecordAdded}
                    onRecordDeleted={applyRecordDeleted}
                    onFallbackRefresh={() => setRefreshKey((k) => k + 1)}
                    onItemsChanged={reloadItems}
                    onItemCreated={handleItemCreated}
                    onCreateError={showError}
                    onError={showError}
                    todayRecords={singleDayRecords}
                    todayDate={todayStr}
                    quickSwitchRecords={records.filter((r) => r.type === '发生')}
                    tags={tags}
                    onPlanComplete={handlePlanCompleteFromCard}
                    onPlanPriorityChange={handlePlanPriorityChange}
                    onTagCreated={handleTagCreated}
                    userRules={userRules}
                    onRecordPatched={applyRecordUpdated}
                    onSessionAction={applySessionAction}
                    onAiEnhanceStart={(id) =>
                      setAiEnhancingIds((prev) => new Set([...prev, id]))
                    }
                    onAiEnhanceEnd={(id) =>
                      setAiEnhancingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      })
                    }
                    onNewItemSuggested={(s) =>
                      setNewItemSuggestionQueue((prev) =>
                        prev.some((x) => x.recordId === s.recordId) ? prev : [...prev, s]
                      )
                    }
                    drawerExpanded={inBlockSession ? timingPanelsExpanded : undefined}
                    onDrawerExpandedChange={
                      inBlockSession ? setTimingPanelsExpanded : undefined
                    }
                  />
                </div>
              )}
            </div>
          </div>
        ) : recordsLoading && records.length === 0 ? (
          <RecordsMultiDaySkeleton />
        ) : (
          <div
            ref={scrollContainerRef}
            className="h-full overflow-x-auto overflow-y-hidden"
          >
            <div className="flex gap-3 h-full px-4 py-4 items-stretch">
              {/* 加载更早日期按钮（最左列外侧） */}
              <button
                onClick={handleLoadEarlier}
                className="shrink-0 flex flex-col items-center justify-center w-10 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
                aria-label="加载更早日期"
              >
                <ChevronsLeft className="h-4 w-4" />
                <span className="text-[9px] mt-1 leading-none">更早</span>
              </button>

              {groupedRecords.map((group) => {
                const isToday = group.date === todayStr;
                return (
                  <div key={group.date} ref={isToday ? todayColRef : undefined}>
                    <DayRecordGroup
                      date={group.date}
                      records={group.records}
                      allItems={items}
                      layout="column"
                      aiPendingIds={aiPendingIds}
                      onRecordClick={handleRecordClick}
                      onStarToggle={handleStarToggle}
                      onComplete={handleComplete}
                      onPostpone={handlePostpone}
                      onCancel={handleCancel}
                      onConvertToPlan={handleConvertToPlan}
                      onConvertToItem={handleConvertToItem}
                      onConvertToGoal={handleConvertToGoal}
                      onConfirmClassification={handleConfirmClassification}
                      onError={showError}
                    />
                  </div>
                );
              })}

              {/* 加载更晚日期按钮（最右列外侧） */}
              <button
                onClick={handleLoadLater}
                className="shrink-0 flex flex-col items-center justify-center w-10 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
                aria-label="加载更晚日期"
              >
                <ChevronsRight className="h-4 w-4" />
                <span className="text-[9px] mt-1 leading-none">更晚</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {editingRecord && (
        <RecordEditDrawer
          record={editingRecord}
          tags={tags}
          items={items}
          goals={goals}
          onClose={() => setEditingRecord(null)}
          onSaved={handleRecordUpdated}
          onDeleted={handleRecordDeleted}
          onDeleteFailed={handleDeleteFailed}
          onError={showError}
          onItemsChange={reloadItems}
          onItemCreated={handleItemCreated}
          onTagCreated={handleTagCreated}
          onCreateError={showError}
        />
      )}

      {/* 完成计划对话框：实际完成内容+日期+时间 */}
      {completingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCompletingRecord(null)}>
          <div className="bg-white rounded-xl shadow-lg p-5 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800">完成计划</h3>
            <p className="text-xs text-slate-500">{completingRecord.content}</p>
            <div className="space-y-2">
              <label className="block text-xs text-slate-600">
                完成说明
                <textarea
                  value={completionContent}
                  onChange={(e) => setCompletionContent(e.target.value)}
                  placeholder="描述实际完成了什么（可选，留空则沿用原计划内容）"
                  rows={2}
                  className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </label>
              <label className="block text-xs text-slate-600">
                完成日期
                <input type="date" value={completeDate} onChange={(e) => setCompleteDate(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none" />
              </label>
              <label className="block text-xs text-slate-600">
                完成时间
                <input type="time" value={completeTime} onChange={(e) => setCompleteTime(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none" />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCompletingRecord(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">取消</button>
              <button onClick={confirmComplete}
                className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600">确认完成</button>
            </div>
          </div>
        </div>
      )}

      {/* 推迟计划对话框：日期选择 */}
      {postponingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPostponingRecord(null)}>
          <div className="bg-white rounded-xl shadow-lg p-5 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800">推迟计划</h3>
            <p className="text-xs text-slate-500">{postponingRecord.content}</p>
            <label className="block text-xs text-slate-600">
              推迟到
              <input type="date" value={postponeDate} onChange={(e) => setPostponeDate(e.target.value)}
                className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPostponingRecord(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">取消</button>
              <button onClick={confirmPostpone}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">确认推迟</button>
            </div>
          </div>
        </div>
      )}
      {currentSuggestion && (
        <NewItemConfirmBubble
          suggestion={currentSuggestion}
          items={items}
          onConfirmed={(newItem, fnTag) => {
            handleItemCreated(newItem);
            if (fnTag) handleTagCreated(fnTag);
            // 刷新记录列表以反映新事项归属
            setRefreshKey((k) => k + 1);
            setNewItemSuggestionQueue((prev) => prev.slice(1));
          }}
          onDismiss={() => setNewItemSuggestionQueue((prev) => prev.slice(1))}
          onError={showError}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
        );
      }}
    </ActivitySessionProvider>
  );
}
