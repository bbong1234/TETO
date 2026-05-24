'use client';

import { useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Item } from '@/types/teto';
import { ACTIVITY_CATEGORY_PRESETS, ACTIVITY_SUBCATEGORY_HINTS } from '@/lib/activity/constants';

export interface StartActivitySubmitPayload {
  content?: string;
  category?: string;
  subcategory?: string;
  item_id?: string | null;
  occurred_at?: string;
  occurred_at_end?: string;
}

interface StartActivityPanelProps {
  open: boolean;
  mode: 'start' | 'switch' | 'backfill';
  items: Item[];
  initialCategory?: string;
  initialSubcategory?: string;
  initialContent?: string;
  initialStart?: string;
  initialEnd?: string;
  onClose: () => void;
  onSubmit: (payload: StartActivitySubmitPayload) => Promise<void>;
}

const ACTIVE_ITEM_STATUSES = new Set(['活跃', '推进中', '放缓', '停滞']);

function toDatetimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string {
  return new Date(local).toISOString();
}

export default function StartActivityPanel({
  open,
  mode,
  items,
  initialCategory,
  initialSubcategory,
  initialContent,
  initialStart,
  initialEnd,
  onClose,
  onSubmit,
}: StartActivityPanelProps) {
  const [category, setCategory] = useState(initialCategory ?? '');
  const [subcategory, setSubcategory] = useState(initialSubcategory ?? '');
  const [content, setContent] = useState(initialContent ?? '');
  const [itemId, setItemId] = useState<string>('');
  const [startLocal, setStartLocal] = useState(toDatetimeLocal(initialStart));
  const [endLocal, setEndLocal] = useState(toDatetimeLocal(initialEnd));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeItems = useMemo(
    () => items.filter((i) => ACTIVE_ITEM_STATUSES.has(i.status)),
    [items]
  );

  const subcategoryHints = category ? ACTIVITY_SUBCATEGORY_HINTS[category] ?? [] : [];

  if (!open) return null;

  const title =
    mode === 'backfill' ? '补记时间' : mode === 'switch' ? '切换到' : '开始一件事';

  const handleSubmit = async () => {
    setError('');
    if (!category && !content.trim() && mode !== 'switch') {
      setError('请选择分类或填写事项描述');
      return;
    }
    if (mode === 'backfill') {
      if (!startLocal || !endLocal) {
        setError('请填写开始和结束时间');
        return;
      }
      if (Date.parse(endLocal) <= Date.parse(startLocal)) {
        setError('结束时间必须晚于开始时间');
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        content: content.trim() || undefined,
        category: category || undefined,
        subcategory: subcategory || undefined,
        item_id: itemId || null,
        occurred_at: mode === 'backfill' ? datetimeLocalToIso(startLocal) : undefined,
        occurred_at_end: mode === 'backfill' ? datetimeLocalToIso(endLocal) : undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchToNone = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({});
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">分类</p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_CATEGORY_PRESETS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat === category ? '' : cat);
                    setSubcategory('');
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    category === cat
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {subcategoryHints.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">子类</p>
              <div className="flex flex-wrap gap-2">
                {subcategoryHints.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSubcategory(sub === subcategory ? '' : sub)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      subcategory === sub
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">项目（可选）</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            >
              <option value="">不关联项目</option>
              {activeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">具体事项（可选）</label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="例如：接口联调、写方案"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          {mode === 'backfill' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">开始</label>
                <input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">结束</label>
                <input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          {mode === 'switch' && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSwitchToNone}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              切换到无
            </button>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="ml-auto flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'backfill' ? '保存补记' : mode === 'switch' ? '确认切换' : '开始'}
          </button>
        </div>
      </div>
    </div>
  );
}
