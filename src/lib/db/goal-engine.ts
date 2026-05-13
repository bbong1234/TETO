import { createClient } from '@/lib/supabase/server';
import type { Goal, GoalEngineResult, GoalRuleType, GoalPeriod } from '@/types/teto';
import { COMPUTATION } from '@/lib/computation';
import { buildStatsQuery } from '@/lib/stats/record-filters';
import { CORE_METRICS } from '@/lib/stats/metric-definitions';
import { genToolCallId, genBehaviorId } from '@/lib/observability/id-registry';

/**
 * 为目标计算结果生成解释文本
 */
function buildGoalExplain(result: GoalEngineResult): string {
  const title = result.goal_title;
  const ruleName = result.rule_type;
  const pct = result.completion_rate != null ? `${Math.round(result.completion_rate * 100)}%` : 'N/A';

  if (result.rule_type === '周期性达成') {
    return `周期性目标「${title}」：当期 ${result.current_period_actual}/${result.current_period_target}${result.unit}（${pct}），累计 ${result.total_actual}${result.unit}`;
  }
  if (result.rule_type === '周期性限制') {
    const over = result.is_over_limit ? '⚠已超限' : '✓未超限';
    return `限制型目标「${title}」：当期 ${result.current_period_actual}/${result.current_period_target}${result.unit}（${pct}），${over}`;
  }
  // 一次性完成
  return `一次性目标「${title}」：累计 ${result.total_actual}/${result.total_target ?? '?'}${result.unit}（${pct}），已过 ${result.total_passed_days} 天`;
}

/**
 * 统一目标引擎 — 3 类规则分流计算
 *
 * 数据流：Goal 配置（标尺） + Records 流水（事实） → 碰撞运算 → GoalEngineResult
 *
 * 防串库逻辑（保持不变）：
 *   优先通过 goal.sub_item_id 过滤记录（精准指向子项行动线），
 *   metric_name + unit 作为辅助校验（双重匹配防串库）。
 *   当 sub_item_id 为空时，回退到纯 metric_name 匹配。
 *
 * 草稿目标（status = '草稿'）不参与引擎计算。
 */

// ============================================
// 辅助：日期计算
// ============================================

/** 计算两个日期之间的天数差（纯本地日期运算，避免 UTC 偏移） */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00');
  const b = new Date(dateB + 'T00:00:00');
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** 获取今天的本地日期字符串 YYYY-MM-DD */
function todayStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** N 天前的本地日期字符串 */
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 格式化 Date 为本地日期字符串 YYYY-MM-DD */
function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================
// 辅助：获取事项下所有目标
// ============================================

async function fetchGoalsForItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string
): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .neq('status', '草稿');  // 草稿目标不参与计算

  if (error) {
    throw new Error(`获取事项目标列表失败: ${error.message}`);
  }

  return (data || []) as Goal[];
}

// ============================================
// 辅助：防串库 metric 过滤
// ============================================

interface MetricFilter {
  metric_name?: string;
  unit?: string;
  sub_item_id?: string;
}

function buildMetricFilter(goal: Goal): MetricFilter {
  return {
    sub_item_id: goal.sub_item_id || undefined,
    metric_name: goal.metric_name || undefined,
    unit: goal.unit || undefined,
  };
}

// ============================================
// 辅助：批量求和
// ============================================

interface SumResult {
  total: number;
  today: number;
  s7d: number;
  s30d: number;
}

async function sumMetricValuesBatched(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
  filters: MetricFilter,
  subItemId: string | undefined,
  dateTotal: string,
  dateToday: string,
  date7d: string,
  date30d: string,
): Promise<SumResult> {
  const buildQuery = () => {
    let q = buildStatsQuery(supabase, userId, CORE_METRICS.goal_progress, {
      selectFields: 'metric_value, record_days!inner(date)',
      itemId,
      subItemId: subItemId || undefined,
    })
      .not('metric_value', 'is', null)
      .gte('record_days.date', dateTotal)
      .lte('record_days.date', dateToday);

    if (filters.metric_name && filters.unit) {
      q = q.eq('metric_name', filters.metric_name).eq('metric_unit', filters.unit);
    } else if (filters.metric_name) {
      q = q.eq('metric_name', filters.metric_name);
    } else if (filters.unit) {
      q = q.eq('metric_unit', filters.unit);
    }
    return q;
  };

  const PAGE_SIZE = 1000;
  const allData: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`查询记录指标失败: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (allData.length === 0) {
    return { total: 0, today: 0, s7d: 0, s30d: 0 };
  }

  let total = 0, today = 0, s7d = 0, s30d = 0;
  for (const row of allData) {
    const val = Number((row as any).metric_value) || 0;
    const date = (row as any).record_days?.date as string | undefined;
    if (!date) { total += val; continue; }
    total += val;
    if (date === dateToday) today += val;
    if (date >= date7d) s7d += val;
    if (date >= date30d) s30d += val;
  }

  return { total, today, s7d, s30d };
}

// ============================================
// 辅助：周期内计数（无 metric_name 时用记录条数）
// ============================================

async function countRecordsInPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
  subItemId: string | undefined,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const { data: dayData } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (!dayData || dayData.length === 0) return 0;

  const dayIds = dayData.map((d: { id: string }) => d.id);
  let q = buildStatsQuery(supabase, userId, CORE_METRICS.goal_progress, {
    selectFields: 'id',
    itemId,
    subItemId: subItemId || undefined,
  })
    .in('record_day_id', dayIds);

  const { data } = await q;
  return data?.length ?? 0;
}

// ============================================
// 辅助：判断 unit 是否为时长类（分钟/小时）
// ============================================

const DURATION_UNITS = new Set(['分钟', 'min', '分钟/次', '小时', 'h', 'hr', 'hrs', '小时/次']);

function isDurationUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  return DURATION_UNITS.has(unit.toLowerCase()) || /分钟|min|小时|hour/i.test(unit);
}

// ============================================
// 辅助：周期内 duration_minutes 求和
// ============================================

async function sumDurationInPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
  subItemId: string | undefined,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const { data: dayData } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (!dayData || dayData.length === 0) return 0;

  const dayIds = dayData.map((d: { id: string }) => d.id);
  let q = buildStatsQuery(supabase, userId, CORE_METRICS.goal_progress, {
    selectFields: 'duration_minutes',
    itemId,
    subItemId: subItemId || undefined,
  })
    .in('record_day_id', dayIds)
    .not('duration_minutes', 'is', null);

  const { data, error } = await q;
  if (error || !data) return 0;

  return (data as any[]).reduce((sum: number, row: any) => sum + (Number(row.duration_minutes) || 0), 0);
}

// ============================================
// 辅助：批量 duration_minutes 求和（total/today/7d/30d 窗口）
// ============================================

interface DurationSumResult {
  total: number;
  today: number;
  s7d: number;
  s30d: number;
}

async function sumDurationBatched(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
  subItemId: string | undefined,
  dateTotal: string,
  dateToday: string,
  date7d: string,
  date30d: string,
): Promise<DurationSumResult> {
  const { data: dayData } = await supabase
    .from('record_days')
    .select('id, date')
    .eq('user_id', userId)
    .gte('date', dateTotal)
    .lte('date', dateToday);

  if (!dayData || dayData.length === 0) return { total: 0, today: 0, s7d: 0, s30d: 0 };

  const dayIds = dayData.map((d: { id: string }) => d.id);
  const dateMap = new Map<string, string>();
  for (const d of (dayData as any[])) {
    dateMap.set((d as any).id, (d as any).date);
  }

  const PAGE_SIZE = 1000;
  const allData: any[] = [];
  let from = 0;

  while (true) {
    let q = buildStatsQuery(supabase, userId, CORE_METRICS.goal_progress, {
      selectFields: 'duration_minutes, record_day_id',
      itemId,
      subItemId: subItemId || undefined,
    })
      .in('record_day_id', dayIds)
      .not('duration_minutes', 'is', null);

    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (allData.length === 0) return { total: 0, today: 0, s7d: 0, s30d: 0 };

  let total = 0, today = 0, s7d = 0, s30d = 0;
  for (const row of allData) {
    const val = Number((row as any).duration_minutes) || 0;
    const date = dateMap.get((row as any).record_day_id);
    if (!date) { total += val; continue; }
    total += val;
    if (date === dateToday) today += val;
    if (date >= date7d) s7d += val;
    if (date >= date30d) s30d += val;
  }

  return { total, today, s7d, s30d };
}

// ============================================
// 辅助：周期起止计算
// ============================================

function computeCurrentPeriod(
  period: GoalPeriod,
  today: string
): { periodStart: string; periodEnd: string } {
  const now = new Date(today + 'T00:00:00');

  if (period === '每天') {
    return { periodStart: today, periodEnd: today };
  }

  if (period === '每周' || period === '本周') {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      periodStart: fmtLocalDate(monday),
      periodEnd: fmtLocalDate(sunday),
    };
  }

  if (period === '每月' || period === '本月') {
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
      periodStart: fmtLocalDate(firstDay),
      periodEnd: fmtLocalDate(lastDay),
    };
  }

  if (period === '每年') {
    const year = now.getFullYear();
    return {
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
    };
  }

  // 默认按日
  return { periodStart: today, periodEnd: today };
}

/** 计算周期内包含的天数 */
function getPeriodDays(period: GoalPeriod): number {
  return COMPUTATION.data_scope.period_days[period] ?? 1;
}

// ============================================
// 统一入口：为事项计算所有目标
// ============================================

/**
 * 为事项下所有目标批量计算引擎结果
 */
export async function computeGoalEngineForItem(
  userId: string,
  itemId: string
): Promise<GoalEngineResult[]> {
  genBehaviorId('B-042'); // computeGoalEngineForItem 入口追踪
  const supabase = await createClient();
  const goals = await fetchGoalsForItem(supabase, userId, itemId);

  if (!goals || goals.length === 0) return [];

  const results: GoalEngineResult[] = [];
  for (const goal of goals) {
    const result = await computeEngineForGoal(supabase, userId, goal as Goal);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * 为单个目标计算引擎结果
 */
export async function computeGoalEngine(
  userId: string,
  goalId: string
): Promise<GoalEngineResult | null> {
  genBehaviorId('B-042'); // computeGoalEngine 入口追踪
  genToolCallId('GOAL_ENGINE');
  const supabase = await createClient();

  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', userId)
    .maybeSingle();

  if (goalError) {
    throw new Error(`获取目标失败: ${goalError.message}`);
  }

  if (!goal) return null;

  // 草稿目标不参与计算
  if (goal.status === '草稿') return null;

  return computeEngineForGoal(supabase, userId, goal as Goal);
}

// 保持旧函数名兼容
export { computeGoalEngineForItem as computeRepeatGoalEngineForItem };

// ============================================
// 核心分流：按 rule_type 计算单个目标
// ============================================

async function computeEngineForGoal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: Goal
): Promise<GoalEngineResult | null> {
  if (!goal.item_id) return null;

  const ruleType = goal.rule_type;
  const computationId = `GC-${Date.now()}-${goal.id.slice(-8)}`;

  let result: GoalEngineResult | null = null;
  switch (ruleType) {
    case '一次性完成':
      result = await computeOneTimeEngine(supabase, userId, goal);
      break;
    case '周期性达成':
      result = await computePeriodicAchieveEngine(supabase, userId, goal);
      break;
    case '周期性限制':
      result = await computePeriodicLimitEngine(supabase, userId, goal);
      break;
    default:
      return null;
  }

  if (result) {
    result.computation_id = computationId;
    result.explain = buildGoalExplain(result);
  }

  return result;
}

// ============================================
// 子引擎 1：一次性完成
// ============================================

async function computeOneTimeEngine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: Goal
): Promise<GoalEngineResult | null> {
  if (!goal.item_id) return null;
  if (!goal.start_date) return null;

  const today = todayStr();
  const totalPassedDays = Math.max(1, daysBetween(goal.start_date, today) + 1);
  const matchFilters = buildMetricFilter(goal);
  const subItemId = goal.sub_item_id || undefined;

  const sevenDaysAgo = daysAgoStr(6);
  const thirtyDaysAgo = daysAgoStr(29);

  const operator = goal.operator || '>=';
  const targetMin = goal.target_min ?? goal.target_value ?? 0;
  const unit = goal.unit || '?';

  // complete 操作符：布尔判定型
  if (operator === 'complete') {
    const currentVal = goal.current_value ?? 0;
    const isCompleted = currentVal >= (goal.target_min ?? 1);

    return {
      goal_id: goal.id,
      goal_title: goal.title,
      rule_type: '一次性完成',
      unit,
      start_date: goal.start_date,
      total_passed_days: totalPassedDays,
      remaining_days: goal.deadline ? Math.max(0, daysBetween(today, goal.deadline)) : null,
      current_period_start: null,
      current_period_end: null,
      current_period_actual: currentVal,
      current_period_target: goal.target_min ?? 1,
      current_period_progress: isCompleted ? 1 : 0,
      today_actual: 0,
      total_actual: currentVal,
      total_target: goal.target_min ?? null,
      total_expected: null,
      deficit: null,
      completion_rate: isCompleted ? 1 : (goal.target_min ? currentVal / goal.target_min : 0),
      completion_rate_7d: null,
      completion_rate_30d: null,
      daily_average: null,
      avg_7d: null,
      avg_30d: null,
      deficit_7d: null,
      deficit_30d: null,
      dynamic_daily_pacer: null,
      is_over_limit: null,
      remaining_budget: null,
      projected_period_total: null,
      weekly_target: null,
      monthly_target: null,
      weekly_projection: null,
      monthly_projection: null,
    };
  }

  // >= / between 操作符：累计量化型
  const windowedSums = await sumMetricValuesBatched(
    supabase, userId, goal.item_id, matchFilters, subItemId,
    goal.start_date, today, sevenDaysAgo, thirtyDaysAgo
  );

  const totalActual = windowedSums.total;
  const todayActual = windowedSums.today;
  let sum7d = windowedSums.s7d;
  let sum30d = windowedSums.s30d;

  // metric 求和为 0 时，根据 unit 类型选择回退策略
  // 时长类目标（分钟/小时）：回退到 duration_minutes 求和
  // 其他目标：回退到记录计数
  const useDurationFallback = isDurationUnit(unit);
  let actualTotal = totalActual;
  if (actualTotal === 0 && goal.metric_name) {
    if (useDurationFallback) {
      const durTotal = await sumDurationInPeriod(supabase, userId, goal.item_id, subItemId, goal.start_date, today);
      if (durTotal > 0) actualTotal = durTotal;
    } else {
      const cntTotal = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, goal.start_date, today);
      if (cntTotal > 0) actualTotal = cntTotal;
    }
  }
  if (sum7d === 0 && goal.metric_name) {
    if (useDurationFallback) {
      const dur7d = await sumDurationInPeriod(supabase, userId, goal.item_id, subItemId, sevenDaysAgo, today);
      if (dur7d > 0) sum7d = dur7d;
    } else {
      const cnt7d = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, sevenDaysAgo, today);
      if (cnt7d > 0) sum7d = cnt7d;
    }
  }
  if (sum30d === 0 && goal.metric_name) {
    if (useDurationFallback) {
      const dur30d = await sumDurationInPeriod(supabase, userId, goal.item_id, subItemId, thirtyDaysAgo, today);
      if (dur30d > 0) sum30d = dur30d;
    } else {
      const cnt30d = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, thirtyDaysAgo, today);
      if (cnt30d > 0) sum30d = cnt30d;
    }
  }

  const daysFor7d = Math.min(7, totalPassedDays);
  const daysFor30d = Math.min(30, totalPassedDays);
  const avg7d = daysFor7d > 0 ? sum7d / daysFor7d : 0;
  const avg30d = daysFor30d > 0 ? sum30d / daysFor30d : 0;
  const dailyAverage = actualTotal / totalPassedDays;

  const totalTarget = targetMin;
  const completionRate = totalTarget > 0 ? actualTotal / totalTarget : 0;
  const deficit = totalTarget > 0 ? actualTotal - totalTarget : null;

  // 7d/30d 窗口差额与完成度
  const expected7d = dailyAverage * daysFor7d;
  const expected30d = dailyAverage * daysFor30d;
  const deficit7d = expected7d > 0 ? sum7d - expected7d : null;
  const deficit30d = expected30d > 0 ? sum30d - expected30d : null;
  const completionRate7d = expected7d > 0 ? sum7d / expected7d : null;
  const completionRate30d = expected30d > 0 ? sum30d / expected30d : null;

  // 配速器
  let remainingDays: number | null = null;
  let dynamicDailyPacer: number | null = null;

  if (goal.deadline) {
    remainingDays = Math.max(0, daysBetween(today, goal.deadline));
    if (totalTarget !== null && remainingDays > 0) {
      dynamicDailyPacer = Math.max(0, (totalTarget - actualTotal) / remainingDays);
    }
  }

  return {
    goal_id: goal.id,
    goal_title: goal.title,
    rule_type: '一次性完成',
    unit,
    start_date: goal.start_date,
    total_passed_days: totalPassedDays,
    remaining_days: remainingDays,
    current_period_start: null,
    current_period_end: null,
    current_period_actual: 0,
    current_period_target: 0,
    current_period_progress: 0,
    today_actual: todayActual,
    total_actual: actualTotal,
    total_target: totalTarget,
    total_expected: null,
    deficit,
    completion_rate: completionRate,
    completion_rate_7d: completionRate7d,
    completion_rate_30d: completionRate30d,
    daily_average: actualTotal > 0 ? dailyAverage : null,
    avg_7d: avg7d,
    avg_30d: avg30d,
    deficit_7d: deficit7d,
    deficit_30d: deficit30d,
    dynamic_daily_pacer: dynamicDailyPacer,
    is_over_limit: null,
    remaining_budget: null,
    projected_period_total: null,
    weekly_target: null,
    monthly_target: null,
    weekly_projection: null,
    monthly_projection: null,
  };
}

// ============================================
// 子引擎 2：周期性达成
// ============================================

async function computePeriodicAchieveEngine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: Goal
): Promise<GoalEngineResult | null> {
  if (!goal.item_id) return null;

  const period = goal.period || '每天';
  const today = todayStr();
  const targetMin = goal.target_min ?? goal.target_value ?? 0;
  const unit = goal.unit || '次';
  const matchFilters = buildMetricFilter(goal);
  const subItemId = goal.sub_item_id || undefined;

  // 当前周期起止
  const { periodStart, periodEnd } = computeCurrentPeriod(period, today);

  // 计算当前周期实际值
  let currentPeriodActual: number;

  if (goal.metric_name) {
    // 有 metric_name 时：求周期内 metric_value 之和
    const result = await sumMetricValuesInPeriod(
      supabase, userId, goal.item_id, matchFilters, subItemId,
      periodStart, periodEnd
    );
    currentPeriodActual = result;

    // metric 求和为 0 时，尝试回退到 duration_minutes（处理时长类目标但记录用 duration 而非 metric 的情况）
    if (currentPeriodActual === 0 && isDurationUnit(unit)) {
      const durationSum = await sumDurationInPeriod(
        supabase, userId, goal.item_id, subItemId, periodStart, periodEnd
      );
      if (durationSum > 0) currentPeriodActual = durationSum;
    }
  } else {
    // 无 metric_name 时：求周期内记录条数
    currentPeriodActual = await countRecordsInPeriod(
      supabase, userId, goal.item_id, subItemId, periodStart, periodEnd
    );
  }

  // 累计维度（如果 start_date 存在）
  const totalPassedDays = goal.start_date ? Math.max(1, daysBetween(goal.start_date, today) + 1) : 0;
  const sevenDaysAgo = daysAgoStr(6);
  const thirtyDaysAgo = daysAgoStr(29);

  let totalActual = 0;
  let todayActual = 0;
  let avg7d = 0;
  let avg30d = 0;
  let dailyAverage = 0;
  let completionRate: number | null = null;
  let deficit: number | null = null;
  let totalExpected: number | null = null;
  let deficit7d: number | null = null;
  let deficit30d: number | null = null;
  let completionRate7d: number | null = null;
  let completionRate30d: number | null = null;
  let weeklyTarget: number | null = null;
  let monthlyTarget: number | null = null;
  let weeklyProjection: number | null = null;
  let monthlyProjection: number | null = null;

  // 7d/30d 窗口指标（不依赖 start_date）
  const periodDays = getPeriodDays(period);
  const daysFor7d = 7;
  const daysFor30d = 30;

  if (goal.metric_name) {
    // 有 metric_name：用 metric 求和计算窗口指标
    const effectiveStart = goal.start_date || thirtyDaysAgo;
    const windowedSums = await sumMetricValuesBatched(
      supabase, userId, goal.item_id, matchFilters, subItemId,
      effectiveStart, today, sevenDaysAgo, thirtyDaysAgo
    );

    totalActual = windowedSums.total;
    todayActual = windowedSums.today;

    // metric 求和为 0 时，根据 unit 类型选择回退策略
    // 时长类目标（分钟/小时）：回退到 duration_minutes 求和（语义一致）
    // 其他目标：回退到记录计数
    const useDurationFallback = isDurationUnit(unit);

    if (totalActual === 0) {
      if (useDurationFallback) {
        const durTotal = await sumDurationBatched(supabase, userId, goal.item_id, subItemId, effectiveStart, today, sevenDaysAgo, thirtyDaysAgo);
        if (durTotal.total > 0) { totalActual = durTotal.total; todayActual = durTotal.today; }
      } else {
        const cntTotal = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, effectiveStart, today);
        if (cntTotal > 0) totalActual = cntTotal;
      }
    }

    let s7d = windowedSums.s7d;
    let s30d = windowedSums.s30d;
    if (s7d === 0) {
      if (useDurationFallback) {
        const dur7d = await sumDurationInPeriod(supabase, userId, goal.item_id, subItemId, sevenDaysAgo, today);
        if (dur7d > 0) s7d = dur7d;
      } else {
        const cnt7d = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, sevenDaysAgo, today);
        if (cnt7d > 0) s7d = cnt7d;
      }
    }
    if (s30d === 0) {
      if (useDurationFallback) {
        const dur30d = await sumDurationInPeriod(supabase, userId, goal.item_id, subItemId, thirtyDaysAgo, today);
        if (dur30d > 0) s30d = dur30d;
      } else {
        const cnt30d = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, thirtyDaysAgo, today);
        if (cnt30d > 0) s30d = cnt30d;
      }
    }

    avg7d = s7d / daysFor7d;
    avg30d = s30d / daysFor30d;

    if (goal.start_date) {
      // 有 start_date：可计算总维度（日均、总差额、总完成度）
      dailyAverage = totalActual / totalPassedDays;
      totalExpected = totalPassedDays * targetMin;
      deficit = totalActual - totalExpected;
      completionRate = totalExpected > 0 ? totalActual / totalExpected : null;

      // 7d/30d 窗口差额基于日均期望
      const expected7d = dailyAverage * daysFor7d;
      const expected30d = dailyAverage * daysFor30d;
      deficit7d = expected7d > 0 ? s7d - expected7d : null;
      deficit30d = expected30d > 0 ? s30d - expected30d : null;
      completionRate7d = expected7d > 0 ? s7d / expected7d : null;
      completionRate30d = expected7d > 0 ? s30d / expected30d : null;

      weeklyProjection = dailyAverage * 7;
      monthlyProjection = dailyAverage * 30;
    } else {
      // 无 start_date：用周期目标作为期望基准
      const expected7d = targetMin * (7 / periodDays);
      const expected30d = targetMin * (30 / periodDays);
      deficit7d = s7d - expected7d;
      deficit30d = s30d - expected30d;
      completionRate7d = expected7d > 0 ? s7d / expected7d : null;
      completionRate30d = expected7d > 0 ? s30d / expected30d : null;

      weeklyProjection = avg7d * 7;
      monthlyProjection = avg30d * 30;

      // 即使无 start_date，也计算总维度（用 effectiveStart 作为起始日期）
      const effectiveTotalDays = Math.max(1, daysBetween(effectiveStart, today) + 1);
      dailyAverage = totalActual / effectiveTotalDays;
      totalExpected = effectiveTotalDays * targetMin;
      deficit = totalActual - totalExpected;
      completionRate = totalExpected > 0 ? totalActual / totalExpected : null;
    }

    weeklyTarget = targetMin * (7 / periodDays);
    monthlyTarget = targetMin * (30 / periodDays);
  } else if (goal.start_date) {
    // 无 metric_name 但有 start_date：用计数
    const count7d = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, sevenDaysAgo, today);
    const count30d = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, thirtyDaysAgo, today);

    avg7d = count7d / daysFor7d;
    avg30d = count30d / daysFor30d;

    const countTotal = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, goal.start_date, today);
    totalActual = countTotal;
    dailyAverage = countTotal / totalPassedDays;

    // 总维度指标
    totalExpected = totalPassedDays * targetMin;
    deficit = totalActual - totalExpected;
    completionRate = totalExpected > 0 ? totalActual / totalExpected : null;

    // 7d/30d 窗口指标
    const expected7d = targetMin * (7 / periodDays);
    const expected30d = targetMin * (30 / periodDays);
    deficit7d = count7d - expected7d;
    deficit30d = count30d - expected30d;
    completionRate7d = expected7d > 0 ? count7d / expected7d : null;
    completionRate30d = expected7d > 0 ? count30d / expected30d : null;
    weeklyTarget = expected7d;
    monthlyTarget = expected30d;
  } else {
    // 无 metric_name 也无 start_date：用计数计算窗口指标
    const count7d = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, sevenDaysAgo, today);
    const count30d = await countRecordsInPeriod(supabase, userId, goal.item_id, subItemId, thirtyDaysAgo, today);

    avg7d = count7d / daysFor7d;
    avg30d = count30d / daysFor30d;

    const expected7d = targetMin * (7 / periodDays);
    const expected30d = targetMin * (30 / periodDays);
    deficit7d = count7d - expected7d;
    deficit30d = count30d - expected30d;
    completionRate7d = expected7d > 0 ? count7d / expected7d : null;
    completionRate30d = expected30d > 0 ? count30d / expected30d : null;

    weeklyTarget = targetMin * (7 / periodDays);
    monthlyTarget = targetMin * (30 / periodDays);

    // 即使无 metric_name 也无 start_date，也用 30d 窗口计算总维度
    totalActual = count30d;
    dailyAverage = avg30d;
    totalExpected = 30 * targetMin;
    deficit = count30d - totalExpected;
    completionRate = totalExpected > 0 ? count30d / totalExpected : null;
  }

  // 注意：不再对 currentPeriodActual 回退到记录计数
  // 原回退逻辑将 1 条记录 vs 30 分钟目标 → 3% 完成度，语义不一致
  // 时长类目标的回退已在上方通过 sumDurationInPeriod 处理

  const currentPeriodProgress = targetMin > 0 ? Math.min(currentPeriodActual / targetMin, 1) : 0;

  return {
    goal_id: goal.id,
    goal_title: goal.title,
    rule_type: '周期性达成',
    unit,
    start_date: goal.start_date,
    total_passed_days: totalPassedDays || 0,
    remaining_days: goal.deadline ? Math.max(0, daysBetween(today, goal.deadline)) : null,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    current_period_actual: currentPeriodActual,
    current_period_target: targetMin,
    current_period_progress: currentPeriodProgress,
    today_actual: todayActual,
    total_actual: totalActual,
    total_target: goal.target_value ?? targetMin,
    total_expected: totalExpected,
    deficit,
    completion_rate: completionRate,
    completion_rate_7d: completionRate7d,
    completion_rate_30d: completionRate30d,
    daily_average: totalActual > 0 ? dailyAverage : null,
    avg_7d: avg7d,
    avg_30d: avg30d,
    deficit_7d: deficit7d,
    deficit_30d: deficit30d,
    dynamic_daily_pacer: null,
    is_over_limit: null,
    remaining_budget: null,
    projected_period_total: null,
    weekly_target: weeklyTarget,
    monthly_target: monthlyTarget,
    weekly_projection: weeklyProjection,
    monthly_projection: monthlyProjection,
  };
}

// ============================================
// 子引擎 3：周期性限制（全新）
// ============================================

async function computePeriodicLimitEngine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: Goal
): Promise<GoalEngineResult | null> {
  if (!goal.item_id) return null;

  const period = goal.period || '每天';
  const today = todayStr();
  const targetMax = goal.target_max ?? 0;
  const targetMin = goal.target_min ?? 0;
  const unit = goal.unit || '?';
  const matchFilters = buildMetricFilter(goal);
  const subItemId = goal.sub_item_id || undefined;

  // 当前周期起止
  const { periodStart, periodEnd } = computeCurrentPeriod(period, today);

  // 计算当前周期实际值
  let currentPeriodActual: number;

  if (goal.metric_name) {
    currentPeriodActual = await sumMetricValuesInPeriod(
      supabase, userId, goal.item_id, matchFilters, subItemId,
      periodStart, today  // 注意：限制型只统计到今天，不统计到周期结束
    );

    // metric 求和为 0 时，优先回退到 duration_minutes（时长类目标）
    if (currentPeriodActual === 0 && isDurationUnit(unit)) {
      const durationSum = await sumDurationInPeriod(
        supabase, userId, goal.item_id, subItemId, periodStart, today
      );
      if (durationSum > 0) currentPeriodActual = durationSum;
    }
  } else {
    currentPeriodActual = await countRecordsInPeriod(
      supabase, userId, goal.item_id, subItemId, periodStart, today
    );
  }

  // 超限检测
  const isOverLimit = currentPeriodActual > targetMax;
  const remainingBudget = targetMax - currentPeriodActual;

  // 预计本期总量（基于日均推算）
  const periodDays = getPeriodDays(period);
  const daysElapsedInPeriod = Math.max(1, daysBetween(periodStart, today) + 1);
  const dailyAverage = currentPeriodActual / daysElapsedInPeriod;
  const remainingDaysInPeriod = Math.max(0, daysBetween(today, periodEnd));
  const projectedPeriodTotal = dailyAverage * remainingDaysInPeriod + currentPeriodActual;

  // 进度：限制型进度 = actual / max，但 >= 1 表示超限
  const currentPeriodProgress = targetMax > 0 ? currentPeriodActual / targetMax : 0;

  // 累计维度
  const totalPassedDays = goal.start_date ? Math.max(1, daysBetween(goal.start_date, today) + 1) : 0;

  return {
    goal_id: goal.id,
    goal_title: goal.title,
    rule_type: '周期性限制',
    unit,
    start_date: goal.start_date,
    total_passed_days: totalPassedDays || 0,
    remaining_days: goal.deadline ? Math.max(0, daysBetween(today, goal.deadline)) : null,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    current_period_actual: currentPeriodActual,
    current_period_target: targetMax,
    current_period_progress: Math.min(currentPeriodProgress, 1),
    today_actual: 0,
    total_actual: currentPeriodActual,
    total_target: targetMax,
    total_expected: null,
    deficit: null,
    completion_rate: null,
    completion_rate_7d: null,
    completion_rate_30d: null,
    daily_average: dailyAverage,
    avg_7d: null,
    avg_30d: null,
    deficit_7d: null,
    deficit_30d: null,
    dynamic_daily_pacer: null,
    is_over_limit: isOverLimit,
    remaining_budget: remainingBudget,
    projected_period_total: projectedPeriodTotal,
    weekly_target: null,
    monthly_target: null,
    weekly_projection: null,
    monthly_projection: null,
  };
}

// ============================================
// 辅助：周期内 metric_value 求和
// ============================================

async function sumMetricValuesInPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
  filters: MetricFilter,
  subItemId: string | undefined,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const buildQuery = () => {
    let q = buildStatsQuery(supabase, userId, CORE_METRICS.goal_progress, {
      selectFields: 'metric_value, record_days!inner(date)',
      itemId,
      subItemId: subItemId || undefined,
    })
      .not('metric_value', 'is', null)
      .gte('record_days.date', dateFrom)
      .lte('record_days.date', dateTo);

    if (filters.metric_name && filters.unit) {
      q = q.eq('metric_name', filters.metric_name).eq('metric_unit', filters.unit);
    } else if (filters.metric_name) {
      q = q.eq('metric_name', filters.metric_name);
    } else if (filters.unit) {
      q = q.eq('metric_unit', filters.unit);
    }
    return q;
  };

  const PAGE_SIZE = 1000;
  const allData: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`查询记录指标失败: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (allData.length === 0) return 0;

  return allData.reduce((sum: number, row: any) => {
    return sum + (Number(row.metric_value) || 0);
  }, 0);
}
