import { createClient } from '@/lib/supabase/server';
import { computeGoalEngine } from '@/lib/db/goal-engine';
import { buildStatsQuery } from '@/lib/stats/record-filters';
import { CORE_METRICS } from '@/lib/stats/metric-definitions';
import { queryAllRecordsForReview } from '@/lib/stats/computation-center';
import { COMPUTATION } from '@/lib/computation';
import { genBehaviorId } from '@/lib/observability/id-registry';
import { fmtLocalDate, formatTimeHHMM, computePeriodLabel, computeRangeLabel } from '@/lib/computation/runtime/helpers';
import { expandInsightMetrics } from '@/lib/computation/runtime/metrics';
import type {
  InsightsData,
  InsightsQuery,
  DayTimeline,
  TimelineEntry,
  ActivityDay,
  ItemActivity,
  StagnantItem,
  ItemTimeRanking,
  GoalProgress,
  InsightFact,
  InsightChange,
  DataReview,
  GoalRuleType,
  GoalPeriod,
  InsightMetricId,
} from '@/types/teto';

// ============================================
// 主入口
// ============================================

function emptyDayTimeline(dateStr: string, label: string): DayTimeline {
  return { date: dateStr, label, record_count: 0, records: [] };
}

const EMPTY_ITEMS: InsightsData['items'] = {
  active_items: [],
  time_ranking: [],
  stagnant_items: [],
};

const EMPTY_TIME_DIST: NonNullable<InsightsData['time_distribution']> = {
  morning: 0,
  afternoon: 0,
  evening: 0,
  night: 0,
};

const EMPTY_DATA_REVIEW: DataReview = {
  unassigned_count: 0,
  inferred_count: 0,
  missing_time_count: 0,
  pending_goal_draft_count: 0,
};

export async function getInsights(
  userId: string,
  query: InsightsQuery
): Promise<InsightsData> {
  genBehaviorId('B-052'); // getInsights 入口追踪
  const supabase = await createClient();
  const { date_from, date_to } = query;
  const now = new Date();
  const todayStr = fmtLocalDate(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = fmtLocalDate(yesterdayDate);

  const requested =
    query.metrics && query.metrics.length > 0
      ? expandInsightMetrics(new Set(query.metrics))
      : null;

  const want = (m: InsightMetricId) => !requested || requested.has(m);

  let todayTimeline: DayTimeline;
  let yesterdayTimeline: DayTimeline;
  if (want('recent_timeline')) {
    [todayTimeline, yesterdayTimeline] = await Promise.all([
      computeDayTimeline(supabase, userId, todayStr, '今天'),
      computeDayTimeline(supabase, userId, yesterdayStr, '昨天'),
    ]);
  } else {
    todayTimeline = emptyDayTimeline(todayStr, '今天');
    yesterdayTimeline = emptyDayTimeline(yesterdayStr, '昨天');
  }

  const needsDayIds =
    !requested ||
    requested.has('items') ||
    requested.has('time_distribution') ||
    requested.has('data_review') ||
    requested.has('summary');

  let dayIdsInRange: string[] = [];
  if (needsDayIds) {
    const { data: daysInRange } = await supabase
      .from('record_days')
      .select('id')
      .eq('user_id', userId)
      .gte('date', date_from)
      .lte('date', date_to);
    dayIdsInRange = (daysInRange ?? []).map((d: { id: string }) => d.id);
  }

  const heatmapDaysBack = COMPUTATION.time_windows.heatmap_days_back;

  const [
    heatmapDays,
    itemActivityResult,
    goalProgressList,
    timeDistribution,
    periodChanges,
    dataReview,
  ] = await Promise.all([
    want('activity_heatmap')
      ? computeActivityHeatmap(supabase, userId, heatmapDaysBack)
      : Promise.resolve([] as ActivityDay[]),
    want('items')
      ? computeItemActivity(supabase, userId, dayIdsInRange)
      : Promise.resolve(EMPTY_ITEMS),
    want('goals') ? computeGoalProgress(supabase, userId) : Promise.resolve([] as GoalProgress[]),
    want('time_distribution')
      ? computeTimeDistribution(supabase, userId, dayIdsInRange)
      : Promise.resolve(EMPTY_TIME_DIST),
    want('comparison') ? computePeriodChanges(supabase, userId) : Promise.resolve([] as InsightChange[]),
    want('data_review')
      ? computeDataReview(supabase, userId, dayIdsInRange)
      : Promise.resolve(EMPTY_DATA_REVIEW),
  ]);

  const headlineFacts = want('summary')
    ? computeSummaryFacts(
        itemActivityResult,
        goalProgressList,
        periodChanges,
        timeDistribution,
        dataReview,
        dayIdsInRange,
        date_from,
        date_to
      )
    : [];

  const rangeLabel = computeRangeLabel(date_from, date_to);

  return {
    recent_timeline: {
      today: todayTimeline,
      yesterday: yesterdayTimeline,
    },
    activity_heatmap: { days: heatmapDays },
    summary: { headline_facts: headlineFacts },
    range: { date_from, date_to, label: rangeLabel },
    items: itemActivityResult,
    goals: { progress: goalProgressList },
    time_distribution: timeDistribution,
    comparison: { changes: periodChanges },
    data_review: dataReview,
    facts: headlineFacts,
  };
}

// ============================================
// 时间线：按日期查记录，极简格式
// ============================================
async function computeDayTimeline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dateStr: string,
  label: string
): Promise<DayTimeline> {
  // 获取该日的 record_day
  const { data: dayData } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .eq('date', dateStr);

  const dayIds = (dayData ?? []).map((d: { id: string }) => d.id);
  if (dayIds.length === 0) {
    return { date: dateStr, label, record_count: 0, records: [] };
  }

  // 使用 activity_heatmap 指标定义的统一口径查询
  const { data: records } = await buildStatsQuery(supabase, userId, CORE_METRICS.activity_heatmap, {
    selectFields: 'id, occurred_at, occurred_at_end, content, action_text, event_text',
  })
    .in('record_day_id', dayIds)
    .order('occurred_at', { ascending: true, nullsFirst: false });

  const allRecords = records ?? [];
  const entries: TimelineEntry[] = allRecords.slice(0, 50).map((r: any) => {
    // text：优先 action_text + event_text 合并
    const parts = [r.action_text, r.event_text].filter(Boolean);
    const text = parts.length > 0 ? parts.join('、') : (r.content || '').slice(0, 50);

    return {
      id: r.id,
      start_time: formatTimeHHMM(r.occurred_at),
      end_time: formatTimeHHMM(r.occurred_at_end),
      text,
    };
  });

  return {
    date: dateStr,
    label,
    record_count: allRecords.length,
    records: entries,
  };
}

// ============================================
// 活跃热力图：过去180天每日记录数
// ============================================
async function computeActivityHeatmap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  daysBack: number = 180
): Promise<ActivityDay[]> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);
  const startStr = fmtLocalDate(startDate);
  const endStr = fmtLocalDate(now);

  const { data: dayCounts } = await supabase
    .from('record_days')
    .select('date, records(count)')
    .eq('user_id', userId)
    .gte('date', startStr)
    .lte('date', endStr)
    .order('date', { ascending: true });

  // 构建日期→记录数映射
  const countMap = new Map<string, number>();
  for (const d of (dayCounts ?? [])) {
    const count = (d as any).records?.[0]?.count ?? 0;
    countMap.set((d as any).date, Number(count));
  }

  // 计算百分位（仅基于有记录的天）
  const activeCounts: number[] = [];
  for (const c of countMap.values()) {
    if (c > 0) activeCounts.push(c);
  }
  activeCounts.sort((a, b) => a - b);
  const p25 = activeCounts.length > 0 ? activeCounts[Math.floor(activeCounts.length * 0.25)] : 1;
  const p50 = activeCounts.length > 0 ? activeCounts[Math.floor(activeCounts.length * 0.5)] : 2;
  const p75 = activeCounts.length > 0 ? activeCounts[Math.floor(activeCounts.length * 0.75)] : 4;

  function computeLevel(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0;
    if (count <= p25) return 1;
    if (count <= p50) return 2;
    if (count <= p75) return 3;
    return 4;
  }

  // 填充所有日期（含无记录的）
  const days: ActivityDay[] = [];
  const cursor = new Date(startDate);
  while (cursor <= now) {
    const dateStr = fmtLocalDate(cursor);
    const count = countMap.get(dateStr) ?? 0;
    days.push({ date: dateStr, record_count: count, level: computeLevel(count) });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

// ============================================
// 事项活动：活跃排行 + 时长排名 + 停滞事项
// ============================================
async function computeItemActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<InsightsData['items']> {
  const emptyResult: InsightsData['items'] = { active_items: [], time_ranking: [], stagnant_items: [] };

  // 获取活跃事项
  const { data: allItems } = await supabase
    .from('items')
    .select('id, title, status')
    .eq('user_id', userId)
    .in('status', [...COMPUTATION.data_scope.active_item_statuses]);

  if (!allItems || allItems.length === 0) return emptyResult;

  const allItemIds = allItems.map((i: { id: string }) => i.id);
  const now = new Date();

  // 范围内记录按事项聚合
  const activeItems: ItemActivity[] = [];
  const timeRankingData: { [itemId: string]: { title: string; totalDuration: number; recordCount: number } } = {};

  if (dayIdsInRange.length > 0) {
    const { data: recordsWithItem } = await buildStatsQuery(supabase, userId, CORE_METRICS.item_total_effort, {
      selectFields: 'item_id, duration_minutes, items(id, title)',
    })
      .in('record_day_id', dayIdsInRange)
      .not('item_id', 'is', null);

    const itemCountMap: { [id: string]: { title: string; count: number; duration: number } } = {};
    for (const r of (recordsWithItem ?? [])) {
      const item = (r as any).items as unknown as { id: string; title: string } | null;
      if (!item || !(r as any).item_id) continue;
      if (!itemCountMap[(r as any).item_id]) {
        itemCountMap[(r as any).item_id] = { title: item.title, count: 0, duration: 0 };
      }
      itemCountMap[(r as any).item_id].count++;
      itemCountMap[(r as any).item_id].duration += (r as any).duration_minutes || 0;
    }

    // 总时长（用于百分比）
    const totalDuration = Object.values(itemCountMap).reduce((s, v) => s + v.duration, 0);

    for (const [itemId, v] of Object.entries(itemCountMap)) {
      activeItems.push({
        item_id: itemId,
        item_title: v.title,
        record_count: v.count,
        total_duration_minutes: v.duration,
        last_record_at: null, // 后面补充
      });

      timeRankingData[itemId] = {
        title: v.title,
        totalDuration: v.duration,
        recordCount: v.count,
      };
    }

    // 按记录数降序
    activeItems.sort((a, b) => b.record_count - a.record_count);
  }

  // 时长排名
  const totalDurationForRanking = Object.values(timeRankingData).reduce((s, v) => s + v.totalDuration, 0);
  const time_ranking: ItemTimeRanking[] = Object.entries(timeRankingData)
    .map(([item_id, v]) => ({
      item_id,
      item_title: v.title,
      total_duration_minutes: v.totalDuration,
      record_count: v.recordCount,
      percentage: totalDurationForRanking > 0 ? Math.round((v.totalDuration / totalDurationForRanking) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total_duration_minutes - a.total_duration_minutes);

  // 停滞事项
  const { data: recentRecords } = await buildStatsQuery(supabase, userId, CORE_METRICS.activity_score, {
    selectFields: 'item_id, created_at',
  })
    .in('item_id', allItemIds)
    .order('created_at', { ascending: false });

  const lastRecordMap: { [itemId: string]: string } = {};
  for (const r of (recentRecords ?? [])) {
    if ((r as any).item_id && !lastRecordMap[(r as any).item_id]) {
      lastRecordMap[(r as any).item_id] = (r as any).created_at;
    }
  }

  // 补充 activeItems 的 last_record_at
  for (const item of activeItems) {
    item.last_record_at = lastRecordMap[item.item_id] ?? null;
  }

  const fourteenDaysAgoISO = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const stagnant_items: StagnantItem[] = [];
  for (const item of (allItems ?? [])) {
    const lastAt = lastRecordMap[(item as any).id] ?? null;
    if (!lastAt || lastAt < fourteenDaysAgoISO) {
      const days = lastAt
        ? Math.floor((now.getTime() - new Date(lastAt).getTime()) / 86400000)
        : 999;
      stagnant_items.push({
        item_id: (item as any).id,
        item_title: (item as any).title,
        stagnation_days: days,
        last_record_at: lastAt,
      });
    }
  }

  return { active_items: activeItems, time_ranking, stagnant_items };
}

// ============================================
// 目标进度：批量调用 goal-engine
// ============================================
async function computeGoalProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<GoalProgress[]> {
  const { data: activeGoals } = await supabase
    .from('goals')
    .select('id, goal_text, rule_type, period, target_min, target_max, unit, status')
    .eq('user_id', userId)
    .eq('status', '进行中');

  if (!activeGoals || activeGoals.length === 0) return [];

  const results: GoalProgress[] = [];

  for (const goal of activeGoals) {
    try {
      const engineResult = await computeGoalEngine(userId, (goal as any).id);
      if (!engineResult) continue;

      const ruleType = (goal as any).rule_type as GoalRuleType;
      const period = (goal as any).period as GoalPeriod | null;
      const unit = (goal as any).unit || '';

      let currentValue: number;
      let targetValue: number;
      let isOverLimit: boolean | undefined;

      switch (ruleType) {
        case '一次性完成':
          currentValue = engineResult.total_actual;
          targetValue = engineResult.total_target ?? 0;
          break;
        case '周期性达成':
          currentValue = engineResult.current_period_actual;
          targetValue = engineResult.current_period_target;
          break;
        case '周期性限制':
          currentValue = engineResult.current_period_actual;
          targetValue = engineResult.remaining_budget != null
            ? currentValue + engineResult.remaining_budget
            : ((goal as any).target_max ?? 0);
          isOverLimit = engineResult.is_over_limit ?? false;
          break;
        default:
          currentValue = 0;
          targetValue = 0;
      }

      results.push({
        goal_id: (goal as any).id,
        goal_text: (goal as any).goal_text || '',
        current_value: Math.round(currentValue * 100) / 100,
        target_value: Math.round(targetValue * 100) / 100,
        unit,
        period_label: ruleType === '一次性完成' ? '累计' : computePeriodLabel(period),
        is_over_limit: isOverLimit,
        rule_type: ruleType,
      });
    } catch {
      // 单个目标计算失败不影响整体
    }
  }

  return results;
}

// ============================================
// 时间段分布：按 occurred_at 小时归类为 4 时段
// ============================================
async function computeTimeDistribution(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<NonNullable<InsightsData['time_distribution']>> {
  const empty = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  if (dayIdsInRange.length === 0) return empty;

  const { data: records } = await buildStatsQuery(supabase, userId, CORE_METRICS.time_distribution, {
    selectFields: 'occurred_at',
  })
    .in('record_day_id', dayIdsInRange)
    .not('occurred_at', 'is', null);

  let morning = 0;
  let afternoon = 0;
  let evening = 0;
  let night = 0;

  for (const r of (records ?? [])) {
    if (!(r as any).occurred_at) continue;
    const hour = new Date((r as any).occurred_at).getHours();
    if (hour >= 6 && hour < 12) morning++;
    else if (hour >= 12 && hour < 18) afternoon++;
    else if (hour >= 18 && hour < 22) evening++;
    else night++;
  }

  return { morning, afternoon, evening, night };
}

// ============================================
// 周期对比变化列表
// ============================================
async function computePeriodChanges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<InsightChange[]> {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - dayOfWeek + 1);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  async function fetchPeriodStats(dateFrom: string, dateTo: string) {
    const { data: days } = await supabase
      .from('record_days').select('id').eq('user_id', userId).gte('date', dateFrom).lte('date', dateTo);
    const dayIds = (days || []).map((d: { id: string }) => d.id);
    if (dayIds.length === 0) return { record_count: 0, total_hours: 0, total_cost: 0 };

    // 使用 period_comparison 指标定义的统一口径查询
    const { data: recs } = await buildStatsQuery(supabase, userId, CORE_METRICS.period_comparison, {
      selectFields: 'id, duration_minutes, cost',
    })
      .in('record_day_id', dayIds);

    const record_count = recs?.length || 0;
    const total_hours = Math.round((recs || []).reduce((s: number, r: any) => s + (r.duration_minutes || 0), 0) / 60 * 10) / 10;
    const total_cost = (recs || []).reduce((s: number, r: any) => s + (r.cost || 0), 0);
    return { record_count, total_hours, total_cost };
  }

  async function fetchItemPeriodCounts(dateFrom: string, dateTo: string) {
    const { data: days } = await supabase
      .from('record_days').select('id').eq('user_id', userId).gte('date', dateFrom).lte('date', dateTo);
    const dayIds = (days || []).map((d: { id: string }) => d.id);
    if (dayIds.length === 0) return new Map<string, { title: string; count: number }>();

    // 使用 period_comparison 指标定义的统一口径查询
    const { data: recs } = await buildStatsQuery(supabase, userId, CORE_METRICS.period_comparison, {
      selectFields: 'item_id, items(id, title)',
    })
      .in('record_day_id', dayIds)
      .not('item_id', 'is', null);

    const map = new Map<string, { title: string; count: number }>();
    for (const r of (recs || [])) {
      if (!(r as any).item_id) continue;
      const item = (r as any).items as { id: string; title: string } | null;
      if (!item) continue;
      const existing = map.get((r as any).item_id);
      if (existing) existing.count++;
      else map.set((r as any).item_id, { title: item.title, count: 1 });
    }
    return map;
  }

  const [thisWeek, lastWeek, thisMonth, lastMonth, thisWeekItems, lastWeekItems] = await Promise.all([
    fetchPeriodStats(fmtLocalDate(thisWeekStart), fmtLocalDate(now)),
    fetchPeriodStats(fmtLocalDate(lastWeekStart), fmtLocalDate(lastWeekEnd)),
    fetchPeriodStats(fmtLocalDate(thisMonthStart), fmtLocalDate(now)),
    fetchPeriodStats(fmtLocalDate(lastMonthStart), fmtLocalDate(lastMonthEnd)),
    fetchItemPeriodCounts(fmtLocalDate(thisWeekStart), fmtLocalDate(now)),
    fetchItemPeriodCounts(fmtLocalDate(lastWeekStart), fmtLocalDate(lastWeekEnd)),
  ]);

  const changes: InsightChange[] = [];

  function addChange(label: string, current: number, previous: number, unit: string, scope: 'week' | 'month') {
    if (current === previous) {
      changes.push({ label, value: 0, unit, direction: 'same', scope });
    } else if (previous === 0) {
      changes.push({ label, value: `+${current}`, unit, direction: 'up', scope });
    } else {
      const diff = current - previous;
      changes.push({
        label,
        value: diff,
        unit,
        direction: diff > 0 ? 'up' : 'down',
        scope,
      });
    }
  }

  // 全局指标 - 周变化
  addChange('记录数', thisWeek.record_count, lastWeek.record_count, '条', 'week');
  addChange('时长', thisWeek.total_hours, lastWeek.total_hours, 'h', 'week');
  addChange('花费', thisWeek.total_cost, lastWeek.total_cost, '元', 'week');

  // 全局指标 - 月变化
  addChange('记录数', thisMonth.record_count, lastMonth.record_count, '条', 'month');
  addChange('时长', thisMonth.total_hours, lastMonth.total_hours, 'h', 'month');
  addChange('花费', thisMonth.total_cost, lastMonth.total_cost, '元', 'month');

  // 事项级周变化（差异>=3的才展示）
  for (const [itemId, thisData] of thisWeekItems) {
    const lastData = lastWeekItems.get(itemId);
    const lastCount = lastData?.count ?? 0;
    const diff = thisData.count - lastCount;
    if (Math.abs(diff) >= 3) {
      changes.push({
        label: `${thisData.title}记录`,
        value: diff,
        unit: '条',
        direction: diff > 0 ? 'up' : 'down',
        scope: 'week',
      });
    }
  }

  return changes;
}

// ============================================
// 数据待整理
// ============================================
async function computeDataReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<DataReview> {
  if (dayIdsInRange.length === 0) {
    return { unassigned_count: 0, inferred_count: 0, missing_time_count: 0, pending_goal_draft_count: 0 };
  }

  // 一次查询范围内所有记录的关键字段
  const allRecords = await queryAllRecordsForReview(supabase, userId, dayIdsInRange);
  const unassigned_count = allRecords.filter((r: any) => !r.item_id).length;
  const inferred_count = allRecords.filter((r: any) => r.data_nature === 'inferred').length;
  const missing_time_count = allRecords.filter((r: any) => !r.occurred_at).length;

  // 待确认目标草稿
  const { count: pendingGoalDraftCount } = await supabase
    .from('goals')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', '草稿');

  return {
    unassigned_count,
    inferred_count,
    missing_time_count,
    pending_goal_draft_count: pendingGoalDraftCount ?? 0,
  };
}

// ============================================
// 本期摘要：基于已有结果生成3-5条事实
// ============================================
function computeSummaryFacts(
  itemActivityResult: InsightsData['items'],
  goalProgressList: GoalProgress[],
  periodChanges: InsightChange[],
  timeDistribution: NonNullable<InsightsData['time_distribution']>,
  dataReview: DataReview,
  dayIdsInRange: string[],
  dateFrom: string,
  dateTo: string,
): InsightFact[] {
  const facts: InsightFact[] = [];

  // 1. 记录总数
  const totalRecords = itemActivityResult.active_items.reduce((s, i) => s + i.record_count, 0);
  if (totalRecords > 0) {
    facts.push({
      text: `本期共记录 ${totalRecords} 条。`,
      timeScope: `${dateFrom} ~ ${dateTo}`,
      source: '事项活动记录统计',
    });
  }

  // 2. 最活跃事项
  if (itemActivityResult.active_items.length > 0) {
    const top = itemActivityResult.active_items[0];
    facts.push({
      text: `最活跃事项是「${top.item_title}」，共 ${top.record_count} 条记录。`,
      timeScope: `${dateFrom} ~ ${dateTo}`,
      source: '事项记录数排名',
      itemId: top.item_id,
    });
  }

  // 3. 超限目标
  const overLimitGoals = goalProgressList.filter(g => g.is_over_limit);
  for (const g of overLimitGoals.slice(0, 2)) {
    facts.push({
      text: `「${g.goal_text}」超限，当前 ${g.current_value} / ${g.target_value} ${g.unit}。`,
      timeScope: g.period_label,
      source: '目标引擎计算',
    });
  }

  // 4. 周期时长变化
  const weekDurationChange = periodChanges.find(c => c.label === '时长' && c.scope === 'week');
  if (weekDurationChange && weekDurationChange.direction !== 'same') {
    const dir = weekDurationChange.direction === 'up' ? '上升' : '下降';
    facts.push({
      text: `本周时长相比上周${dir} ${Math.abs(Number(weekDurationChange.value))} ${weekDurationChange.unit}。`,
      timeScope: '本周 vs 上周',
      source: '周期对比统计',
    });
  }

  // 5. 数据待整理
  if (dataReview.unassigned_count > 0) {
    facts.push({
      text: `有 ${dataReview.unassigned_count} 条记录未关联事项，需要整理。`,
      timeScope: `${dateFrom} ~ ${dateTo}`,
      source: '记录事项关联统计',
    });
  }

  // 6. 推断数据
  if (dataReview.inferred_count > 0) {
    facts.push({
      text: `含 ${dataReview.inferred_count} 条推断数据。`,
      timeScope: `${dateFrom} ~ ${dateTo}`,
      source: '记录 data_nature 统计',
    });
  }

  return facts.slice(0, 5);
}
