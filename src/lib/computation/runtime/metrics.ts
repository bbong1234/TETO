import { INSIGHT_METRIC_IDS, type InsightMetricId } from '@/types/teto';

/** 解析 URL metrics= 参数 */
export function parseInsightMetricsParam(raw: string | null): InsightMetricId[] | undefined {
  if (!raw?.trim()) return undefined;
  const out = new Set<InsightMetricId>();
  for (const part of raw.split(',')) {
    const m = part.trim();
    if ((INSIGHT_METRIC_IDS as readonly string[]).includes(m)) {
      out.add(m as InsightMetricId);
    }
  }
  if (out.size === 0) return undefined;
  return [...out];
}

/** summary 依赖其它块的结果 */
export function expandInsightMetrics(requested: Set<InsightMetricId>): Set<InsightMetricId> {
  const out = new Set(requested);
  if (out.has('summary')) {
    for (const dep of ['items', 'goals', 'comparison', 'time_distribution', 'data_review'] as InsightMetricId[]) {
      out.add(dep);
    }
  }
  return out;
}
