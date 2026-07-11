'use client';

import { Loader2, X } from 'lucide-react';
import type { Item } from '@/types/teto';
import { getCategoryItems } from '@/lib/activity/item-tree';

interface BlockCategorySwitchPanelProps {
  open: boolean;
  items: Item[];
  currentCategoryId?: string | null;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (categoryId: string) => void;
}

/** 块时间内「切换」：选择新大类并重开计时 */
export default function BlockCategorySwitchPanel({
  open,
  items,
  currentCategoryId,
  submitting = false,
  onClose,
  onConfirm,
}: BlockCategorySwitchPanelProps) {
  if (!open) return null;

  const categories = getCategoryItems(items, currentCategoryId ?? undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <div
        className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl sm:rounded-2xl"
        role="dialog"
        aria-labelledby="block-category-switch-title"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id="block-category-switch-title" className="text-sm font-semibold text-slate-800">
            切换大类
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          切换后保留当前块时间线，并以所选大类继续计时；事项与动作需重新选择。
        </p>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const selected = cat.id === currentCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                disabled={submitting}
                onClick={() => onConfirm(cat.id)}
                className={[
                  'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border text-center shadow-sm transition-colors active:scale-95 disabled:opacity-50',
                  selected
                    ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200/80'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50',
                ].join(' ')}
              >
                <span
                  className={`max-w-[3.25rem] truncate px-0.5 text-xs font-medium ${selected ? 'text-blue-700' : 'text-slate-700'}`}
                >
                  {cat.title}
                </span>
              </button>
            );
          })}
        </div>
        {submitting && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在切换…
          </div>
        )}
      </div>
    </div>
  );
}
