'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, RotateCcw, LayoutGrid, ChevronsLeft, ChevronsRight, Funnel } from 'lucide-react';
import type { Goal, Item, Record, Tag, RecordType, UserTool } from '@/types/teto';
import { type IngestClarifyState } from './components/QuickInput';
import FilterBar from './components/FilterBar';
import DayRecordGroup from './components/DayRecordGroup';
import RecordEditDrawer from './components/RecordEditDrawer';
import CurrentActivityCard from './components/CurrentActivityCard';
import QuickSwitchPanel, { type ActivitySwitchResult } from './components/QuickSwitchPanel';
import { recordBelongsToDay } from '@/lib/activity/timeline-utils';
import { postBackfillRecord } from '@/lib/activity/post-backfill-record';
import { ensureCategoryItems, needsCategorySeed } from '@/lib/activity/ensure-categories';
import { sortRecords } from '@/lib/activity/sort-records';
import {
  mergeSwitchIntoRecords,
  mergeRecordUpdated,
  mergeRecordDeleted,
  replaceOptimisticRecord,
  enrichRecord,
  type ActivitySwitchPayload,
} from '@/lib/activity/records-mutation';
import TodayActivityTimeline from './components/TodayActivityTimeline';
import TodayActivityStats from './components/TodayActivityStats';
import StartActivityPanel, { type StartActivitySubmitPayload } from './components/StartActivityPanel';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { RecordsDayContentSkeleton, RecordsMultiDaySkeleton } from '@/components/ui/PageSkeletons';

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
  const [filterTagId, setFilterTagId] = useState('');
  const [filterItemId, setFilterItemId] = useState(() => searchParams.get('item_id') || '');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingRecord, setEditingRecord] = useState<Record | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [pageReady, setPageReady] = useState(false);
  const [pendingInputs, setPendingInputs] = useState<PendingInputDraft[]>([]);
  const [resumeClarify, setResumeClarify] = useState<{
    nonce: number;
    snapshot: IngestClarifyState;
  } | null>(null);
  // 1.7：补记面板
  const [backfillPanel, setBackfillPanel] = useState<{ startIso?: string; endIso?: string } | null>(null);
  const [currentActivity, setCurrentActivity] = useState<Record | null>(null);
  const [activitySyncToken, setActivitySyncToken] = useState(0);
  const [showFilterBar, setShowFilterBar] = useState(false);
  const tagsLoadedRef = useRef(false);
  const bootstrapMetaLoadedRef = useRef(false);

  const hasActiveFilters = Boolean(filterType || filterItemId);

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
    return new Set(
      pendingInputs.filter((p) => p.lifecycle === 'parsing').map((p) => p.id)
    );
  }, [pendingInputs]);
  const { toasts, showError, dismissToast } = useToast();

  // 计划完成/推迟对话框状态
  const [completingRecord, setCompletingRecord] = useState<Record | null>(null);
  const [completeDate, setCompleteDate] = useState('');
  const [completeTime, setCompleteTime] = useState('');
  const [completionContent, setCompletionContent] = useState('');
  const [postponingRecord, setPostponingRecord] = useState<Record | null>(null);
  const [postponeDate, setPostponeDate] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
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

  const loadTags = useCallback(async () => {
    if (tagsLoadedRef.current) return;
    tagsLoadedRef.current = true;
    try {
      const res = await fetch('/api/v2/tags');
      const data = await res.json();
      if (data.data) setTags(data.data);
    } catch (err) {
      console.error('加载标签失败:', err);
      tagsLoadedRef.current = false;
    }
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

      const res = await fetch(`/api/v2/records/bootstrap?${params.toString()}`);
      const data = await res.json();
      if (data.data) {
        const loadedItems = data.data.items ?? [];
        setRecords(sortRecords(data.data.records ?? []));
        setItems(loadedItems);
        setUserTools(data.data.tools ?? []);
        setCurrentActivity(data.data.current_activity ?? null);
        bootstrapMetaLoadedRef.current = true;
        setPageReady(true);
        if (needsCategorySeed(loadedItems)) {
          void ensureCategoryItems(loadedItems).then((next) => {
            if (next) setItems(next);
          });
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
  }, [isMultiDay, multiDayDates, singleDayDate, filterType, filterTagId, filterItemId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, refreshKey]);

  useEffect(() => {
    if (editingRecord) {
      void loadTags();
      void loadGoals();
    }
  }, [editingRecord, loadTags, loadGoals]);

  const applyActivitySwitch = useCallback(
    (data: ActivitySwitchPayload) => {
      setCurrentActivity(data.record);
      setActivitySyncToken((t) => t + 1);
      setRecords((prev) => mergeSwitchIntoRecords(prev, data, items, singleDayDate));
    },
    [items, singleDayDate]
  );

  const applyRecordAdded = useCallback(
    (record: Record, replaceOptimistic = true) => {
      setRecords((prev) =>
        replaceOptimistic
          ? replaceOptimisticRecord(prev, record, items, singleDayDate)
          : sortRecords([enrichRecord(record, items, singleDayDate), ...prev])
      );
    },
    [items, singleDayDate]
  );

  const handleActivitySwitched = useCallback(
    (data: ActivitySwitchPayload) => {
      applyActivitySwitch(data);
    },
    [applyActivitySwitch]
  );

  const handleRecordCreated = () => {
    // 新记录已从录入框入库：关掉右侧编辑抽屉，避免误以为还要「改原文」
    setEditingRecord(null);
    setRefreshKey((k) => k + 1);
  };

  const applyRecordUpdated = useCallback(
    (updated: Record) => {
      setRecords((prev) => mergeRecordUpdated(prev, updated, items, singleDayDate));
      setCurrentActivity((prev) => (prev?.id === updated.id ? updated : prev));
      setActivitySyncToken((t) => t + 1);
    },
    [items, singleDayDate]
  );

  const applyRecordDeleted = useCallback((id: string) => {
    setRecords((prev) => mergeRecordDeleted(prev, id));
    setCurrentActivity((prev) => (prev?.id === id ? null : prev));
    setActivitySyncToken((t) => t + 1);
  }, []);

  const handleRecordUpdated = useCallback(
    (updated: Record) => {
      applyRecordUpdated(updated);
      setEditingRecord(null);
    },
    [applyRecordUpdated]
  );

  const handleRecordDeleted = useCallback(
    (id: string) => {
      applyRecordDeleted(id);
      setEditingRecord(null);
    },
    [applyRecordDeleted]
  );

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
    <div className="h-full flex flex-col bg-slate-100">
      {/* 顶部工具栏（固定） */}
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

      {/* 内容区（填满剩余高度） */}
      <div className="flex-1 min-h-0">
        {!isMultiDay ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-2xl px-4 py-4">
              <div className="space-y-4">
                {isOnToday && (
                  <>
                    <CurrentActivityCard
                      items={items}
                      itemsLoading={itemsLoading}
                      pageReady={pageReady}
                      initialActivity={currentActivity}
                      refreshKey={refreshKey}
                      activitySyncToken={activitySyncToken}
                      syncActivity={currentActivity}
                      userTools={userTools}
                      toolsLoading={toolsLoading}
                      onToolsChange={setUserTools}
                      onActivitySwitch={applyActivitySwitch}
                      onRecordAdded={applyRecordAdded}
                      onFallbackRefresh={() => setRefreshKey((k) => k + 1)}
                      onItemsChanged={reloadItems}
                      onItemCreated={handleItemCreated}
                      onCreateError={showError}
                      onActivityChange={setCurrentActivity}
                      onError={showError}
                    />
                    <QuickSwitchPanel
                      supplementRecords={records.filter((r) => r.type === '发生')}
                      items={items}
                      userTools={userTools}
                      toolsLoading={toolsLoading}
                      onSwitched={handleActivitySwitched}
                      onError={showError}
                    />
                  </>
                )}
                {recordsLoading && records.length === 0 ? (
                  <RecordsDayContentSkeleton />
                ) : (
                  <>
                    <TodayActivityTimeline
                      records={recordsWithPending}
                      date={singleDayDate}
                      items={items}
                      onGapClick={(startIso, endIso) =>
                        setBackfillPanel({ startIso, endIso })
                      }
                      onRecordClick={handleRecordClick}
                      onPlanComplete={handleComplete}
                    />
                    <TodayActivityStats
                      records={singleDayRecords}
                      date={singleDayDate}
                      currentActivity={isOnToday ? currentActivity : null}
                      items={items}
                    />
                  </>
                )}
              </div>
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
          onError={showError}
          onItemsChange={reloadItems}
          onItemCreated={handleItemCreated}
          onCreateError={showError}
        />
      )}

      {/* 1.7：补记面板（点击时间线空白区域触发） */}
      {backfillPanel !== null && (
        <StartActivityPanel
          open
          mode="backfill"
          items={items}
          onItemsChange={reloadItems}
          onItemCreated={handleItemCreated}
          onCreateError={showError}
          backfillDate={singleDayDate}
          initialStart={backfillPanel.startIso}
          initialEnd={backfillPanel.endIso}
          gapStartIso={backfillPanel.startIso}
          gapEndIso={backfillPanel.endIso}
          onClose={() => setBackfillPanel(null)}
          onSubmit={async (payload) => {
            await postBackfillRecord(payload, singleDayDate);
            setBackfillPanel(null);
            setRefreshKey((k) => k + 1);
          }}
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
                实际完成内容
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
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
