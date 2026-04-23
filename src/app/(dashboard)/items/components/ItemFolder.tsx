'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Pencil, Trash2, X, Layers, FileText, LogOut } from 'lucide-react';
import type { ItemFolder as ItemFolderType, Item, ItemStatus } from '@/types/teto';

type FolderSize = 'compact' | 'medium' | 'large';

interface ItemWithStats extends Item {
  record_count?: number;
  phase_count?: number;
  last_active_at?: string | null;
  active_phase_title?: string | null;
}

const ICON_BG: Record<ItemStatus, string> = {
  '活跃': 'from-emerald-400 to-green-500',
  '推进中': 'from-blue-400 to-indigo-500',
  '放缓': 'from-amber-400 to-yellow-500',
  '停滞': 'from-orange-400 to-red-400',
  '已完成': 'from-slate-300 to-slate-400',
  '已搁置': 'from-slate-200 to-slate-300',
};

export interface ItemFolderProps {
  folder: ItemFolderType;
  items: ItemWithStats[];
  size: FolderSize;
  isExpanded: boolean;
  isDragOver: boolean;
  onToggle: () => void;
  onCycleSize: () => void;
  onEdit: (folder: ItemFolderType) => void;
  onDelete: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  renderItemCard: (item: ItemWithStats) => React.ReactNode;
  onRemoveItem?: (itemId: string) => void;
}

export default function ItemFolder({
  folder,
  items,
  isDragOver,
  onEdit,
  onDelete,
  onDragOver,
  onDragLeave,
  onDrop,
  renderItemCard,
  onRemoveItem,
}: ItemFolderProps) {
  const [open, setOpen] = useState(false);
  const preview = items.slice(0, 4);

  return (
    <>
      {/* ---- iOS 风格四宫格文件夹 ---- */}
      <div
        className={`
          w-[120px] shrink-0 flex flex-col items-center gap-1.5 cursor-pointer group
          transition-all duration-200
          ${isDragOver ? 'scale-110' : ''}
        `}
        onClick={() => setOpen(true)}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* 四宫格预览框 */}
        <div className={`
          w-[88px] h-[88px] rounded-[22px] glass shadow-soft
          grid grid-cols-2 grid-rows-2 gap-[3px] p-[6px]
          transition-all duration-200
          group-hover:shadow-soft-lg group-hover:scale-[1.04]
          ${isDragOver ? 'ring-2 ring-indigo-400/60 shadow-soft-lg' : ''}
        `}>
          {preview.length > 0 ? (
            preview.map((it) => (
              <div
                key={it.id}
                className={`rounded-lg bg-gradient-to-br ${ICON_BG[it.status]} flex items-center justify-center`}
              >
                {it.icon
                  ? <span className="text-[13px]">{it.icon}</span>
                  : <span className="text-[10px] font-bold text-white/90">{it.title.charAt(0)}</span>
                }
              </div>
            ))
          ) : (
            <div className="col-span-2 row-span-2 flex items-center justify-center text-slate-300">
              <span className="text-[10px]">空</span>
            </div>
          )}
          {/* 不足4个时填充空白格 */}
          {preview.length > 0 && preview.length < 4 && Array.from({ length: 4 - preview.length }).map((_, i) => (
            <div key={`empty-${i}`} className="rounded-lg bg-slate-100/50" />
          ))}
        </div>
        {/* 文件夹名 + 计数 */}
        <span className="text-[11px] font-medium text-slate-700 text-center leading-tight line-clamp-1 w-full px-1">
          {folder.name}
        </span>
        <span className="text-[9px] text-slate-400">{items.length} 个事项</span>
        {isDragOver && <span className="text-[9px] text-indigo-500 font-medium animate-pulse">放入文件夹</span>}
      </div>

      {/* ---- 毛玻璃全屏弹窗（用 Portal 防止 GridLayout transform 穿模） ---- */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 glass-dark" />
          <div
            className="relative glass-heavy rounded-3xl shadow-soft-xl w-[560px] max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头 */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl glass shadow-soft grid grid-cols-2 gap-[2px] p-[3px]">
                  {preview.slice(0, 4).map((it) => (
                    <div key={it.id} className={`rounded-[3px] bg-gradient-to-br ${ICON_BG[it.status]}`} />
                  ))}
                  {preview.length < 4 && Array.from({ length: Math.max(0, 4 - preview.length) }).map((_, i) => (
                    <div key={`mp-${i}`} className="rounded-[3px] bg-slate-100/50" />
                  ))}
                </div>
                <h3 className="text-sm font-bold text-slate-800">{folder.name}</h3>
                <span className="text-[11px] text-slate-400">{items.length} 个事项</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(folder); }}
                  className="p-1.5 rounded-xl hover:bg-white/50 text-slate-400 hover:text-slate-600 transition-colors"
                  title="重命名"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
                  className="p-1.5 rounded-xl hover:bg-red-50/60 text-slate-400 hover:text-red-500 transition-colors"
                  title="删除分组"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/50 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 弹窗内事项网格 */}
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {items.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {items.map((it) => (
                    <Link
                      key={it.id}
                      href={`/items/${it.id}`}
                      className="glass rounded-2xl p-3 shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col gap-2 group/item relative"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ICON_BG[it.status]} flex items-center justify-center shadow-sm`}>
                          {it.icon ? <span className="text-sm">{it.icon}</span> : <span className="text-xs font-bold text-white/90">{it.title.charAt(0)}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-slate-800 truncate">{it.title}</h4>
                          <span className="text-[9px] text-slate-400">{it.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[9px] text-slate-400">
                          <span className="flex items-center gap-0.5"><Layers className="h-2 w-2" />{it.phase_count || 0}</span>
                          <span className="flex items-center gap-0.5"><FileText className="h-2 w-2" />{it.record_count || 0}</span>
                        </div>
                        {onRemoveItem && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveItem(it.id); }}
                            className="opacity-0 group-hover/item:opacity-100 p-1 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-all"
                            title="移出文件夹"
                          >
                            <LogOut className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <span className="text-sm">文件夹是空的</span>
                  <span className="text-xs text-slate-300 mt-1">从桌面拖拽事项至此文件夹</span>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
