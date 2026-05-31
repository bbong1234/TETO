'use client';

import { useEffect, useState } from 'react';
import { Loader2, Timer } from 'lucide-react';
import type { ItemActivityStats } from '@/types/teto';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';

interface ItemActivityStatsSectionProps {
  itemId: string;
  stats?: ItemActivityStats | null;
  isCategory?: boolean;
  childCount?: number;
}

export default function ItemActivityStatsSection({
  itemId,
  stats: statsProp,
  isCategory = false,
  childCount = 0,
}: ItemActivityStatsSectionProps) {
  const [stats, setStats] = useState<ItemActivityStats | null>(statsProp ?? null);
  const [loading, setLoading] = useState(statsProp == null);

  useEffect(() => {
    if (statsProp != null) {
      setStats(statsProp);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v2/items/${itemId}/stats`);
        const data = await res.json();
        if (!cancelled) setStats(data.data ?? null);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, statsProp]);

  if (loading) {
    return (
      <section className="glass rounded-3xl shadow-soft-lg p-5 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 rounded bg-slate-200" />
          <div className="h-4 w-20 rounded bg-slate-200" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-slate-100/80 px-3 py-2 h-14" />
          ))}
        </div>
      </section>
    );
  }

  if (!stats) return null;

  const cells = [
    { label: '今日', minutes: stats.today_minutes },
    { label: '本周', minutes: stats.week_minutes },
    { label: '本月', minutes: stats.month_minutes },
    { label: '累计', minutes: stats.total_minutes },
  ];

  return (
    <section className="glass rounded-3xl shadow-soft-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <Timer className="h-4 w-4 text-teal-500" />
        <h2 className="text-sm font-bold text-slate-700">
          {isCategory ? '大类活动时间' : '活动时间'}
        </h2>
        {isCategory && childCount > 0 && (
          <span className="text-[10px] text-slate-400">含 {childCount} 个子事项</span>
        )}
        {stats.last_active_at && (
          <span className="text-[10px] text-slate-400 ml-auto">
            最近{' '}
            {new Date(stats.last_active_at).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-xl bg-teal-50/60 border border-teal-100/80 px-3 py-2 text-center"
          >
            <p className="text-[10px] text-teal-600 font-medium">{c.label}</p>
            <p className="text-sm font-bold text-slate-800 tabular-nums">
              {formatDurationMinutes(c.minutes)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
