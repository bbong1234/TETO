'use client';

import { useMemo, useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import type { Record } from '@/types/teto';
import { buildRecentSwitchEntries, type QuickSwitchEntry } from '@/lib/activity/quick-switch-utils';

interface QuickSwitchPanelProps {
  records: Record[];
  onSwitched: () => void;
  onError?: (message: string) => void;
}

export default function QuickSwitchPanel({
  records,
  onSwitched,
  onError,
}: QuickSwitchPanelProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const entries = useMemo(() => buildRecentSwitchEntries(records, 10), [records]);

  if (entries.length === 0) return null;

  const handleQuickSwitch = async (entry: QuickSwitchEntry) => {
    setLoadingKey(entry.key);
    try {
      const res = await fetch('/api/v2/activities/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: entry.category,
          subcategory: entry.subcategory,
          item_id: entry.item_id,
          content: entry.content,
        }),
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-800">快速切换</h2>
        <span className="text-[10px] text-slate-400">最近使用</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            disabled={loadingKey !== null}
            onClick={() => handleQuickSwitch(entry)}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            {loadingKey === entry.key && <Loader2 className="h-3 w-3 animate-spin" />}
            <span className="max-w-[12rem] truncate">{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
