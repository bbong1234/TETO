'use client';

import { Activity, Clock } from 'lucide-react';
import type { InsightsData } from '@/types/teto';

type Portrait = NonNullable<InsightsData['item_overview']['portraits']>[number];

function formatLastRecordAt(dateStr: string | null): string {
  if (!dateStr) return '从未记录';
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return `${Math.floor(diffDays / 30)} 月前`;
}

function getStatusLabel(portrait: Portrait): { text: string; color: string } {
  if (portrait.completion_rate === null) return { text: '', color: '' };
  const rate = portrait.completion_rate;
  if (rate < 0.6) return { text: '⚠ 欠债严重', color: 'text-red-500 bg-red-50' };
  if (rate < 0.85) return { text: '→ 基本达标', color: 'text-amber-600 bg-amber-50' };
  return { text: '✓ 状态良好', color: 'text-emerald-600 bg-emerald-50' };
}

function PortraitCard({ portrait }: { portrait: Portrait }) {
  const status = getStatusLabel(portrait);
  const barWidth = Math.min(100, (portrait.record_count / 50) * 100);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-800 truncate flex-1">{portrait.title}</span>
        {status.text && (
          <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.color}`}>
            {status.text}
          </span>
        )}
      </div>

      {/* 记录数进度条 */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-400 transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">{portrait.record_count} 条</span>
      </div>

      {/* 完成率 + 欠债 */}
      {portrait.completion_rate !== null && (
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>完成率 {Math.round(portrait.completion_rate * 100)}%</span>
          {portrait.deficit !== null && portrait.deficit < 0 && (
            <span className="text-red-400">差额 {portrait.deficit.toLocaleString()}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface ItemPortraitProps {
  data: InsightsData['item_overview'];
}

export default function ItemPortrait({ data }: ItemPortraitProps) {
  const portraits = data.portraits ?? [];
  const staleItems = data.stale_items ?? [];

  // 活跃画像：范围内有记录的事项
  const activePortraits = portraits.filter(p => p.record_count > 0);
  // 沉寂事项：超过14天无记录
  const silentItems = staleItems;

  if (activePortraits.length === 0 && silentItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
        <p className="text-sm text-slate-400">该时间段内暂无活跃事项</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <Activity className="h-4 w-4 text-indigo-500" />
        最近你主要在做
      </h2>

      {activePortraits.length > 0 && (
        <div className="space-y-2">
          {activePortraits.map(p => (
            <PortraitCard key={p.id} portrait={p} />
          ))}
        </div>
      )}

      {silentItems.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-2">
            <Clock className="h-3.5 w-3.5" />
            沉寂中的事项
          </h3>
          <div className="space-y-1.5">
            {silentItems.map(item => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-600">{item.title}</span>
                <span className="text-[11px] text-slate-400">
                  上次记录：{formatLastRecordAt(item.last_record_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
