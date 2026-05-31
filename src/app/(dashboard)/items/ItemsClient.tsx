'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus, Clock, Search, Target, ChevronDown, ChevronUp, AlertCircle,
  BookOpen, Dumbbell, Code, Music, Heart, Star, FolderInput,
} from 'lucide-react';
import type { Item, ItemStatus, CreateItemPayload, SubItem } from '@/types/teto';
import ItemLevel3Row from './components/ItemLevel3Row';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { ItemsDesktopSkeleton } from '@/components/ui/PageSkeletons';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';
import ItemMoveDialog, { type MoveNode } from '@/components/items/ItemMoveDialog';
import {
  getCategoryItems,
  getChildItems,
  getOrphanItems,
  isActiveItem,
} from '@/lib/activity/item-tree';
import { ensureCategoryItems, needsCategorySeed } from '@/lib/activity/ensure-categories';
import ParentCategorySelect from './components/ParentCategorySelect';

const STATUS_COLORS: Record<ItemStatus, string> = {
  '活跃': 'bg-emerald-100 text-emerald-700',
  '推进中': 'bg-blue-100 text-blue-700',
  '放缓': 'bg-amber-100 text-amber-700',
  '停滞': 'bg-orange-100 text-orange-700',
  '已完成': 'bg-slate-100 text-slate-500',
  '已搁置': 'bg-slate-100 text-slate-400',
};
const ICON_GRADIENT: Record<ItemStatus, string> = {
  '活跃': 'from-emerald-400 to-green-500',
  '推进中': 'from-blue-400 to-indigo-500',
  '放缓': 'from-amber-400 to-yellow-500',
  '停滞': 'from-orange-400 to-red-400',
  '已完成': 'from-slate-300 to-slate-400',
  '已搁置': 'from-slate-200 to-slate-300',
};

const LUCIDE_ICONS = [BookOpen, Dumbbell, Code, Music, Heart, Star, Target, FolderInput];
function pickIcon(title: string) {
  const idx = title.charCodeAt(0) % LUCIDE_ICONS.length;
  return LUCIDE_ICONS[idx];
}

const STALE_DAYS = 14;
const ACTIVE_BOARD_STATUSES = new Set<ItemStatus>(['活跃', '推进中', '放缓', '停滞']);
const SHOW_COMPLETED_KEY = 'teto-items-show-completed';

function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86400000);
}

function isStaleItem(item: ItemWithStats): boolean {
  return (
    (item.status === '活跃' || item.status === '推进中') &&
    daysSince(item.updated_at) > STALE_DAYS
  );
}

function formatDesktopDurationHours(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes}分钟`;
  const h = minutes / 60;
  if (h < 10) return `${h.toFixed(1)}小时`;
  return `${Math.round(h)}小时`;
}

function normalizeItemStats(item: ItemWithStats): ItemWithStats {
  return {
    ...item,
    phase_count: item.phase_count ?? 0,
    record_count: item.record_count ?? 0,
    pending_plan_count: item.pending_plan_count ?? 0,
    total_duration_minutes: item.total_duration_minutes ?? 0,
    last_active_at: item.last_active_at ?? item.updated_at,
    active_phase_title: item.active_phase_title ?? null,
  };
}

interface ItemWithStats extends Item {
  record_count?: number;
  phase_count?: number;
  last_active_at?: string | null;
  active_phase_title?: string | null;
  pending_plan_count?: number;
}

export default function ItemsClient() {
  const [items, setItems] = useState<ItemWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newParentCategoryId, setNewParentCategoryId] = useState('');
  const [creating, setCreating] = useState(false);
  const { toasts, showError, dismissToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [moveNode, setMoveNode] = useState<MoveNode | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    try {
      setShowCompleted(localStorage.getItem(SHOW_COMPLETED_KEY) === 'true');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_COMPLETED_KEY, String(showCompleted));
    } catch {
      /* ignore */
    }
  }, [showCompleted]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/items?skip_duration=true');
      const data = await res.json();
      if (data.data) {
        const list = data.data.map((item: ItemWithStats) => normalizeItemStats(item));
        setItems(list);
        setLoading(false);

        void fetch('/api/v2/items?duration_only=true')
          .then((r) => r.json())
          .then((json) => {
            const durations = json.data as Record<string, number> | undefined;
            if (!durations) return;
            setItems((prev) =>
              prev.map((item) =>
                normalizeItemStats({
                  ...item,
                  total_duration_minutes: durations[item.id] ?? item.total_duration_minutes ?? 0,
                })
              )
            );
          })
          .catch(() => {});

        if (needsCategorySeed(list)) {
          ensureCategoryItems(list).then((next) => {
            if (next) {
              setItems(next.map((item: ItemWithStats) => normalizeItemStats(item)));
            }
          });
        }

        void fetch('/api/v2/sub-items')
          .then((r) => r.json())
          .then((json) => setSubItems(json.data ?? []))
          .catch(() => {});

        return;
      }
    } catch (err) {
      console.error('加载事项失败:', err);
      showError('加载事项失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const boardOpts = useMemo(() => ({ includeCompleted: showCompleted }), [showCompleted]);

  const matchesSearch = useCallback(
    (item: Item) =>
      !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()),
    [searchQuery]
  );

  const categoryGroups = useMemo(() => {
    return getCategoryItems(items, undefined, undefined, boardOpts)
      .map((cat) => {
        const catStats = items.find((i) => i.id === cat.id);
        const children = getChildItems(items, cat.id, boardOpts).filter(matchesSearch);
        const totalMinutes =
          children.reduce((s, c) => s + (c.total_duration_minutes ?? 0), 0) +
          (children.length === 0 ? (catStats?.total_duration_minutes ?? 0) : 0);
        const catRecordCount = catStats?.record_count ?? 0;
        return { category: cat, children, totalMinutes, catRecordCount, catStats };
      })
      .filter((g) => g.children.length > 0 || g.catRecordCount > 0);
  }, [items, searchQuery, matchesSearch, boardOpts]);

  const orphanBoardItems = useMemo(
    () => getOrphanItems(items, undefined, boardOpts).filter(matchesSearch),
    [items, matchesSearch, boardOpts]
  );

  const boardItems = useMemo(() => {
    const seen = new Set<string>();
    const result: ItemWithStats[] = [];
    for (const g of categoryGroups) {
      for (const child of g.children) {
        if (!seen.has(child.id)) {
          seen.add(child.id);
          result.push(child);
        }
      }
      if (g.children.length === 0 && g.catRecordCount > 0 && g.catStats) {
        if (!seen.has(g.catStats.id)) {
          seen.add(g.catStats.id);
          result.push(g.catStats);
        }
      }
    }
    for (const o of orphanBoardItems) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        result.push(o);
      }
    }
    return result;
  }, [categoryGroups, orphanBoardItems]);

  const hasContent =
    categoryGroups.some((g) => g.children.length > 0 || g.catRecordCount > 0) ||
    orphanBoardItems.length > 0;

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const payload: CreateItemPayload = {
        title: newTitle.trim(),
        ...(newParentCategoryId ? { parent_item_id: newParentCategoryId } : {}),
      };
      const res = await fetch('/api/v2/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewTitle('');
        setNewParentCategoryId('');
        setShowCreate(false);
        fetchItems();
      } else if (res.status === 409) {
        const { conflict } = await res.json();
        if (conflict?.type === 'duplicate_name') {
          const restart = confirm(
            `${conflict.message}\n\n点击「确定」在原事项下新建阶段重启\n点击「取消」仍然新建独立事项`
          );
          if (restart) {
            const phaseRes = await fetch('/api/v2/phases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                item_id: conflict.existing_item_id,
                title: '重启阶段',
                description: `从「${conflict.existing_item_title}」重启`,
                start_date: new Date().toISOString().split('T')[0],
                status: '进行中',
              }),
            });
            if (phaseRes.ok) {
              setNewTitle('');
              setShowCreate(false);
              fetchItems();
            } else {
              showError('创建阶段失败');
            }
          } else {
            const forceRes = await fetch('/api/v2/items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: `${newTitle.trim()}（新）` }),
            });
            if (forceRes.ok) {
              setNewTitle('');
              setShowCreate(false);
              fetchItems();
            } else {
              const e = await forceRes.json();
              showError(e.error || '创建事项失败');
            }
          }
        }
      } else {
        const e = await res.json();
        showError(e.error || '创建事项失败');
      }
    } catch {
      showError('创建事项失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const openMoveDialog = (item: Item) => {
    setMoveNode({ kind: 'item', item });
    setMoveDialogOpen(true);
  };

  const handleMoved = async () => {
    await fetchItems();
  };

  return (
    <div className="flex-1 overflow-y-auto min-h-0 desktop-bg">
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="mb-6 glass rounded-2xl px-5 py-3 shadow-soft flex items-center justify-between">
          <h1 className="text-base font-bold text-slate-800 tracking-tight">事项桌面</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索…"
                className="w-36 glass rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/50 placeholder:text-slate-300 border-0"
              />
            </div>
            <label className="flex items-center gap-1.5 rounded-xl glass px-2.5 py-1.5 text-[10px] text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-400/50 h-3 w-3"
              />
              显示已完成
            </label>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-xl bg-indigo-500 px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-md hover:bg-indigo-600 hover:shadow-lg transition-all"
            >
              <Plus className="inline h-3.5 w-3.5 mr-0.5" />
              新事项
            </button>
          </div>
        </div>

        {showCreate && (
          <div className="mb-5 glass rounded-2xl p-4 shadow-soft-lg inline-block min-w-[320px]">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="新事项名称…"
              className="w-full bg-white/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 placeholder:text-slate-300 border-0"
              autoFocus
            />
            <div className="mt-2">
              <label className="mb-1 block text-[10px] font-medium text-slate-400">所属大类</label>
              <ParentCategorySelect
                items={items}
                value={newParentCategoryId}
                onChange={setNewParentCategoryId}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                className="rounded-xl bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
              >
                {creating ? '创建中…' : '创建'}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewTitle('');
                  setNewParentCategoryId('');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 px-2"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <ItemsDesktopSkeleton />
        ) : hasContent ? (
          <div className="space-y-5">
            {!searchQuery && <AttentionPanel items={boardItems} />}
            {categoryGroups.map(({ category, children, totalMinutes, catRecordCount, catStats }) => {
              const displayItems: ItemWithStats[] =
                children.length > 0
                  ? children
                  : catRecordCount > 0 && catStats
                    ? [catStats]
                    : [];
              if (displayItems.length === 0) return null;
              return (
                <section key={category.id} className="glass rounded-2xl p-4 md:p-5 shadow-soft">
                  <div className="flex items-center justify-between mb-4">
                    <Link href={`/items/${category.id}`} className="flex items-center gap-2 group">
                      <h2 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {category.title}
                      </h2>
                      {totalMinutes > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-600">
                          <Clock className="h-3 w-3" />
                          {formatDurationMinutes(totalMinutes)}
                        </span>
                      )}
                      {children.length === 0 && catRecordCount > 0 && (
                        <span className="text-[10px] text-slate-400">{catRecordCount} 条记录</span>
                      )}
                    </Link>
                    <span className="text-[10px] text-slate-400">
                      {children.length > 0 ? `${children.length} 个事项` : '本事项有记录'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openMoveDialog(category)}
                      className="ml-2 flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-[10px] text-indigo-600 hover:bg-indigo-50"
                      title="移动此类"
                    >
                      <FolderInput className="h-3 w-3" />
                      移动
                    </button>
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 auto-rows-[148px]">
                    {displayItems.map((child) => (
                      <div key={child.id} className="flex flex-col min-h-[148px]">
                        <WidgetCard item={child} onMove={() => openMoveDialog(child)} />
                        <ItemLevel3Row
                          l2Item={child}
                          allItems={items}
                          subItems={subItems}
                          includeCompleted={showCompleted}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
            {orphanBoardItems.length > 0 && (
              <section className="glass rounded-2xl p-4 md:p-5 shadow-soft border border-dashed border-slate-200/80">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-slate-600">未归类</h2>
                  <span className="text-[10px] text-slate-400">{orphanBoardItems.length} 个事项</span>
                </div>
                <p className="text-[10px] text-slate-400 mb-4">
                  尚未挂到一类下。点卡片左上角{' '}
                  <FolderInput className="inline h-3 w-3 text-indigo-400 align-[-2px]" />{' '}
                  可移动归类，或新建时选择「所属一类」。
                </p>
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 auto-rows-[148px]">
                  {orphanBoardItems.map((child) => (
                    <div key={child.id} className="flex flex-col min-h-[148px]">
                      <WidgetCard item={child} onMove={() => openMoveDialog(child)} />
                      <ItemLevel3Row
                        l2Item={child}
                        allItems={items}
                        subItems={subItems}
                        includeCompleted={showCompleted}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-20 h-20 rounded-3xl glass shadow-soft flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium mb-1">还没有事项</p>
            <p className="text-xs text-slate-300">点击「新事项」创建，或等待大类预设同步</p>
          </div>
        )}
      </div>

      <ItemMoveDialog
        open={moveDialogOpen}
        onClose={() => {
          setMoveDialogOpen(false);
          setMoveNode(null);
        }}
        items={items}
        node={moveNode}
        onMoved={handleMoved}
        onError={showError}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function WidgetCard({
  item,
  onMove,
}: {
  item: ItemWithStats;
  onMove?: () => void;
}) {
  const IconComp = item.icon ? null : pickIcon(item.title);
  const stale = isStaleItem(item);
  const recordCount = item.record_count ?? 0;
  const durationLabel = formatDesktopDurationHours(item.total_duration_minutes ?? 0);
  const pendingPlans = item.pending_plan_count ?? 0;
  const notStarted =
    recordCount === 0 && ACTIVE_BOARD_STATUSES.has(item.status);

  return (
    <Link
      href={`/items/${item.id}`}
      className="group relative flex h-full w-full cursor-pointer flex-col items-center gap-1 p-2.5 pt-3 rounded-[24px] bg-white/70 backdrop-blur-xl border border-white/20 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.97] overflow-hidden"
    >
      {stale && (
        <span
          className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white/80"
          title={`已 ${daysSince(item.updated_at)} 天未活动`}
        />
      )}
      <div
        className={`w-8 h-8 rounded-xl bg-gradient-to-br ${ICON_GRADIENT[item.status]} flex items-center justify-center shadow-md relative overflow-hidden shrink-0`}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 50%)' }}
        />
        {item.icon ? (
          <span className="text-sm relative z-10">{item.icon}</span>
        ) : (
          IconComp && <IconComp className="w-3.5 h-3.5 text-white relative z-10" />
        )}
      </div>
      <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight line-clamp-2 w-full shrink-0">
        {item.title}
      </span>
      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[item.status]}`}>
        {item.status}
      </span>

      <div className="mt-auto w-full border-t border-slate-100/80 pt-1.5 space-y-0.5 shrink-0">
        {item.active_phase_title && (
          <span className="block truncate rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">
            {item.active_phase_title}
          </span>
        )}
        {notStarted ? (
          <span className="block text-[9px] text-slate-400">尚未开始</span>
        ) : (
          <span className="block text-[9px] text-slate-500 truncate">
            {recordCount > 0 ? `${recordCount}条` : ''}
            {recordCount > 0 && durationLabel ? ' · ' : ''}
            {durationLabel}
          </span>
        )}
        {pendingPlans > 0 && (
          <span className="block text-[9px] text-amber-600 truncate">
            {pendingPlans} 条计划待完成
          </span>
        )}
        {stale && (
          <span className="block text-[9px] text-amber-600 truncate">
            已停滞 {daysSince(item.updated_at)} 天
          </span>
        )}
      </div>

      {onMove && (
        <div className="absolute top-2 left-2 z-10 opacity-100 md:opacity-80 md:group-hover:opacity-100 transition-all">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMove();
            }}
            className="p-1.5 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm hover:scale-110 transition-all"
            title="移动到…"
          >
            <FolderInput className="h-3 w-3 text-indigo-500" />
          </button>
        </div>
      )}
    </Link>
  );
}

interface AttentionBucket {
  key: string;
  label: string;
  hint: string;
  items: ItemWithStats[];
}

function AttentionPanel({ items }: { items: ItemWithStats[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set());

  const buckets = useMemo((): AttentionBucket[] => {
    const notStarted = items.filter(
      (i) => isActiveItem(i) && (i.record_count ?? 0) === 0
    );
    const stale = items.filter((i) => isActiveItem(i) && daysSince(i.updated_at) > STALE_DAYS);
    const phaseGap = items.filter(
      (i) =>
        i.status === '推进中' &&
        (i.phase_count ?? 0) > 0 &&
        !i.active_phase_title
    );

    return [
      { key: 'not_started', label: '尚未开始', hint: '建立后从未记录', items: notStarted },
      { key: 'stale', label: '已停滞', hint: '长时间未活动', items: stale },
      { key: 'phase', label: '阶段待更新', hint: '没有进行中的阶段', items: phaseGap },
    ].filter((b) => b.items.length > 0);
  }, [items]);

  if (buckets.length === 0) return null;

  const totalCount = buckets.reduce((s, b) => s + b.items.length, 0);

  return (
    <section className="glass rounded-2xl p-4 shadow-soft border border-amber-100/60">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
          需要关注
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {totalCount}
          </span>
        </span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {buckets.map((bucket) => {
            const expanded = expandedBuckets.has(bucket.key);
            const visible = expanded ? bucket.items : bucket.items.slice(0, 3);
            const hidden = bucket.items.length - visible.length;
            return (
              <div key={bucket.key}>
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="text-[11px] font-semibold text-slate-700">{bucket.label}</span>
                  <span className="text-[10px] text-slate-400">{bucket.hint}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {visible.map((item) => (
                    <Link
                      key={item.id}
                      href={`/items/${item.id}`}
                      className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      {item.title}
                      {bucket.key === 'stale' && (
                        <span className="ml-1 text-[10px] text-amber-600">
                          {daysSince(item.updated_at)}天
                        </span>
                      )}
                    </Link>
                  ))}
                  {hidden > 0 && !expanded && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedBuckets((prev) => new Set(prev).add(bucket.key))
                      }
                      className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      +{hidden} 更多
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
