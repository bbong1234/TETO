import type { GoalPeriod } from '@/types/teto';

/** 洞察 runtime 共用日期/摘要工具（无 DB） */

export function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatTimeHHMM(isoStr: string | null | undefined): string | undefined {
  if (!isoStr) return undefined;
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function computePeriodLabel(period: GoalPeriod | null): string {
  if (!period) return '累计';
  switch (period) {
    case '每天':
      return '7天';
    case '每周':
      return '本周';
    case '每月':
      return '本月';
    case '每年':
      return '今年';
    default:
      return '累计';
  }
}

export function computeRangeLabel(dateFrom: string, dateTo: string): string {
  const now = new Date();
  const todayStr = fmtLocalDate(now);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  if (dateFrom === fmtLocalDate(sevenDaysAgo) && dateTo === todayStr) return '近 7 天';

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  if (dateFrom === fmtLocalDate(thirtyDaysAgo) && dateTo === todayStr) return '近 30 天';

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  if (dateFrom === monthStart && dateTo === todayStr) return '本月';

  return '自定义';
}
