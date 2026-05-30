'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus, Clock, Search, Target,
  Briefcase, BookOpen, Dumbbell, Code, Music, Heart, Star,
} from 'lucide-react';
import type { Item, ItemStatus, CreateItemPayload } from '@/types/teto';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { ItemsDesktopSkeleton } from '@/components/ui/PageSkeletons';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';
import {
  getCategoryItems,
  getChildItems,
  getOrphanItems,
} from '@/lib/activity/item-tree';
import { ensureCategoryItems } from '@/lib/activity/ensure-categories';
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

const LUCIDE_ICONS = [Briefcase, BookOpen, Dumbbell, Code, Music, Heart, Star, Target];
function pickIcon(title: string) {
  const idx = title.charCodeAt(0) % LUCIDE_ICONS.length;
  return LUCIDE_ICONS[idx];
}

interface ItemWithStats extends Item {
  record_count?: number;
  phase_count?: number;
  last_active_at?: string | null;
  active_phase_title?: string | null;
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

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/items');
      const data = await res.json();
      if (data.data) {
        const list = data.data.map((item: ItemWithStats) => ({
          ...item,
          phase_count: item.phase_count ?? 0,
          record_count: item.record_count ?? 0,
          last_active_at: item.last_active_at ?? item.updated_at,
          active_phase_title: item.active_phase_title ?? null,
        }));
        setItems(list);
        setLoading(false);

        if (getCategoryItems(list).length === 0) {
          ensureCategoryItems(list).then((next) => {
            if (next) {
              setItems(
                next.map((item: ItemWithStats) => ({
                  ...item,
                  phase_count: item.phase_count ?? 0,
                  record_count: item.record_count ?? 0,
                  last_active_at: item.last_active_at ?? item.updated_at,
                  active_phase_title: item.active_phase_title ?? null,
                }))
              );
            }
          });
        }
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

  const categoryItems = useMemo(() => getCategoryItems(items), [items]);

  const matchesSearch = useCallback(
    (item: Item) =>
      !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()),
    [searchQuery]
  );

  const categoryGroups = useMemo(() => {
    return getCategoryItems(items)
      .map((cat) => {
        const catStats = items.find((i) => i.id === cat.id);
        const children = getChildItems(items, cat.id).filter(matchesSearch);
        const totalMinutes =
          children.reduce((s, c) => s + (c.total_duration_minutes ?? 0), 0) +
          (children.length === 0 ? (catStats?.total_duration_minutes ?? 0) : 0);
        const catRecordCount = catStats?.record_count ?? 0;
        return { category: cat, children, totalMinutes, catRecordCount, catStats };
      })
      .filter((g) => g.children.length > 0 || g.catRecordCount > 0 || !searchQuery);
  }, [items, searchQuery, matchesSearch]);

  const orphanBoardItems = useMemo(
    () => getOrphanItems(items).filter(matchesSearch),
    [items, matchesSearch]
  );

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

  const assignParentCategory = async (itemId: string, parentItemId: string | null) => {
    try {
      const res = await fetch(`/api/v2/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_item_id: parentItemId }),
      });
      if (res.ok) fetchItems();
      else {
        const e = await res.json();
        showError(e.error?.message ?? e.error ?? '移动失败');
      }
    } catch {
      showError('移动失败，请重试');
    }
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
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 auto-rows-[120px]">
                    {displayItems.map((child) => (
                      <WidgetCard key={child.id} item={child} />
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
                  尚未挂到大类下。点卡片左上角{' '}
                  <Briefcase className="inline h-3 w-3 text-indigo-400 align-[-2px]" />{' '}
                  可归入大类，或新建时选择「所属大类」。
                </p>
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 auto-rows-[120px]">
                  {orphanBoardItems.map((child) => (
                    <WidgetCard
                      key={child.id}
                      item={child}
                      categoryItems={categoryItems}
                      onAssignParent={assignParentCategory}
                      showCategoryMenu
                    />
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

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function WidgetCard({
  item,
  categoryItems = [],
  onAssignParent,
  showCategoryMenu = false,
}: {
  item: ItemWithStats;
  categoryItems?: Item[];
  onAssignParent?: (itemId: string, parentId: string | null) => void;
  showCategoryMenu?: boolean;
}) {
  const IconComp = item.icon ? null : pickIcon(item.title);

  return (
    <Link
      href={`/items/${item.id}`}
      className="group relative flex h-full w-full cursor-pointer flex-col justify-center items-center gap-1.5 p-3 rounded-[24px] bg-white/70 backdrop-blur-xl border border-white/20 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.97] overflow-hidden"
    >
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
      <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight line-clamp-2 w-full">
        {item.title}
      </span>
      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}>
        {item.status}
      </span>
      {showCategoryMenu && categoryItems.length > 0 && onAssignParent && (
        <div className="absolute top-2 left-2 z-10 opacity-100 md:opacity-80 md:group-hover:opacity-100 transition-all">
          <CategoryMenu
            categories={categoryItems}
            onSelect={(catId) => onAssignParent(item.id, catId)}
          />
        </div>
      )}
    </Link>
  );
}

function CategoryMenu({
  categories,
  onSelect,
}: {
  categories: Item[];
  onSelect: (categoryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-1.5 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm hover:scale-110 transition-all"
        title="移入大类"
      >
        <Briefcase className="h-3 w-3 text-indigo-500" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 glass-heavy rounded-xl shadow-soft-lg p-1.5 min-w-[100px] max-h-40 overflow-y-auto z-50">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(cat.id);
                setOpen(false);
              }}
              className="block w-full text-left px-2.5 py-1.5 text-[11px] text-slate-700 hover:bg-indigo-50 rounded-lg transition-colors truncate"
            >
              {cat.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
