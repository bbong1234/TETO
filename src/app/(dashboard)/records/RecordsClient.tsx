'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, RotateCcw, LayoutGrid, ChevronsLeft, ChevronsRight, CheckSquare, X, Trash2, CalendarClock, CheckCircle2 } from 'lucide-react';
import type { Record, Tag, Item, RecordType } from '@/types/teto';
import QuickInput, { type IngestClarifyState } from './components/QuickInput';
import FilterBar from './components/FilterBar';
import RecordList from './components/RecordList';
import DayRecordGroup from './components/DayRecordGroup';
import RecordEditDrawer from './components/RecordEditDrawer';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';

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

const LOAD_BATCH = 7;

const STORAGE_KEY_MULTI_DAY = 'teto_records_multi_day';
const STORAGE_KEY_PENDING_INPUTS = 'teto_records_pending_inputs_v1';

function getRecordDisplayDate(r: Record): string {
  if (r.type === '计划' && r.time_anchor_date && r.time_anchor_date !== r.date) {
    return r.time_anchor_date;
  }
  return r.date ?? '';
}

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
  const [multiDayDates, setMultiDayDates] = useState<string[]>([]);
  const [multiDayEarliestOffset, setMultiDayEarliestOffset] = useState(0);
  const [records, setRecords] = useState<Record[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filterType, setFilterType] = useState<RecordType | ''>('');
  const [filterTagId, setFilterTagId] = useState('');
  const [filterItemId, setFilterItemId] = useState(() => searchParams.get('item_id') || '');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingRecord, setEditingRecord] = useState<Record | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingInputs, setPendingInputs] = useState<PendingInputDraft[]>([]);
  const [resumeClarify, setResumeClarify] = useState<{
    nonce: number;
    snapshot: IngestClarifyState;
  } | null>(null);

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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const { toasts, showError, dismissToast } = useToast();

  // ================================
  // 客户端排序：按记录类型不同排序方向
  // 发生/想法/总结：从晚到早（最新在上）
  // 计划：从早到晚（最早在上）
  // 无时间记录：按创建时间（紧邻同批次有时间的记录）
  // ================================
  /** 从 time_text 提取时间段排序权重（0-23） */
  const getTimeTextWeight = (timeText: string | null | undefined): number => {
    if (!timeText) return 12;
    const lower = timeText.toLowerCase();
    if (lower.includes('凌晨') || lower.includes('深夜')) return 0;
    if (lower.includes('早上') || lower.includes('早晨') || lower.includes('清晨') || lower.includes('上午')) return 8;
    if (lower.includes('中午') || lower.includes('午饭') || lower.includes('午休')) return 12;
    if (lower.includes('下午')) return 15;
    if (lower.includes('傍晚') || lower.includes('黄昏')) return 18;
    if (lower.includes('晚上') || lower.includes('夜晚') || lower.includes('夜里') || lower.includes('晚饭')) return 20;
    const hourMatch = timeText.match(/(\d{1,2})\s*点/);
    if (hourMatch) {
      let h = parseInt(hourMatch[1]);
      if (h <= 12 && (lower.includes('下午') || lower.includes('晚上'))) h += 12;
      return h;
    }
    return 12;
  };

  /** 获取计划记录的可排序时间值（综合 time_anchor_date + time_text 时段权重） */
  const getPlanSortKey = (record: Record): string => {
    if (record.occurred_at) return record.occurred_at;
    const dateStr = record.time_anchor_date || record.created_at;
    // 在日期后追加小时权重，使字符串比较也能正确排序
    const weight = getTimeTextWeight(record.time_text);
    return `${dateStr}T${String(weight).padStart(2, '0')}:00:00`;
  };

  const sortRecords = (rawRecords: Record[]): Record[] => {
    // 1. 按 batch_id 分组（同批次拆分记录排在一起）
    const batchMap = new Map<string, Record[]>();
    const standalone: Record[] = [];
    for (const r of rawRecords) {
      if (r.batch_id) {
        if (!batchMap.has(r.batch_id)) batchMap.set(r.batch_id, []);
        batchMap.get(r.batch_id)!.push(r);
      } else {
        standalone.push(r);
      }
    }

    // 2. 为每组 batch 计算排序键（含 time_text / time_anchor_date 供计划排序）
    //    同时对批次内记录按各自时间排序（批次整体排序后，内部也应有正确顺序）
    const batchSortKey = new Map<string, { occurred_at: string | null; created_at: string; type: string; time_text: string | null; time_anchor_date: string | null }>();
    for (const [batchId, group] of batchMap) {
      const isPlan = group[0]?.type === '计划';
      // 批次内记录按各自时间排序
      if (isPlan) {
        // 计划：升序（最早在上）
        group.sort((a, b) => getPlanSortKey(a).localeCompare(getPlanSortKey(b)));
      } else {
        // 发生/想法/总结：降序（最新在上）
        group.sort((a, b) => {
          const aTime = a.occurred_at || a.created_at;
          const bTime = b.occurred_at || b.created_at;
          return bTime.localeCompare(aTime);
        });
      }
      // 排序键：计划用最早的记录，其他用最晚的记录
      const keyRecord = isPlan ? group[0] : group[0]; // 排序后 [0] 已是极值
      const withTime = group.find(r => r.occurred_at && r.time_precision !== 'inherited');
      batchSortKey.set(batchId, {
        occurred_at: withTime?.occurred_at || null,
        created_at: keyRecord.created_at,
        type: keyRecord.type,
        time_text: keyRecord.time_text ?? null,
        time_anchor_date: keyRecord.time_anchor_date ?? null,
      });
    }

    // 3. 将 batch 组和 standalone 统一为排序单元
    type SortUnit = { sortKey: { occurred_at: string | null; created_at: string; type: string; time_text: string | null; time_anchor_date: string | null }; records: Record[] };
    const units: SortUnit[] = [];

    for (const r of standalone) {
      units.push({ sortKey: { occurred_at: r.occurred_at, created_at: r.created_at, type: r.type, time_text: r.time_text ?? null, time_anchor_date: r.time_anchor_date ?? null }, records: [r] });
    }
    for (const [batchId, group] of batchMap) {
      units.push({ sortKey: batchSortKey.get(batchId)!, records: group });
    }

    // 4. 排序：计划类型升序（最早在上），其他类型降序（最新在上）
    units.sort((a, b) => {
      const aIsPlan = a.sortKey.type === '计划';
      const bIsPlan = b.sortKey.type === '计划';

      // 先按类型分组：计划排前面，其他排后面
      if (aIsPlan !== bIsPlan) return aIsPlan ? -1 : 1;

      if (aIsPlan && bIsPlan) {
        // 计划：从早到晚（最早在上）
        // 使用 getPlanSortKey 综合 time_anchor_date + time_text 时段权重排序
        const aKey = a.sortKey.occurred_at
          ? a.sortKey.occurred_at
          : `${a.sortKey.time_anchor_date || a.sortKey.created_at}T${String(getTimeTextWeight(a.sortKey.time_text)).padStart(2, '0')}:00:00`;
        const bKey = b.sortKey.occurred_at
          ? b.sortKey.occurred_at
          : `${b.sortKey.time_anchor_date || b.sortKey.created_at}T${String(getTimeTextWeight(b.sortKey.time_text)).padStart(2, '0')}:00:00`;
        return aKey.localeCompare(bKey);
      } else {
        // 发生/想法/总结：从晚到早（最新在上）
        const aTime = a.sortKey.occurred_at || a.sortKey.created_at;
        const bTime = b.sortKey.occurred_at || b.sortKey.created_at;
        return bTime.localeCompare(aTime);
      }
    });

    // 5. 展平结果
    return units.flatMap(u => u.records);
  };

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

  // 初始化多天日期（如果是多天模式且日期列表为空）
  useEffect(() => {
    if (isMultiDay && multiDayDates.length === 0) {
      initMultiDayDates();
    }
  }, []);

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
    if (!loading && needScrollToTodayRef.current && isMultiDay) {
      needScrollToTodayRef.current = false;
      requestAnimationFrame(() => {
        todayColRef.current?.scrollIntoView({
          behavior: 'instant',
          inline: 'center',
          block: 'nearest',
        });
      });
    }
  }, [loading, isMultiDay]);

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

  // 加载 tags 和 items
  useEffect(() => {
    async function loadMeta() {
      try {
        const [tagsRes, itemsRes] = await Promise.all([
          fetch('/api/v2/tags'),
          fetch('/api/v2/items'),
        ]);
        const tagsData = await tagsRes.json();
        const itemsData = await itemsRes.json();
        if (tagsData.data) setTags(tagsData.data);
        if (itemsData.data) setItems(itemsData.data);
      } catch (err) {
        console.error('加载标签/事项失败:', err);
        showError('加载标签/事项失败，请刷新重试');
      }
    }
    loadMeta();
  }, []);

  // 加载记录
  const fetchRecords = useCallback(async () => {
    // 多天模式下，日期列表未初始化时跳过（等 initMultiDayDates 填充后再请求）
    if (isMultiDay && multiDayDates.length === 0) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isMultiDay) {
        params.set('date_from', multiDayDates[0]);
        params.set('date_to', multiDayDates[multiDayDates.length - 1]);
      } else {
        params.set('date', singleDayDate);
      }
      if (filterType) params.set('type', filterType);
      if (filterTagId) params.set('tag_id', filterTagId);
      if (filterItemId) params.set('item_id', filterItemId);

      const res = await fetch(`/api/v2/records?${params.toString()}`);
      const data = await res.json();
      if (data.data) {
        setRecords(sortRecords(data.data));
      }
    } catch (err) {
      console.error('加载记录失败:', err);
      showError('加载记录失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [isMultiDay, multiDayDates, singleDayDate, filterType, filterTagId, filterItemId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, refreshKey]);

  const handleRecordCreated = () => {
    // 新记录已从录入框入库：关掉右侧编辑抽屉，避免误以为还要「改原文」
    setEditingRecord(null);
    setRefreshKey((k) => k + 1);
  };

  const handleRecordUpdated = () => {
    setEditingRecord(null);
    setRefreshKey((k) => k + 1);
  };

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
      const dayRecords = recordsWithPending.filter((r) => getRecordDisplayDate(r) === date);
      return { date, records: dayRecords };
    });
  }, [recordsWithPending, multiDayDates]);

  // 单日模式数据（包含计划投影）
  const singleDayRecords = recordsWithPending.filter((r) => getRecordDisplayDate(r) === singleDayDate);
  const totalRecords = isMultiDay
    ? recordsWithPending.length
    : singleDayRecords.length;

  // 今日到期计划（类型=计划 + time_anchor_date=今天 + lifecycle_status=active 或 null）
  const dueTodayPlans = useMemo(() => {
    return records.filter(r =>
      r.type === '计划' &&
      r.time_anchor_date === todayStr &&
      (!r.lifecycle_status || r.lifecycle_status === 'active')
    );
  }, [records, todayStr]);

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

  const quickInputDate = todayStr;

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

  // 多选模式操作
  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      setSelectionMode(true);
    }
  };

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = () => {
    // 单日模式：toggle 全选/取消全选
    const allIds = singleDayRecords.map(r => r.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  // 多天模式：全选/取消全选指定日期的记录
  const handleSelectAllForDate = (date: string) => {
    const dayIds = records.filter(r => getRecordDisplayDate(r) === date).map(r => r.id);
    const allSelected = dayIds.length > 0 && dayIds.every(id => selectedIds.has(id));
    if (allSelected) {
      // 该日已全选 → 取消全选该日
      setSelectedIds(prev => {
        const next = new Set(prev);
        dayIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // 该日未全选 → 全选该日
      setSelectedIds(prev => {
        const next = new Set(prev);
        dayIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    // 根据选中记录数给出不同级别的确认提示
    const msg = selectedIds.size > 20
      ? `你正在删除 ${selectedIds.size} 条记录，此操作不可撤销。确定继续？`
      : `确定删除选中的 ${selectedIds.size} 条记录？此操作不可撤销。`;
    const confirmed = window.confirm(msg);
    if (!confirmed) return;

    setBatchDeleting(true);
    try {
      const res = await fetch('/api/v2/records/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setSelectionMode(false);
        setRefreshKey(k => k + 1);
      } else {
        const err = await res.json();
        showError(err.error || '批量删除失败');
      }
    } catch {
      showError('批量删除失败，请重试');
    } finally {
      setBatchDeleting(false);
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
              onClick={handleToggleSelectionMode}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectionMode
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectionMode ? '取消' : '多选'}
            </button>
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
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
              {totalRecords} 条
            </span>
          </div>
        </div>

        {/* 单日模式：快速输入 + 筛选 */}
        {!isMultiDay && (
          <div className="mx-auto max-w-2xl mt-3">
            {/* 今日到期计划提醒 */}
            {dueTodayPlans.length > 0 && isOnToday && (
              <div className="mb-3 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <CalendarClock className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-xs font-semibold text-blue-700">
                    今日到期计划（{dueTodayPlans.length}）
                  </span>
                </div>
                <div className="space-y-1">
                  {dueTodayPlans.map(plan => (
                    <div
                      key={plan.id}
                      className="flex items-center justify-between rounded-lg bg-white border border-blue-100 px-2.5 py-1.5 cursor-pointer hover:bg-blue-50 transition-colors"
                      onClick={() => setEditingRecord(plan)}
                    >
                      <span className="text-xs text-slate-700 truncate">{plan.content}</span>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {plan.item && (
                          <span className="text-[10px] text-slate-400">{plan.item.title}</span>
                        )}
                        <CheckCircle2
                          className="h-3.5 w-3.5 text-green-500 hover:text-green-700 transition-colors"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleComplete(plan); }}
                          aria-label="完成计划"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <QuickInput
              selectedDate={quickInputDate}
              tags={tags}
              items={items}
              onRecordCreated={handleRecordCreated}
              onPendingCreated={handlePendingCreated}
              onPendingResolved={handlePendingResolved}
              onPendingSessionPatch={handlePendingSessionPatch}
              onDeferResolved={handleDeferResolved}
              resumeClarify={resumeClarify}
              onResumeClarifyApplied={() => setResumeClarify(null)}
              onError={showError}
            />
            <div className="mt-2">
              <FilterBar
                filterType={filterType}
                filterItemId={filterItemId}
                items={items}
                onFilterTypeChange={setFilterType}
                onFilterItemChange={setFilterItemId}
              />
            </div>
          </div>
        )}

        {/* 多日模式：仅筛选 */}
        {isMultiDay && (
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

        {/* 多选操作栏 */}
        {selectionMode && (
          <div className={`mx-auto mt-2 flex items-center gap-3 ${isMultiDay ? 'max-w-7xl' : 'max-w-2xl'}`}>
            <span className="text-xs text-slate-500">已选 {selectedIds.size} 条</span>
            {!isMultiDay && (
              <button
                onClick={handleSelectAll}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                全选本日
              </button>
            )}
            {isMultiDay && (
              <span className="text-[11px] text-slate-400">点击列头日期可全选该日</span>
            )}
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0 || batchDeleting}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              {batchDeleting ? '删除中...' : '删除选中'}
            </button>
          </div>
        )}
      </div>

      {/* 内容区（填满剩余高度） */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : !isMultiDay ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-2xl px-4 py-4">
              {singleDayRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <p className="text-sm">暂无记录</p>
                  <p className="mt-1 text-xs">在上方输入框中快速记录</p>
                </div>
              ) : (
                <RecordList
                  records={singleDayRecords}
                  onRecordClick={handleRecordClick}
                  onStarToggle={handleStarToggle}
                  aiPendingIds={aiPendingIds}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onComplete={handleComplete}
                  onPostpone={handlePostpone}
                  onCancel={handleCancel}
                  onConvertToPlan={handleConvertToPlan}
                  onConvertToItem={handleConvertToItem}
                  onConvertToGoal={handleConvertToGoal}
                />
              )}
            </div>
          </div>
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
                      selectionMode={selectionMode}
                      selectedIds={selectedIds}
                      onToggleSelect={handleToggleSelect}
                      onSelectAllForDate={handleSelectAllForDate}
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

      {/* 多天模式：全局底部悬浮命令栏 */}
      {isMultiDay && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="mx-auto max-w-2xl">
            <QuickInput
              selectedDate={quickInputDate}
              tags={tags}
              items={items}
              onRecordCreated={handleRecordCreated}
              onPendingCreated={handlePendingCreated}
              onPendingResolved={handlePendingResolved}
              onPendingSessionPatch={handlePendingSessionPatch}
              onDeferResolved={handleDeferResolved}
              resumeClarify={resumeClarify}
              onResumeClarifyApplied={() => setResumeClarify(null)}
              onError={showError}
            />
          </div>
        </div>
      )}

      {editingRecord && (
        <RecordEditDrawer
          record={editingRecord}
          tags={tags}
          items={items}
          onClose={() => setEditingRecord(null)}
          onSaved={handleRecordUpdated}
          onDeleted={handleRecordUpdated}
          onError={showError}
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
