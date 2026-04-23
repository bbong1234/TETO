'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus, Loader2, Clock, Layers, FileText,
  FolderPlus, Pin, PinOff, Archive, X, Search, Target, Zap,
  FolderOpen, Briefcase, BookOpen, Dumbbell, Code, Music, Heart, Star,
  Maximize2, Minimize2,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item, ItemStatus, CreateItemPayload, ItemFolder as ItemFolderType } from '@/types/teto';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import ItemFolderComponent from './components/ItemFolder';

// ============================================================
// 常量 & 类型
// ============================================================
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
const STATUS_DOT: Record<ItemStatus, string> = {
  '活跃': 'bg-emerald-400',
  '推进中': 'bg-blue-400',
  '放缓': 'bg-amber-400',
  '停滞': 'bg-orange-400',
  '已完成': 'bg-slate-300',
  '已搁置': 'bg-slate-200',
};
const ARCHIVED_STATUSES: ItemStatus[] = ['已完成', '已搁置'];

// Lucide 图标池（按 title 首字分配）
const LUCIDE_ICONS = [Briefcase, BookOpen, Dumbbell, Code, Music, Heart, Star, Target];
function pickIcon(title: string) {
  const idx = title.charCodeAt(0) % LUCIDE_ICONS.length;
  return LUCIDE_ICONS[idx];
}

// Widget 尺寸
type WidgetSize = '1x1' | '2x1' | '2x2';
interface ItemWithStats extends Item {
  record_count?: number;
  phase_count?: number;
  last_active_at?: string | null;
  active_phase_title?: string | null;
}

function getWidgetSize(item: ItemWithStats): WidgetSize {
  const hasGoal = !!item.goal_id;
  const hasPhase = (item.phase_count ?? 0) > 0;
  const isHeavy = (item.record_count ?? 0) >= 5;
  if (hasGoal && hasPhase) return '2x2';
  if (hasPhase || isHeavy) return '2x1';
  return '1x1';
}
function cycleSize(s: WidgetSize): WidgetSize {
  if (s === '1x1') return '2x1';
  if (s === '2x1') return '2x2';
  return '1x1';
}

const SIZE_CLASSES: Record<WidgetSize, string> = {
  '1x1': 'col-span-1 row-span-1',
  '2x1': 'col-span-2 row-span-1',
  '2x2': 'col-span-2 row-span-2',
};

const ORDER_KEY = 'teto-desktop-order';
const SIZE_KEY = 'teto-desktop-sizes';

// ============================================================
// SortableWidget — 可拖拽 Bento 卡片
// ============================================================
function SortableWidget({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function ItemsClient() {
  const [items, setItems] = useState<ItemWithStats[]>([]);
  const [folders, setFolders] = useState<ItemFolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ItemFolderType | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const { toasts, showError, dismissToast } = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sizeOverrides, setSizeOverrides] = useState<Record<string, WidgetSize>>(() => {
    try {
      const saved = localStorage.getItem(SIZE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [orderIds, setOrderIds] = useState<string[]>([]);

  // dnd-kit sensor
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ---------- 数据拉取（服务端已聚合 stats，无需 N+1） ----------
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/items');
      const data = await res.json();
      if (data.data) {
        setItems(data.data.map((item: any) => ({
          ...item,
          phase_count: item.phase_count ?? 0,
          record_count: item.record_count ?? 0,
          last_active_at: item.last_active_at ?? item.updated_at,
          active_phase_title: item.active_phase_title ?? null,
        })));
      }
    } catch (err) {
      console.error('加载事项失败:', err);
      showError('加载事项失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/item-folders');
      const data = await res.json();
      if (data.data) setFolders(data.data);
    } catch (err) {
      console.error('加载文件夹失败:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchItems(), fetchFolders()]);
  }, [fetchItems, fetchFolders]);

  // ---------- 数据分组 ----------
  const filteredItems = searchQuery
    ? items.filter(i => i.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;
  const boardItems = useMemo(
    () => filteredItems.filter(i => !i.folder_id && !ARCHIVED_STATUSES.includes(i.status)),
    [filteredItems]
  );
  const pinnedItems = useMemo(() => boardItems.filter(i => i.is_pinned), [boardItems]);
  const activeUnpinned = useMemo(() => boardItems.filter(i => !i.is_pinned), [boardItems]);
  const archivedItems = useMemo(() => filteredItems.filter(i => ARCHIVED_STATUSES.includes(i.status) && !i.folder_id), [filteredItems]);
  const getFolderItems = (folderId: string) => filteredItems.filter(i => i.folder_id === folderId);

  // 排列条目 ID（置顶 → 文件夹 → 活跃）
  const defaultEntryIds = useMemo(() => {
    const ids: string[] = [];
    pinnedItems.forEach(i => ids.push(i.id));
    folders.forEach(f => ids.push(`folder-${f.id}`));
    activeUnpinned.forEach(i => ids.push(i.id));
    return ids;
  }, [pinnedItems, activeUnpinned, folders]);

  // 恢复 / 同步排序
  useEffect(() => {
    if (loading || defaultEntryIds.length === 0) return;
    try {
      const saved: string[] = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
      if (saved.length > 0) {
        // 保留已有的，追加新增的
        const set = new Set(defaultEntryIds);
        const ordered = saved.filter(id => set.has(id));
        const remaining = defaultEntryIds.filter(id => !ordered.includes(id));
        setOrderIds([...ordered, ...remaining]);
        return;
      }
    } catch {}
    setOrderIds(defaultEntryIds);
  }, [loading, defaultEntryIds]);

  // 持久化排序
  const persistOrder = (ids: string[]) => {
    setOrderIds(ids);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)); } catch {}
  };

  // dnd-kit 拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderIds.indexOf(String(active.id));
    const newIdx = orderIds.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    persistOrder(arrayMove(orderIds, oldIdx, newIdx));
  };

  // ---------- 创建操作 ----------
  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const payload: CreateItemPayload = { title: newTitle.trim() };
      const res = await fetch('/api/v2/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { setNewTitle(''); setShowCreate(false); fetchItems(); }
      else { const e = await res.json(); showError(e.error || '创建事项失败'); }
    } catch { showError('创建事项失败，请重试'); }
    finally { setCreating(false); }
  };
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/v2/item-folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFolderName.trim() }) });
      if (res.ok) { setNewFolderName(''); setShowCreateFolder(false); fetchFolders(); }
      else { const e = await res.json(); showError(e.error || '创建文件夹失败'); }
    } catch { showError('创建文件夹失败，请重试'); }
    finally { setCreating(false); }
  };

  // ---------- 文件夹操作 ----------
  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('确定删除此文件夹？事项不会被删除，只会移回桌面。')) return;
    try {
      const res = await fetch(`/api/v2/item-folders/${folderId}`, { method: 'DELETE' });
      if (res.ok) { fetchFolders(); fetchItems(); }
    } catch { showError('删除文件夹失败'); }
  };
  const handleRenameFolder = async () => {
    if (!editingFolder || !editFolderName.trim()) return;
    try {
      const res = await fetch(`/api/v2/item-folders/${editingFolder.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editFolderName.trim() }),
      });
      if (res.ok) { setEditingFolder(null); setEditFolderName(''); fetchFolders(); }
    } catch { showError('重命名失败'); }
  };
  const moveItemToFolder = async (itemId: string, folderId: string | null) => {
    try {
      const res = await fetch(`/api/v2/items/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: folderId }) });
      if (res.ok) fetchItems();
      else { const e = await res.json(); showError(e.error || '移动事项失败'); }
    } catch { showError('移动事项失败'); }
  };

  // ---------- 置顶 / 尺寸 ----------
  const togglePin = async (itemId: string, currentPinned: boolean) => {
    try {
      const res = await fetch(`/api/v2/items/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_pinned: !currentPinned }) });
      if (res.ok) fetchItems();
    } catch { showError('操作失败'); }
  };
  const handleCycleSize = (entryId: string) => {
    setSizeOverrides(prev => {
      const item = items.find(i => i.id === entryId);
      const cur = prev[entryId] || (item ? getWidgetSize(item) : '1x1');
      const next = { ...prev, [entryId]: cycleSize(cur) };
      try { localStorage.setItem(SIZE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ============================================================
  // Widget 渲染
  // ============================================================
  const renderWidget = (entryId: string) => {
    // 文件夹
    if (entryId.startsWith('folder-')) {
      const folderId = entryId.replace('folder-', '');
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return null;
      const fItems = getFolderItems(folder.id);
      const size = sizeOverrides[entryId] || '1x1';
      return (
        <ItemFolderComponent
          folder={folder} items={fItems}
          size={size === '1x1' ? 'compact' : size === '2x1' ? 'medium' : 'large'}
          isExpanded={false} isDragOver={false}
          onToggle={() => {}} onCycleSize={() => handleCycleSize(entryId)}
          onEdit={(f) => { setEditingFolder(f); setEditFolderName(f.name); }}
          onDelete={() => handleDeleteFolder(folder.id)}
          onDragOver={() => {}} onDragLeave={() => {}} onDrop={() => {}}
          renderItemCard={(it) => <div key={it.id} />}
          onRemoveItem={(itemId: string) => moveItemToFolder(itemId, null)}
        />
      );
    }
    // 事项
    const item = items.find(i => i.id === entryId);
    if (!item) return null;
    const size = sizeOverrides[entryId] || getWidgetSize(item);
    return <WidgetCard item={item} size={size} folders={folders} onPin={togglePin} onCycleSize={handleCycleSize} onMoveToFolder={moveItemToFolder} />;
  };

  // ============================================================
  // 主渲染
  // ============================================================
  return (
    <div className="flex-1 overflow-y-auto min-h-0 desktop-bg">
      <div className="p-6 md:p-10 max-w-7xl mx-auto">

        {/* ===== 顶部工具栏 ===== */}
        <div className="mb-6 glass rounded-2xl px-5 py-3 shadow-soft flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-slate-800 tracking-tight">事项桌面</h1>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="glass rounded-full px-2 py-0.5">{pinnedItems.length} 置顶</span>
              <span className="glass rounded-full px-2 py-0.5">{activeUnpinned.length} 活跃</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索…" className="w-36 glass rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/50 placeholder:text-slate-300 border-0" />
            </div>
            <button onClick={() => setShowHistory(true)} className="glass rounded-xl px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:shadow-soft transition-all">
              <Archive className="inline h-3.5 w-3.5 mr-1" />历史库
              {archivedItems.length > 0 && <span className="ml-1 bg-slate-200/60 rounded-full px-1.5 text-[9px]">{archivedItems.length}</span>}
            </button>
            <button onClick={() => setShowCreateFolder(true)} className="glass rounded-xl px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:shadow-soft transition-all">
              <FolderPlus className="inline h-3.5 w-3.5 mr-1" />分组
            </button>
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-indigo-500 px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-md hover:bg-indigo-600 hover:shadow-lg transition-all">
              <Plus className="inline h-3.5 w-3.5 mr-0.5" />新事项
            </button>
          </div>
        </div>

        {/* ===== 新建表单 ===== */}
        {showCreate && (
          <div className="mb-5 glass rounded-2xl p-4 shadow-soft-lg inline-block min-w-[320px]">
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="新事项名称…" className="w-full bg-white/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 placeholder:text-slate-300 border-0" autoFocus />
            <div className="mt-3 flex gap-2">
              <button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="rounded-xl bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors">{creating ? '创建中…' : '创建'}</button>
              <button onClick={() => { setShowCreate(false); setNewTitle(''); }} className="text-xs text-slate-400 hover:text-slate-600 px-2">取消</button>
            </div>
          </div>
        )}
        {showCreateFolder && (
          <div className="mb-5 glass rounded-2xl p-4 shadow-soft-lg inline-block min-w-[320px]">
            <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="分组名称…" className="w-full bg-white/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 placeholder:text-slate-300 border-0" autoFocus />
            <div className="mt-3 flex gap-2">
              <button onClick={handleCreateFolder} disabled={creating || !newFolderName.trim()} className="rounded-xl bg-amber-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">{creating ? '创建中…' : '创建'}</button>
              <button onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }} className="text-xs text-slate-400 hover:text-slate-600 px-2">取消</button>
            </div>
          </div>
        )}

        {/* ===== Bento Grid 桌面 ===== */}
        {loading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div>
        ) : orderIds.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 md:gap-5 auto-rows-[120px]">
                {orderIds.map(entryId => {
                  const isFolder = entryId.startsWith('folder-');
                  const size = isFolder
                    ? (sizeOverrides[entryId] || '1x1')
                    : (sizeOverrides[entryId] || getWidgetSize(items.find(i => i.id === entryId) as ItemWithStats || {} as ItemWithStats));
                  return (
                    <SortableWidget key={entryId} id={entryId} className={SIZE_CLASSES[size as WidgetSize]}>
                      {renderWidget(entryId)}
                    </SortableWidget>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-20 h-20 rounded-3xl glass shadow-soft flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium mb-1">你的桌面还是空的</p>
            <p className="text-xs text-slate-300">创建事项，它们会以微组件形式排布在桌面上</p>
          </div>
        )}
      </div>

      {/* ===== 历史库弹窗 ===== */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowHistory(false)}>
          <div className="absolute inset-0 glass-dark" />
          <div className="relative glass-heavy rounded-3xl shadow-soft-xl w-[520px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-800">历史库</h3>
                <span className="text-[11px] text-slate-400">{archivedItems.length} 个归档事项</span>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-xl hover:bg-white/50 text-slate-400 hover:text-slate-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {archivedItems.length > 0 ? (
                <div className="space-y-2">
                  {archivedItems.map((item) => (
                    <Link key={item.id} href={`/items/${item.id}`}
                      className="flex items-center gap-3 glass rounded-2xl p-3 hover:shadow-soft transition-all">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ICON_GRADIENT[item.status]} flex items-center justify-center shrink-0`}>
                        {item.icon ? <span className="text-base">{item.icon}</span> : <span className="text-sm font-bold text-white/80">{item.title.charAt(0)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-slate-700 truncate">{item.title}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${STATUS_COLORS[item.status]}`}>{item.status}</span>
                          <span><Layers className="inline h-2.5 w-2.5" /> {item.phase_count || 0}</span>
                          <span><FileText className="inline h-2.5 w-2.5" /> {item.record_count || 0}</span>
                        </div>
                      </div>
                      {item.last_active_at && <span className="text-[10px] text-slate-300 shrink-0">{formatRelativeTime(item.last_active_at)}</span>}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Archive className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm">暂无归档事项</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== 重命名弹窗 ===== */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setEditingFolder(null)}>
          <div className="absolute inset-0 glass-dark" />
          <div className="relative glass-heavy rounded-3xl p-5 shadow-soft-xl w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-3">重命名分组</h3>
            <input type="text" value={editFolderName} onChange={(e) => setEditFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder()}
              className="w-full bg-white/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 border-0" autoFocus />
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setEditingFolder(null)} className="rounded-xl bg-white/50 px-3.5 py-1.5 text-xs text-slate-600 hover:bg-white/80 transition-colors">取消</button>
              <button onClick={handleRenameFolder} className="rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs text-white hover:bg-amber-600 transition-colors">保存</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ============================================================
// WidgetCard — Bento 事项卡片（三档内容）
// ============================================================
function WidgetCard({
  item, size, folders, onPin, onCycleSize, onMoveToFolder,
}: {
  item: ItemWithStats;
  size: WidgetSize;
  folders: ItemFolderType[];
  onPin: (id: string, pinned: boolean) => void;
  onCycleSize: (id: string) => void;
  onMoveToFolder: (itemId: string, folderId: string | null) => void;
}) {
  const IconComp = item.icon ? null : pickIcon(item.title);

  const baseClass = `
    group relative flex h-full w-full cursor-pointer
    rounded-[24px] bg-white/70 dark:bg-zinc-800/60
    backdrop-blur-xl border border-white/20
    shadow-sm transition-all duration-300
    hover:shadow-md hover:scale-[1.02] active:scale-[0.97]
    overflow-hidden
  `;

  // ---- 1x1 小组件 ----
  if (size === '1x1') {
    return (
      <Link href={`/items/${item.id}`} className={`${baseClass} flex-col justify-center items-center gap-1.5 p-3`}>
        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${ICON_GRADIENT[item.status]} flex items-center justify-center shadow-md relative overflow-hidden shrink-0`}>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 50%)' }} />
          {item.icon
            ? <span className="text-sm relative z-10">{item.icon}</span>
            : IconComp && <IconComp className="w-3.5 h-3.5 text-white relative z-10" />}
        </div>
        <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight line-clamp-2 w-full">{item.title}</span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}>{item.status}</span>
        <HoverActions item={item} folders={folders} onPin={onPin} onCycleSize={onCycleSize} onMoveToFolder={onMoveToFolder} />
      </Link>
    );
  }

  // ---- 2x1 中组件 ----
  if (size === '2x1') {
    return (
      <Link href={`/items/${item.id}`} className={`${baseClass} flex-row items-center px-4 py-3 gap-3`}>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ICON_GRADIENT[item.status]} flex items-center justify-center shadow-md shrink-0 relative overflow-hidden`}>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 50%)' }} />
          {item.icon
            ? <span className="text-base relative z-10">{item.icon}</span>
            : IconComp && <IconComp className="w-4 h-4 text-white relative z-10" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[13px] font-semibold text-slate-800 truncate">{item.title}</h3>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${STATUS_COLORS[item.status]}`}>{item.status}</span>
          </div>
          {item.active_phase_title ? (
            <div className="flex items-center gap-1.5 text-[11px] text-indigo-600">
              <Zap className="h-3 w-3" /><span className="truncate">{item.active_phase_title}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-0.5"><Layers className="h-2.5 w-2.5" />{item.phase_count || 0} 阶段</span>
              <span className="flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{item.record_count || 0} 记录</span>
            </div>
          )}
        </div>
        {item.last_active_at && <span className="text-[9px] text-slate-300 shrink-0">{formatRelativeTime(item.last_active_at)}</span>}
        <HoverActions item={item} folders={folders} onPin={onPin} onCycleSize={onCycleSize} onMoveToFolder={onMoveToFolder} />
      </Link>
    );
  }

  // ---- 2x2 大组件 ----
  return (
    <Link href={`/items/${item.id}`} className={`${baseClass} flex-col p-5`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ICON_GRADIENT[item.status]} flex items-center justify-center shadow-md shrink-0 relative overflow-hidden`}>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 50%)' }} />
          {item.icon
            ? <span className="text-lg relative z-10">{item.icon}</span>
            : IconComp && <IconComp className="w-4 h-4 text-white relative z-10" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-bold text-slate-800 truncate">{item.title}</h3>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[item.status]}`} />
            <span className="text-[10px] text-slate-400">{item.status}</span>
          </div>
        </div>
      </div>
      {item.active_phase_title && (
        <div className="mb-2 rounded-2xl bg-indigo-50/60 px-3.5 py-2">
          <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 font-medium">
            <Zap className="h-3.5 w-3.5" /><span className="truncate">{item.active_phase_title}</span>
          </div>
        </div>
      )}
      {item.goal_id && (
        <div className="mb-2 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="text-[11px] text-purple-600 font-medium">目标追踪中</span>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-0.5"><Layers className="h-2.5 w-2.5" />{item.phase_count || 0}</span>
          <span className="flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{item.record_count || 0}</span>
        </div>
        {item.last_active_at && <span className="flex items-center gap-0.5 text-[10px] text-slate-300"><Clock className="h-2.5 w-2.5" />{formatRelativeTime(item.last_active_at)}</span>}
      </div>
      <HoverActions item={item} folders={folders} onPin={onPin} onCycleSize={onCycleSize} onMoveToFolder={onMoveToFolder} />
    </Link>
  );
}

// ============================================================
// HoverActions — 悬浮操作按钮
// ============================================================
function HoverActions({
  item, folders, onPin, onCycleSize, onMoveToFolder,
}: {
  item: ItemWithStats;
  folders: ItemFolderType[];
  onPin: (id: string, pinned: boolean) => void;
  onCycleSize: (id: string) => void;
  onMoveToFolder: (itemId: string, folderId: string | null) => void;
}) {
  return (
    <>
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPin(item.id, item.is_pinned); }}
        className="absolute top-2 right-2 p-1.5 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm opacity-0 group-hover:opacity-100 transition-all hover:scale-110 z-10">
        {item.is_pinned ? <PinOff className="h-3 w-3 text-slate-400" /> : <Pin className="h-3 w-3 text-indigo-400" />}
      </button>
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCycleSize(item.id); }}
        className="absolute bottom-2 right-2 p-1.5 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm opacity-0 group-hover:opacity-100 transition-all hover:scale-110 z-10"
        title="切换尺寸">
        <Maximize2 className="h-3 w-3 text-slate-400" />
      </button>
      {folders.length > 0 && (
        <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-all z-10">
          <FolderMenu folders={folders} onSelect={(fId) => onMoveToFolder(item.id, fId)} />
        </div>
      )}
    </>
  );
}

// ============================================================
// FolderMenu — 移入文件夹下拉
// ============================================================
function FolderMenu({ folders, onSelect }: { folders: ItemFolderType[]; onSelect: (folderId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="p-1.5 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm hover:scale-110 transition-all"
        title="移入文件夹"
      >
        <FolderOpen className="h-3 w-3 text-amber-500" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 glass-heavy rounded-xl shadow-soft-lg p-1.5 min-w-[100px] z-50">
          {folders.map(f => (
            <button key={f.id}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(f.id); setOpen(false); }}
              className="block w-full text-left px-2.5 py-1.5 text-[11px] text-slate-700 hover:bg-indigo-50 rounded-lg transition-colors truncate">
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 辅助函数
// ============================================================
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}小时前`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
