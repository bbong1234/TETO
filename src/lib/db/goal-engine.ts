import { createClient } from '@/lib/supabase/server';
import type { Goal, GoalEngineResult } from '@/types/teto';

/**
 * 量化目标引擎 — 核心计算函数
 *
 * 数据流：Goal 配置（标尺） + Records 流水（事实） → 碰撞运算 → GoalEngineResult
 *
 * 防串库逻辑：
 *   同一事项下可能有多种维度的记录（如 单词=40个, 听读=30分）。
 *   引擎通过 goal.metric_name 和 goal.unit 精准匹配 records，
 *   确保不同目标的数据池完全隔离。
 */

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

  // 获取事项下所有目标
  const { data: goals, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取事项目标列表失败: ${error.message}`);
  }

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
  const totalPassedDays = Math.max(1, daysBetween(goal.start_date, today) + 1); // +1 包含起算日当天

  // 构建防串库过滤条件
  const matchFilters = buildMetricFilter(goal);

  // ── 查询 1: start_date 起全部记录的 metric_value 总和 ──
  const totalActual = await sumMetricValues(
    supabase, userId, goal.item_id, matchFilters, goal.start_date
  );

  // ── 查询 2: 今日记录的 metric_value 总和 ──
  const todayActual = await sumMetricValues(
    supabase, userId, goal.item_id, matchFilters, today, today
  );

  // ── 查询 3: 近7天日均 ──
  const sevenDaysAgo = daysAgoStr(6); // 含今天共7天
  const sum7d = await sumMetricValues(
    supabase, userId, goal.item_id, matchFilters, sevenDaysAgo, today
  );
  const avg7d = sum7d / 7;

  // ── 查询 4: 近30天日均 ──
  const thirtyDaysAgo = daysAgoStr(29); // 含今天共30天
  const sum30d = await sumMetricValues(
    supabase, userId, goal.item_id, matchFilters, thirtyDaysAgo, today
  );
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
}

/**
 * 从 Goal 的 metric_name 和 unit 构建过滤条件。
 * 优先用 metric_name 精准匹配，unit 作为备选。
 */
function buildMetricFilter(goal: Goal): MetricFilter {
  return {
    metric_name: goal.metric_name || undefined,
    unit: goal.unit || undefined,
  };
}

/**
 * 按条件求和 records.metric_value
 *
 * 防串库核心查询：
 *   records WHERE item_id = ? AND metric_value IS NOT NULL
 *     AND (metric_name = goal.metric_name OR metric_unit = goal.unit)
 *
 * @param dateFrom 起始日期（可选，含当日）
 * @param dateTo   结束日期（可选，含当日）
 */
async function sumMetricValues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
  filters: MetricFilter,
  dateFrom?: string,
  dateTo?: string,
): Promise<number> {
  // 如果需要按日期过滤，先获取对应的 record_day IDs
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

  // 构建主查询
  let q = supabase
    .from('records')
    .select('metric_value')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .not('metric_value', 'is', null);

  // 日期过滤
  if (dayIds) {
    q = q.in('record_day_id', dayIds);
  }

  // 防串库过滤：metric_name 和 metric_unit 同时匹配（AND）
  if (filters.metric_name && filters.unit) {
    q = q.eq('metric_name', filters.metric_name).eq('metric_unit', filters.unit);
  } else if (filters.metric_name) {
    q = q.eq('metric_name', filters.metric_name);
  } else if (filters.unit) {
    q = q.eq('metric_unit', filters.unit);
  }
  // 如果 metric_name 和 unit 都没设置，则不过滤（兜底：统计该事项下所有带数值的记录）

  const { data, error } = await q.limit(10000);

  if (error) {
    throw new Error(`查询记录指标失败: ${error.message}`);
  }

  if (!data || data.length === 0) return 0;

  // 手动求和（Supabase JS SDK 不支持 SUM 聚合）
  return data.reduce((sum: number, row: { metric_value: number | null }) => {
    return sum + (Number(row.metric_value) || 0);
  }, 0);
}
