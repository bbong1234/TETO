'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, LayoutGrid, ChevronsLeft, ChevronsRight, CheckSquare, X, Trash2 } from 'lucide-react';
import type { Record, Tag, Item, RecordType } from '@/types/teto';
import QuickInput from './components/QuickInput';
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

function getRecordDisplayDate(r: Record): string {
  if (r.type === '计划' && r.time_anchor_date && r.time_anchor_date !== r.date) {
    return r.time_anchor_date;
  }
  return r.date;
}

export default function RecordsClient() {
  // 从 localStorage 恢复模式选择
  const [isMultiDay, setIsMultiDayRaw] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY_MULTI_DAY) === 'true';
  });
  const [singleDayOffset, setSingleDayOffset] = useState(0);
  const [multiDayDates, setMultiDayDates] = useState<string[]>([]);
  const [multiDayEarliestOffset, setMultiDayEarliestOffset] = useState(0);
  const [records, setRecords] = useState<Record[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filterType, setFilterType] = useState<RecordType | ''>('');
  const [filterTagId, setFilterTagId] = useState('');
  const [filterItemId, setFilterItemId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingRecord, setEditingRecord] = useState<Record | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiPendingIds, setAiPendingIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const { toasts, showError, dismissToast } = useToast();

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
        setRecords(data.data);
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

  const groupedRecords = useMemo(() => {
    return multiDayDates.map((date) => {
      const dayRecords = records.filter((r) => getRecordDisplayDate(r) === date);
      return { date, records: dayRecords };
    });
  }, [records, multiDayDates]);

  // 单日模式数据（包含计划投影）
  const singleDayRecords = records.filter((r) => getRecordDisplayDate(r) === singleDayDate);
  const totalRecords = isMultiDay
    ? records.length
    : singleDayRecords.length;

  const handleStarToggle = async (record: Record) => {
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

  const handleAiStart = useCallback((recordId: string) => {
    setAiPendingIds(prev => new Set(prev).add(recordId));
  }, []);

  const handleAiDone = useCallback((recordId: string) => {
    setAiPendingIds(prev => {
      const next = new Set(prev);
      next.delete(recordId);
      return next;
    });
  }, []);

  const quickInputDate = todayStr;

  // 完成计划：生成一条“发生”记录，原记录变为 completed
  const handleComplete = async (record: Record) => {
    if (!window.confirm(`确认完成计划：「${record.content}」？\n将生成一条“发生”记录。`)) return;
    try {
      const res = await fetch(`/api/v2/records/${record.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // 推迟计划：生成一条新的“计划”记录投影到明天，原记录变为 postponed
  const handlePostpone = async (record: Record) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    const newDate = window.prompt(`推迟到哪天？（格式：YYYY-MM-DD）`, tomorrowStr);
    if (!newDate) return;
    try {
      const res = await fetch(`/api/v2/records/${record.id}/postpone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_date: newDate }),
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
    const allIds = (isMultiDay ? records : singleDayRecords).map(r => r.id);
    setSelectedIds(new Set(allIds));
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`确定删除选中的 ${selectedIds.size} 条记录？此操作不可撤销。`);
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
            <QuickInput
              selectedDate={quickInputDate}
              tags={tags}
              items={items}
              onRecordCreated={handleRecordCreated}
              onAiStart={handleAiStart}
              onAiDone={handleAiDone}
              onError={showError}
            />
            <div className="mt-2">
              <FilterBar
                filterType={filterType}
                filterTagId={filterTagId}
                filterItemId={filterItemId}
                tags={tags}
                items={items}
                onFilterTypeChange={setFilterType}
                onFilterTagChange={setFilterTagId}
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
              filterTagId={filterTagId}
              filterItemId={filterItemId}
              tags={tags}
              items={items}
              onFilterTypeChange={setFilterType}
              onFilterTagChange={setFilterTagId}
              onFilterItemChange={setFilterItemId}
            />
          </div>
        )}

        {/* 多选操作栏 */}
        {selectionMode && (
          <div className={`mx-auto mt-2 flex items-center gap-3 ${isMultiDay ? 'max-w-7xl' : 'max-w-2xl'}`}>
            <span className="text-xs text-slate-500">已选 {selectedIds.size} 条</span>
            <button
              onClick={handleSelectAll}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              全选当前
            </button>
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
                  onRecordClick={setEditingRecord}
                  onStarToggle={handleStarToggle}
                  aiPendingIds={aiPendingIds}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onComplete={handleComplete}
                  onPostpone={handlePostpone}
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
                      onRecordClick={setEditingRecord}
                      onStarToggle={handleStarToggle}
                      onComplete={handleComplete}
                      onPostpone={handlePostpone}
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
              onAiStart={handleAiStart}
              onAiDone={handleAiDone}
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
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
