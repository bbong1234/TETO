'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Zap, Loader2, Star, X } from 'lucide-react';
import type { Item, Record as TetoRecord, RecurringActivity } from '@/types/teto';
import { buildRecentSwitchEntries, type QuickSwitchEntry } from '@/lib/activity/quick-switch-utils';
import { buildItemPathLabel, buildRecordDisplayLabel } from '@/lib/activity/item-tree';

interface QuickSwitchPanelProps {
  records: TetoRecord[];
  items?: Item[];
  currentActivity?: TetoRecord | null;
  onSwitched: () => void;
  onError?: (message: string) => void;
}

export default function QuickSwitchPanel({
  records,
  items = [],
  currentActivity,
  onSwitched,
  onError,
}: QuickSwitchPanelProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [recurring, setRecurring] = useState<RecurringActivity[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(true);
  const [savingRecurring, setSavingRecurring] = useState(false);

  const recentEntries = useMemo(
    () => buildRecentSwitchEntries(records, items, 10),
    [records, items]
  );

  const fetchRecurring = useCallback(async () => {
    setRecurringLoading(true);
    try {
      const res = await fetch('/api/v2/recurring-activities');
      const data = await res.json();
      setRecurring(data.data ?? []);
    } catch {
      setRecurring([]);
    } finally {
      setRecurringLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecurring();
  }, [fetchRecurring]);

  const itemLabel = (itemId: string | null | undefined) => {
    if (!itemId) return null;
    return buildItemPathLabel(items, itemId) || items.find((i) => i.id === itemId)?.title || null;
  };

  const handleSwitch = async (
    payload: {
      item_id?: string | null;
      sub_item_id?: string | null;
      content?: string;
    },
    loadingKeyOverride?: string
  ) => {
    const key =
      loadingKeyOverride ??
      `${payload.item_id ?? ''}:${payload.sub_item_id ?? ''}:${payload.content ?? ''}`;
    setLoadingKey(key);
    try {
      const res = await fetch('/api/v2/activities/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message ?? '切换失败');
      }
      onSwitched();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '切换失败');
    } finally {
      setLoadingKey(null);
    }
  };

  const handleQuickSwitch = (entry: QuickSwitchEntry) => {
    handleSwitch({
      item_id: entry.item_id,
      sub_item_id: entry.sub_item_id,
      content: entry.content,
    });
  };

  const handleRecurringSwitch = (r: RecurringActivity) => {
    handleSwitch(
      {
        item_id: r.item_id,
        content: r.name,
      },
      `recurring:${r.id}`
    );
  };

  const handleDeleteRecurring = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/v2/recurring-activities/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      await fetchRecurring();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSaveCurrentAsRecurring = async () => {
    if (!currentActivity) return;
    const name =
      buildRecordDisplayLabel(currentActivity, items) ||
      currentActivity.content?.trim() ||
      '当前事项';
    setSavingRecurring(true);
    try {
      const res = await fetch('/api/v2/recurring-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          item_id: currentActivity.item_id ?? null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message ?? '保存失败');
      }
      await fetchRecurring();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingRecurring(false);
    }
  };

  if (recurring.length === 0 && recentEntries.length === 0 && !currentActivity) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-800">快速切换</h2>
        </div>
        {currentActivity && (
          <button
            type="button"
            disabled={savingRecurring}
            onClick={handleSaveCurrentAsRecurring}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
          >
            {savingRecurring ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Star className="h-3 w-3" />
            )}
            保存为常用
          </button>
        )}
      </div>

      {recurringLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          加载常用事项…
        </div>
      ) : recurring.length > 0 ? (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">常用事项</span>
          <div className="flex flex-wrap gap-2">
            {recurring.map((r) => {
              const key = `recurring:${r.id}`;
              const linkedTitle = r.item?.title ?? itemLabel(r.item_id);
              const displayName = r.item_id ? buildItemPathLabel(items, r.item_id, r.name) : r.name;
              return (
                <div
                  key={r.id}
                  className="relative group flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/80 pl-3 pr-1 py-1 shadow-sm hover:border-amber-300 hover:bg-amber-100"
                >
                  <button
                    type="button"
                    disabled={loadingKey !== null}
                    onClick={() => handleRecurringSwitch(r)}
                    className="flex items-center gap-1.5 text-xs text-slate-700 disabled:opacity-50"
                  >
                    {loadingKey === key && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span className="max-w-[10rem] truncate">{displayName}</span>
                  </button>
                  {linkedTitle && r.item_id && linkedTitle !== displayName && (
                    <Link
                      href={`/items/${r.item_id}`}
                      className="text-[10px] text-blue-600 hover:underline shrink-0 px-1"
                    >
                      {linkedTitle}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteRecurring(r.id, e)}
                    className="rounded-full p-0.5 text-slate-400 hover:text-red-500"
                    aria-label="删除常用事项"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {recentEntries.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">最近使用</span>
          <div className="flex flex-wrap gap-2">
            {recentEntries.map((entry) => {
              const linkedTitle = itemLabel(entry.item_id);
              return (
                <div
                  key={entry.key}
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-white pl-3 pr-2 py-1.5 shadow-sm hover:border-blue-300 hover:bg-blue-50"
                >
                  <button
                    type="button"
                    disabled={loadingKey !== null}
                    onClick={() => handleQuickSwitch(entry)}
                    className="flex items-center gap-1.5 text-xs text-slate-700 disabled:opacity-50"
                  >
                    {loadingKey === entry.key && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span className="max-w-[10rem] truncate">{entry.label}</span>
                  </button>
                  {linkedTitle && entry.item_id && linkedTitle !== entry.label && (
                    <Link
                      href={`/items/${entry.item_id}`}
                      className="text-[10px] text-blue-600 hover:underline shrink-0"
                    >
                      {linkedTitle}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
