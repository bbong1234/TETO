import { createClient } from '@/lib/supabase/server';
import type { Goal, GoalEngineResult, RepeatGoalEngineResult } from '@/types/teto';

/**
 * 量化目标引擎 — 核心计算函数
 *
 * 数据流：Goal 配置（标尺） + Records 流水（事实） → 碰撞运算 → GoalEngineResult
 *
 * 防串库逻辑（1.4 升级）：
 *   优先通过 goal.sub_item_id 过滤记录（精准指向子项行动线），
 *   metric_name + unit 作为辅助校验（双重匹配防串库）。
 *   当 sub_item_id 为空时，回退到纯 metric_name 匹配。
 */

// ============================================
// 辅助：获取事项下所有目标（1.5 新模型：goals.item_id → items.id）
// ============================================

/**
 * 获取事项关联的所有目标
 * 1.5 移除旧模型兼容（items.goal_id 已废弃），仅通过 goals.item_id 查询
 */
async function fetchGoalsForItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string
): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('item_id', itemId);

  if (error) {
    throw new Error(`获取事项目标列表失败: ${error.message}`);
  }

  return (data || []) as Goal[];
}

// ============================================
// 辅助：日期差值计算
// ============================================

/** 计算两个日期之间的天数差（忽略时区，纯日期运算） */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z');
  const b = new Date(dateB + 'T00:00:00Z');
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** 获取今天的日期字符串 YYYY-MM-DD */
function todayStr(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

/** N 天前的日期字符串 */
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ============================================
// 核心引擎：单个目标
// ============================================

/**
 * 为单个 Goal 计算引擎结果
 * @param userId 用户ID
 * @param goalId 目标ID
 * @returns GoalEngineResult 或 null（目标不存在/非量化型/缺配置）
 */
export async function computeGoalEngine(
  userId: string,
  goalId: string
): Promise<GoalEngineResult | null> {
  const supabase = await createClient();

  // 1. 获取 Goal 配置
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

  return computeEngineForGoal(supabase, userId, goal as Goal);
}

/**
 * 为事项下所有量化目标批量计算引擎结果
 * @param userId 用户ID
 * @param itemId 事项ID
 * @returns GoalEngineResult 数组（仅包含可计算的量化目标）
 */
export async function computeGoalEngineForItem(
  userId: string,
  itemId: string
): Promise<GoalEngineResult[]> {
  const supabase = await createClient();

  // 获取事项下所有目标（1.5 新模型：goals.item_id）
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
 * 为事项下所有重复型目标批量计算引擎结果
 * @param userId 用户ID
 * @param itemId 事项ID
 * @returns RepeatGoalEngineResult 数组（仅包含可计算的重复型目标）
 */
export async function computeRepeatGoalEngineForItem(
  userId: string,
  itemId: string
): Promise<RepeatGoalEngineResult[]> {
  const supabase = await createClient();

  // 获取事项下所有重复型目标
  const allGoals = await fetchGoalsForItem(supabase, userId, itemId);
  const goals = (allGoals || []).filter((g: any) => g.measure_type === 'repeat');

  if (!goals || goals.length === 0) return [];

  const results: RepeatGoalEngineResult[] = [];
  for (const goal of goals) {
    const result = await computeRepeatGoalEngine(userId, goal.id);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

// ============================================
// 内部计算核心
// ============================================

async function computeEngineForGoal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: Goal
): Promise<GoalEngineResult | null> {
  // 前置校验：必须是量化型且有日均期望和起算日
  if (goal.measure_type !== 'numeric') return null;
  if (!goal.daily_target || !goal.start_date) return null;
  if (!goal.item_id) return null;

  const today = todayStr();
  const totalPassedDays = Math.max(1, daysBetween(goal.start_date, today) + 1);
  const matchFilters = buildMetricFilter(goal);
  const subItemId = goal.sub_item_id || undefined;

  // 批量获取所有所需日期的 metric_value：一次 day 查询 + 一次 records 查询
  const sevenDaysAgo = daysAgoStr(6);
  const thirtyDaysAgo = daysAgoStr(29);

  const windowedSums = await sumMetricValuesBatched(
    supabase, userId, goal.item_id, matchFilters, subItemId,
    goal.start_date, today, sevenDaysAgo, thirtyDaysAgo
  );

  const totalActual = windowedSums.total;
  const todayActual = windowedSums.today;
  const sum7d = windowedSums.s7d;
  const sum30d = windowedSums.s30d;
  const avg7d = sum7d / 7;
  const avg30d = sum30d / 30;

  // ── 计算各项指标 ──
  const dailyTarget = Number(goal.daily_target);
  const totalExpected = totalPassedDays * dailyTarget;
  const deficit = totalActual - totalExpected;
  const completionRate = totalExpected > 0 ? totalActual / totalExpected : 0;
  const dailyAverage = totalActual / totalPassedDays;

  // 配速器
  let remainingDays: number | null = null;
  let dynamicDailyPacer: number | null = null;
  const totalTarget = goal.target_value ? Number(goal.target_value) : null;

  if (goal.deadline_date) {
    remainingDays = Math.max(0, daysBetween(today, goal.deadline_date));
    if (totalTarget !== null && remainingDays > 0) {
      dynamicDailyPacer = Math.max(0, (totalTarget - totalActual) / remainingDays);
    }
  }

  return {
    goal_id: goal.id,
    goal_title: goal.title,
    unit: goal.unit || '?',
    daily_target: dailyTarget,
    start_date: goal.start_date,

    total_passed_days: totalPassedDays,
    remaining_days: remainingDays,

    today_actual: todayActual,

    total_expected: totalExpected,
    total_actual: totalActual,
    deficit,

    completion_rate: completionRate,

    daily_average: dailyAverage,
    avg_7d: avg7d,
    avg_30d: avg30d,

    total_target: totalTarget,
    dynamic_daily_pacer: dynamicDailyPacer,

    weekly_target: dailyTarget * 7,
    monthly_target: dailyTarget * 30,
    weekly_projection: dailyAverage * 7,
    monthly_projection: dailyAverage * 30,
  };
}

// ============================================
// 防串库：构建 metric 过滤条件
// ============================================

interface MetricFilter {
  metric_name?: string;
  unit?: string;
  sub_item_id?: string;
}

/**
 * 从 Goal 的 sub_item_id、metric_name 和 unit 构建过滤条件。
 * 优先用 sub_item_id 精准匹配，metric_name + unit 作为辅助校验。
 */
function buildMetricFilter(goal: Goal): MetricFilter {
  return {
    sub_item_id: goal.sub_item_id || undefined,
    metric_name: goal.metric_name || undefined,
    unit: goal.unit || undefined,
  };
}

interface SumResult {
  total: number;
  today: number;
  s7d: number;
  s30d: number;
}

const SUM_LIMIT = 50000;

/**
 * 批量获取多个时间窗口的 metric_value 总和（合并为 2 次 DB 查询）
 *
 * @param dateTotal 全部累计的起始日期
 * @param dateToday 今日日期
 * @param date7d    近7天起始日期
 * @param date30d   近30天起始日期
 */
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
  // 一次查询获取所有需要的 record_day IDs（从最早日期到今天）
  const { data: dayData } = await supabase
    .from('record_days')
    .select('id, date')
    .eq('user_id', userId)
    .gte('date', dateTotal)
    .lte('date', dateToday);

  if (!dayData || dayData.length === 0) {
    return { total: 0, today: 0, s7d: 0, s30d: 0 };
  }

  const dayMap = new Map(dayData.map((d: { id: string; date: string }) => [d.id, d.date]));
  const allDayIds = Array.from(dayMap.keys());

  // 一次查询获取所有匹配记录
  let q = supabase
    .from('records')
    .select('metric_value, record_day_id')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .not('metric_value', 'is', null)
    .in('record_day_id', allDayIds);

  // 优先按 sub_item_id 过滤
  if (subItemId) {
    q = q.eq('sub_item_id', subItemId);
  }
  // 辅助校验：metric_name + unit
  if (filters.metric_name && filters.unit) {
    q = q.eq('metric_name', filters.metric_name).eq('metric_unit', filters.unit);
  } else if (filters.metric_name) {
    q = q.eq('metric_name', filters.metric_name);
  } else if (filters.unit) {
    q = q.eq('metric_unit', filters.unit);
  }

  const { data, error } = await q.limit(SUM_LIMIT);

  if (error) {
    throw new Error(`查询记录指标失败: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { total: 0, today: 0, s7d: 0, s30d: 0 };
  }

  // 在 JS 中按窗口分组合并求和
  let total = 0, today = 0, s7d = 0, s30d = 0;
  for (const row of (data as Array<{ metric_value: number | null; record_day_id: string }>)) {
    const val = Number(row.metric_value) || 0;
    const date = dayMap.get(row.record_day_id);
    if (!date) { total += val; continue; }

    total += val;
    if (date === dateToday) today += val;
    if (date >= date7d) s7d += val;
    if (date >= date30d) s30d += val;
  }

  return { total, today, s7d, s30d };
}

/**
 * 按条件求和 records.metric_value（保留原函数用于非批量场景）
 */
async function sumMetricValues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
  filters: MetricFilter,
  dateFrom?: string,
  dateTo?: string,
): Promise<number> {
  let dayIds: string[] | null = null;
  if (dateFrom || dateTo) {
    let dayQuery = supabase
      .from('record_days')
      .select('id')
      .eq('user_id', userId);

    if (dateFrom) dayQuery = dayQuery.gte('date', dateFrom);
    if (dateTo) dayQuery = dayQuery.lte('date', dateTo);

    const { data: dayData } = await dayQuery;
    if (!dayData || dayData.length === 0) return 0;
    dayIds = dayData.map((d: { id: string }) => d.id);
  }

  let q = supabase
    .from('records')
    .select('metric_value')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .not('metric_value', 'is', null);

  if (dayIds) {
    q = q.in('record_day_id', dayIds);
  }

  if (filters.metric_name && filters.unit) {
    q = q.eq('metric_name', filters.metric_name).eq('metric_unit', filters.unit);
  } else if (filters.metric_name) {
    q = q.eq('metric_name', filters.metric_name);
  } else if (filters.unit) {
    q = q.eq('metric_unit', filters.unit);
  }

  const { data, error } = await q.limit(SUM_LIMIT);

  if (error) {
    throw new Error(`查询记录指标失败: ${error.message}`);
  }

  if (!data || data.length === 0) return 0;

  return data.reduce((sum: number, row: { metric_value: number | null }) => {
    return sum + (Number(row.metric_value) || 0);
  }, 0);
}

// ============================================
// 重复型目标引擎
// ============================================

/**
 * 为重复型目标计算引擎结果
 * 统计当前周期内（日/周/月）的完成次数
 */
export async function computeRepeatGoalEngine(
  userId: string,
  goalId: string
): Promise<RepeatGoalEngineResult | null> {
  const supabase = await createClient();

  // 获取 Goal 配置
  const { data: goal, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !goal) return null;

  const g = goal as Goal;
  if (g.measure_type !== 'repeat') return null;
  if (!g.repeat_frequency || !g.repeat_count) return null;
  if (!g.item_id) return null;

  const today = todayStr();

  // 计算当前周期的起止日期
  const { periodStart, periodEnd } = computeCurrentPeriod(g.repeat_frequency, today);

  // 查询当前周期内该子项/事项下的记录数
  const { data: dayData } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', periodStart)
    .lte('date', periodEnd);

  let currentPeriodActual = 0;
  if (dayData && dayData.length > 0) {
    const dayIds = dayData.map((d: { id: string }) => d.id);
    let q = supabase
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('item_id', g.item_id)
      .in('record_day_id', dayIds);

    // 按子项过滤
    if (g.sub_item_id) {
      q = q.eq('sub_item_id', g.sub_item_id);
    }

    const { count } = await q;
    currentPeriodActual = count || 0;
  }

  // 查询近7天/30天的记录数
  const sevenDaysAgo = daysAgoStr(6);
  const thirtyDaysAgo = daysAgoStr(29);

  let count7d = 0;
  let count30d = 0;

  const { data: dayData7d } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', sevenDaysAgo)
    .lte('date', today);

  if (dayData7d && dayData7d.length > 0) {
    const dayIds = dayData7d.map((d: { id: string }) => d.id);
    let q = supabase
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('item_id', g.item_id)
      .in('record_day_id', dayIds);
    if (g.sub_item_id) q = q.eq('sub_item_id', g.sub_item_id);
    const { count } = await q;
    count7d = count || 0;
  }

  const { data: dayData30d } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', thirtyDaysAgo)
    .lte('date', today);

  if (dayData30d && dayData30d.length > 0) {
    const dayIds = dayData30d.map((d: { id: string }) => d.id);
    let q = supabase
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('item_id', g.item_id)
      .in('record_day_id', dayIds);
    if (g.sub_item_id) q = q.eq('sub_item_id', g.sub_item_id);
    const { count } = await q;
    count30d = count || 0;
  }

  const progress = g.repeat_count > 0 ? currentPeriodActual / g.repeat_count : 0;

  return {
    goal_id: g.id,
    goal_title: g.title,
    repeat_frequency: g.repeat_frequency as 'daily' | 'weekly' | 'monthly',
    repeat_count: g.repeat_count,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    current_period_actual: currentPeriodActual,
    current_period_progress: Math.min(progress, 1),
    count_7d: count7d,
    count_30d: count30d,
  };
}

/** 计算当前周期的起止日期 */
function computeCurrentPeriod(
  frequency: string,
  today: string
): { periodStart: string; periodEnd: string } {
  const now = new Date(today + 'T00:00:00Z');

  if (frequency === 'daily') {
    return { periodStart: today, periodEnd: today };
  }

  if (frequency === 'weekly') {
    // 本周起止（周一到周日）
    const day = now.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return {
      periodStart: monday.toISOString().slice(0, 10),
      periodEnd: sunday.toISOString().slice(0, 10),
    };
  }

  if (frequency === 'monthly') {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    return {
      periodStart: firstDay.toISOString().slice(0, 10),
      periodEnd: lastDay.toISOString().slice(0, 10),
    };
  }

  // 默认按日
  return { periodStart: today, periodEnd: today };
}
