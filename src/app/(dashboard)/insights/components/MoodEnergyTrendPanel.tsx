'use client';

import { Smile } from 'lucide-react';
import type { MoodEnergyTrend } from '@/types/teto';

interface MoodEnergyTrendPanelProps {
  data: MoodEnergyTrend | null | undefined;
}

export default function MoodEnergyTrendPanel({ data }: MoodEnergyTrendPanelProps) {
  if (!data || data.days.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Smile className="h-4 w-4 text-amber-500" />
          <h2 className="text-base font-semibold text-slate-800">情绪趋势</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">暂无情绪记录。停止活动或记录时点选表情即可积累数据。</p>
        </div>
      </div>
    );
  }

  const maxMood = 5;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Smile className="h-4 w-4 text-amber-500" />
        <h2 className="text-base font-semibold text-slate-800">情绪趋势</h2>
        {data.average_mood != null && (
          <span className="text-xs text-slate-400 ml-auto">
            均值 {data.average_mood.toFixed(1)} / 5
          </span>
        )}
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
        <div className="flex items-end gap-1 h-24">
          {data.days.map((d) => {
            const h = d.mood_avg != null ? (d.mood_avg / maxMood) * 100 : 4;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex items-end justify-center h-20">
                  <div
                    className={[
                      'w-full max-w-[20px] rounded-t transition-all',
                      d.mood_avg != null ? 'bg-amber-400' : 'bg-slate-100',
                    ].join(' ')}
                    style={{ height: `${Math.max(h, 4)}%` }}
                    title={d.mood_avg != null ? `${d.date}: ${d.mood_avg.toFixed(1)}` : d.date}
                  />
                </div>
                <span className="text-[8px] text-slate-400 truncate w-full text-center">
                  {d.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">近 {data.days.length} 天日均情绪（1–5）</p>
      </div>
    </div>
  );
}
