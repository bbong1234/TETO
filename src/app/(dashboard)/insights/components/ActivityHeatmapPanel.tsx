'use client';

import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import type { ActivityDay } from '@/types/teto';

const LEVEL_COLORS = [
  'bg-slate-100',
  'bg-blue-200',
  'bg-blue-300',
  'bg-blue-500',
  'bg-blue-700',
];

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月`;
}

export default function ActivityHeatmapPanel({ days }: { days: ActivityDay[] }) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number } | null>(null);

  // 将 days 按周列组织
  const { weeks, monthLabels } = useMemo(() => {
    if (days.length === 0) return { weeks: [], monthLabels: [] };

    // 找到起始日对应的周一
    const firstDate = new Date(days[0].date + 'T00:00:00');
    const dayOfWeek = firstDate.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const firstMonday = new Date(firstDate);
    firstMonday.setDate(firstMonday.getDate() + mondayOffset);

    // 构建日期到 ActivityDay 的映射
    const dayMap = new Map<string, ActivityDay>();
    for (const d of days) dayMap.set(d.date, d);

    // 按周列组织
    const weeks: (ActivityDay | null)[][] = [];
    const mLabels: { label: string; colIndex: number }[] = [];
    let lastMonth = -1;

    const cursor = new Date(firstMonday);
    let currentWeek: (ActivityDay | null)[] = [];

    // 填充起始空白
    for (let i = 0; i < 7; i++) {
      const dateStr = fmtDate(cursor);
      if (dayMap.has(dateStr)) {
        currentWeek.push(dayMap.get(dateStr)!);
      } else {
        currentWeek.push(null);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(currentWeek);
    currentWeek = [];

    // 继续按周填充
    while (cursor <= new Date(days[days.length - 1].date + 'T00:00:00')) {
      const weekCol: (ActivityDay | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const dateStr = fmtDate(cursor);
        weekCol.push(dayMap.get(dateStr) ?? null);
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(weekCol);
    }

    // 月份标签
    for (let col = 0; col < weeks.length; col++) {
      const firstDayInCol = weeks[col].find(d => d !== null);
      if (firstDayInCol) {
        const month = new Date(firstDayInCol.date + 'T00:00:00').getMonth();
        if (month !== lastMonth) {
          mLabels.push({ label: getMonthLabel(firstDayInCol.date), colIndex: col });
          lastMonth = month;
        }
      }
    }

    return { weeks, monthLabels: mLabels };
  }, [days]);

  if (days.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-500" />
          <h2 className="text-base font-semibold text-slate-800">活跃热力图</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">暂无足够记录生成活跃热力图。</p>
        </div>
      </div>
    );
  }

  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-green-500" />
        <h2 className="text-base font-semibold text-slate-800">活跃热力图</h2>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 overflow-x-auto">
        {/* 月份标签 */}
        <div className="flex mb-1" style={{ paddingLeft: '24px' }}>
          {monthLabels.map((m, i) => (
            <span
              key={i}
              className="text-[10px] text-slate-400"
              style={{
                width: `${(weeks.length - (m.colIndex || 0)) * 14}px`,
                minWidth: '20px',
              }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* 热力图网格 */}
        <div className="flex gap-0">
          {/* 星期标签 */}
          <div className="flex flex-col gap-[2px] mr-1 shrink-0">
            {dayLabels.map((label, i) => (
              <span key={i} className="text-[10px] text-slate-400 h-[12px] leading-[12px] w-5 text-right">
                {i % 2 === 0 ? label : ''}
              </span>
            ))}
          </div>

          {/* 格子区域 */}
          <div className="flex gap-[2px]">
            {weeks.map((week, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-[2px]">
                {week.map((day, rowIdx) => (
                  <div
                    key={`${colIdx}-${rowIdx}`}
                    className={`w-[12px] h-[12px] rounded-[2px] ${day ? LEVEL_COLORS[day.level] : 'bg-transparent'}`}
                    title={day ? `${day.date}: ${day.record_count}条记录` : ''}
                    onMouseEnter={() => day && setTooltip({ date: day.date, count: day.record_count })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div className="mt-2 text-[10px] text-slate-500">
            {tooltip.date}: {tooltip.count}条记录
          </div>
        )}

        {/* 图例 */}
        <div className="flex items-center gap-1 mt-3">
          <span className="text-[10px] text-slate-400">不活跃</span>
          {LEVEL_COLORS.map((color, i) => (
            <div key={i} className={`w-[12px] h-[12px] rounded-[2px] ${color}`} />
          ))}
          <span className="text-[10px] text-slate-400">活跃</span>
        </div>
      </div>
    </div>
  );
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
