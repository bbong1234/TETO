'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface FunctionTagWithStats {
  id: string;
  name: string;
  color: string | null;
  type: string | null;
  record_count: number;
  total_minutes: number;
  last_record_at: string | null;
}

function formatMinutes(mins: number): string {
  if (!mins || mins <= 0) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatRelativeDate(isoStr: string | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface ItemFunctionTracePanelProps {
  itemId: string;
}

export default function ItemFunctionTracePanel({ itemId }: ItemFunctionTracePanelProps) {
  const [tags, setTags] = useState<FunctionTagWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v2/items/${itemId}/function-tags`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const frequent: FunctionTagWithStats[] = Array.isArray(data.data?.frequent)
          ? data.data.frequent
          : [];
        setTags(frequent);
      })
      .catch(() => { if (!cancelled) setTags([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-slate-400">
        暂无动作标签记录，在记录中使用动作标签后将显示在此处
      </p>
    );
  }

  const maxMinutes = Math.max(...tags.map((t) => t.total_minutes), 1);

  return (
    <div className="space-y-2">
      {tags.map((tag) => {
        const barWidth = maxMinutes > 0 ? Math.round((tag.total_minutes / maxMinutes) * 100) : 0;
        return (
          <div key={tag.id} className="group flex items-center gap-3">
            {/* 标签名 */}
            <div className="w-20 shrink-0 text-right">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
                {tag.name}
              </span>
            </div>

            {/* 进度条 */}
            <div className="flex-1 min-w-0">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400 transition-all"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>

            {/* 统计数字 */}
            <div className="shrink-0 flex items-center gap-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">{tag.record_count}次</span>
              {tag.total_minutes > 0 && (
                <span className="text-blue-600 font-medium">{formatMinutes(tag.total_minutes)}</span>
              )}
              {tag.last_record_at && (
                <span className="text-slate-400">{formatRelativeDate(tag.last_record_at)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
