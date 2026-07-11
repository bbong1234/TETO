import type { Record as TetoRecord } from '@/types/teto';

/** 计划优先级，存储在 record.subcategory 字段 */
export type PlanPriority = 'high' | 'medium' | 'low';

const PREFIX = 'plan_priority:';

export function getPlanPriority(record: TetoRecord): PlanPriority | null {
  if (record.type !== '计划') return null;
  const sub = record.subcategory;
  if (!sub?.startsWith(PREFIX)) return null;
  const val = sub.slice(PREFIX.length);
  if (val === 'high' || val === 'medium' || val === 'low') return val;
  return null;
}

export function planPriorityToSubcategory(priority: PlanPriority | null): string | null {
  if (!priority) return null;
  return `${PREFIX}${priority}`;
}

export const PLAN_PRIORITY_LABELS: Record<PlanPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const PLAN_PRIORITY_ORDER: Record<PlanPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortPlansByPriority<T extends TetoRecord>(plans: T[]): T[] {
  return [...plans].sort((a, b) => {
    const pa = getPlanPriority(a);
    const pb = getPlanPriority(b);
    const oa = pa ? PLAN_PRIORITY_ORDER[pa] : 3;
    const ob = pb ? PLAN_PRIORITY_ORDER[pb] : 3;
    if (oa !== ob) return oa - ob;
    const da = a.time_anchor_date ?? a.date ?? '';
    const db = b.time_anchor_date ?? b.date ?? '';
    return da.localeCompare(db);
  });
}
