'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface FunctionTagStat {
  tag_id: string;
  tag_name: string;
  tag_color: string | null;
  total_minutes: number;
  record_count: number;
}

function formatHours(mins: number): string {
  if (!mins || mins <= 0) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

interface FunctionTagInsightsPanelProps {
  dateFrom: string;
  dateTo: string;
}

export default function FunctionTagInsightsPanel({ dateFrom, dateTo }: FunctionTagInsightsPanelProps) {
  const [stats, setStats] = useState<FunctionTagStat[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v2/insights/function-tags?date_from=${dateFrom}&date_to=${dateTo}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setStats(Array.isArray(data.data) ? data.data : []);
      })
      .catch(() => { if (!cancelled) setStats([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-slate-400">
        本周期内没有带动作标签的记录
      </p>
    );
  }

  const totalMinutes = stats.reduce((s, t) => s + t.total_minutes, 0);
  const maxMinutes = stats[0]?.total_minutes ?? 1;

  return (
    <div className="space-y-2">
      {stats.map((tag) => {
        const barPct = maxMinutes > 0 ? Math.round((tag.total_minutes / maxMinutes) * 100) : 0;
        const sharePct = totalMinutes > 0 ? Math.round((tag.total_minutes / totalMinutes) * 100) : 0;
        return (
          <button
            key={tag.tag_id}
            type="button"
            onClick={() => router.push(`/records?tag_id=${tag.tag_id}`)}
            className="group w-full flex items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50 transition-colors"
          >
            {/* 标签名 */}
            <div className="w-16 shrink-0 text-right">
              <span className="text-[11px] font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                {tag.tag_name}
              </span>
            </div>

            {/* 进度条 */}
            <div className="flex-1 min-w-0">
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>

            {/* 数字 */}
            <div className="shrink-0 flex items-center gap-2 text-[11px]">
              <span className="font-semibold text-slate-800">{formatHours(tag.total_minutes)}</span>
              <span className="text-slate-400">{sharePct}%</span>
              <span className="text-slate-400">{tag.record_count}次</span>
            </div>
          </button>
        );
      })}

      {totalMinutes > 0 && (
        <p className="text-right text-[10px] text-slate-400 pt-1">
          本周期动作记录合计：{formatHours(totalMinutes)}
        </p>
      )}
    </div>
  );
}
