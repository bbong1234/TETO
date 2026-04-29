import { createClient } from '@/lib/supabase/server';
import type { InsightsData, InsightsQuery, Phase } from '@/types/teto';

/**
 * 获取洞察数据
 * 返回固定 6 个指标：
 * 1. 近 7/30 天记录总数
 * 2. 按 type 分布
 * 3. 按 tag 分布
 * 4. 每日记录数趋势
 * 5. 活跃事项数 + Top 5 事项
 * 6. 超过 7 天无更新的停滞事项
 */
export async function getInsights(
  userId: string,
  query: InsightsQuery
): Promise<InsightsData> {
  const supabase = await createClient();

  const { date_from, date_to } = query;

  // ==========================================
  // 1. 近 7/30 天记录总数
  // ==========================================
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sevenDaysStr = sevenDaysAgo.toISOString().slice(0, 10);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);

  // 获取日期范围内的记录日 IDs
  const { data: dayData7d } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', sevenDaysStr);

  const { data: dayData30d } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', thirtyDaysStr);

  const dayIds7d = (dayData7d ?? []).map((d: { id: string }) => d.id);
  const dayIds30d = (dayData30d ?? []).map((d: { id: string }) => d.id);

  const { count: total7d } = dayIds7d.length > 0
    ? await supabase
        .from('records')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('record_day_id', dayIds7d)
    : { count: 0 };

  const { count: total30d } = dayIds30d.length > 0
    ? await supabase
        .from('records')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('record_day_id', dayIds30d)
    : { count: 0 };

  // ==========================================
  // 2. 按 type 分布
  // ==========================================
  const { data: daysInRange } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', date_from)
    .lte('date', date_to);

  const dayIdsInRange = (daysInRange ?? []).map((d: { id: string }) => d.id);

  let typeDistribution: { type: string; count: number }[] = [];
  if (dayIdsInRange.length > 0) {
    const { data: recordsInRange } = await supabase
      .from('records')
      .select('type')
      .eq('user_id', userId)
      .in('record_day_id', dayIdsInRange);

    const typeMap: { [key: string]: number } = {};
    for (const r of (recordsInRange ?? [])) {
      const t = r.type;
      typeMap[t] = (typeMap[t] ?? 0) + 1;
    }
    typeDistribution = Object.entries(typeMap).map(([type, count]) => ({ type, count }));
  }

  // ==========================================
  // 3. 按 tag 分布
  // ==========================================
  let tagDistribution: { tag_name: string; count: number }[] = [];
  if (dayIdsInRange.length > 0) {
    const { data: recordsInRange } = await supabase
      .from('records')
      .select('id')
      .eq('user_id', userId)
      .in('record_day_id', dayIdsInRange);

    const recordIdsInRange = (recordsInRange ?? []).map((r: { id: string }) => r.id);

    if (recordIdsInRange.length > 0) {
      const { data: recordTagsData } = await supabase
        .from('record_tags')
        .select('tag_id, tags(name)')
        .eq('user_id', userId)
        .in('record_id', recordIdsInRange);

      const tagCountMap: { [key: string]: number } = {};
      for (const rt of (recordTagsData ?? [])) {
        const tagName = (rt.tags as unknown as { name: string } | null)?.name ?? '未知';
        tagCountMap[tagName] = (tagCountMap[tagName] ?? 0) + 1;
      }
      tagDistribution = Object.entries(tagCountMap).map(([tag_name, count]) => ({ tag_name, count }));
    }
  }

  // ==========================================
  // 4. 每日记录数趋势
  // ==========================================
  let dailyCounts: { date: string; count: number }[] = [];
  if (dayIdsInRange.length > 0) {
    // 通过记录日表获取每日数量
    const { data: dayCounts } = await supabase
      .from('record_days')
      .select('date, records(count)')
      .eq('user_id', userId)
      .gte('date', date_from)
      .lte('date', date_to)
      .order('date', { ascending: true });

    dailyCounts = (dayCounts ?? []).map((d: { date: string; records: { count: number }[] }) => ({
      date: d.date,
      count: d.records?.[0]?.count ?? 0,
    }));
  }

  // ==========================================
  // 5. 活跃事项数 + Top 5 事项
  // ==========================================
  const { count: activeCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中']);

  let topItems: { id: string; title: string; record_count: number }[] = [];
  if (dayIdsInRange.length > 0) {
    const { data: recordsWithItem } = await supabase
      .from('records')
      .select('item_id, items(id, title)')
      .eq('user_id', userId)
      .in('record_day_id', dayIdsInRange)
      .not('item_id', 'is', null);

    const itemCountMap: { [key: string]: { title: string; count: number } } = {};
    for (const r of (recordsWithItem ?? [])) {
      const item = r.items as unknown as { id: string; title: string } | null;
      if (!item || !r.item_id) continue;
      if (!itemCountMap[r.item_id]) {
        itemCountMap[r.item_id] = { title: item.title, count: 0 };
      }
      itemCountMap[r.item_id].count++;
    }
    topItems = Object.entries(itemCountMap)
      .map(([id, v]) => ({ id, title: v.title, record_count: v.count }))
      .sort((a, b) => b.record_count - a.record_count)
      .slice(0, 5);
  }

  // ==========================================
  // 6. 超过 14 天无更新的停滞事项
  // ==========================================
  const { data: allItems } = await supabase
    .from('items')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中']);

  let staleItems: { id: string; title: string; last_record_at: string | null }[] = [];
  const lastRecordMap: { [itemId: string]: string } = {};

  if ((allItems ?? []).length > 0) {
    const allItemIds = (allItems ?? []).map((i: { id: string }) => i.id);
    const { data: recentRecords } = await supabase
      .from('records')
      .select('item_id, created_at')
      .eq('user_id', userId)
      .in('item_id', allItemIds)
      .order('created_at', { ascending: false });

    for (const r of (recentRecords ?? [])) {
      if (r.item_id && !lastRecordMap[r.item_id]) {
        lastRecordMap[r.item_id] = r.created_at;
      }
    }

    const fourteenDaysAgoISO = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    for (const item of (allItems ?? [])) {
      const lastRecordAt = lastRecordMap[item.id] ?? null;
      if (!lastRecordAt || lastRecordAt < fourteenDaysAgoISO) {
        staleItems.push({ id: item.id, title: item.title, last_record_at: lastRecordAt });
      }
    }
  }

  // ==========================================
  // 画像数据：活跃事项 + 范围内记录数 + 目标完成率
  // ==========================================
  type Portrait = {
    id: string;
    title: string;
    record_count: number;
    completion_rate: number | null;
    deficit: number | null;
    last_record_at: string | null;
  };

  const portraits: Portrait[] = [];

  if ((allItems ?? []).length > 0) {
    // 范围内各事项记录数
    const itemRecordCountMap: { [id: string]: number } = {};
    if (dayIdsInRange.length > 0) {
      const { data: rangeRecords } = await supabase
        .from('records')
        .select('item_id')
        .eq('user_id', userId)
        .in('record_day_id', dayIdsInRange)
        .not('item_id', 'is', null);

      for (const r of (rangeRecords ?? [])) {
        if (r.item_id) itemRecordCountMap[r.item_id] = (itemRecordCountMap[r.item_id] ?? 0) + 1;
      }
    }

    // 各事项的量化目标（进行中）
    const allItemIds = (allItems ?? []).map((i: { id: string }) => i.id);
    const { data: goalsForItems } = await supabase
      .from('goals')
      .select('item_id, daily_target, metric_name, start_date')
      .eq('user_id', userId)
      .eq('status', '进行中')
      .in('item_id', allItemIds)
      .not('daily_target', 'is', null);

    // 各事项的历史累计 metric_value（按 metric_name 分组）
    const { data: metricRecords } = await supabase
      .from('records')
      .select('item_id, metric_value, metric_name, occurred_at, created_at')
      .eq('user_id', userId)
      .in('item_id', allItemIds)
      .not('metric_value', 'is', null);

    // 构建 item → goal 映射（取第一个进行中目标）
    const itemGoalMap: { [itemId: string]: { daily_target: number; metric_name: string | null; start_date: string | null } } = {};
    for (const g of (goalsForItems ?? [])) {
      if (g.item_id && !itemGoalMap[g.item_id]) {
        itemGoalMap[g.item_id] = { daily_target: g.daily_target, metric_name: g.metric_name, start_date: g.start_date };
      }
    }

    // 构建 item → total metric_value 映射
    const itemMetricMap: { [itemId: string]: number } = {};
    for (const r of (metricRecords ?? [])) {
      if (r.item_id && r.metric_value != null) {
        itemMetricMap[r.item_id] = (itemMetricMap[r.item_id] ?? 0) + r.metric_value;
      }
    }

    const todayStr = now.toISOString().slice(0, 10);

    for (const item of (allItems ?? [])) {
      const recordCount = itemRecordCountMap[item.id] ?? 0;
      const lastRecordAt = lastRecordMap[item.id] ?? null;
      const goal = itemGoalMap[item.id];

      let completionRate: number | null = null;
      let deficit: number | null = null;

      if (goal && goal.daily_target > 0 && goal.start_date) {
        const startMs = new Date(goal.start_date).getTime();
        const todayMs = new Date(todayStr).getTime();
        const passedDays = Math.max(1, Math.floor((todayMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
        const totalExpected = passedDays * goal.daily_target;
        const totalActual = itemMetricMap[item.id] ?? 0;
        completionRate = totalExpected > 0 ? totalActual / totalExpected : null;
        deficit = totalActual - totalExpected;
      }

      portraits.push({ id: item.id, title: item.title, record_count: recordCount, completion_rate: completionRate, deficit, last_record_at: lastRecordAt });
    }

    // 按范围内记录数降序
    portraits.sort((a, b) => b.record_count - a.record_count);
  }

  // ==========================================
  // 7. 阶段洞察数据
  // ==========================================
  // 最近创建的阶段（限制5条）
  const { data: recentPhasesData } = await supabase
    .from('phases')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentPhases: Phase[] = (recentPhasesData ?? []) as Phase[];

  // 按状态分布的阶段统计
  const { data: phasesData } = await supabase
    .from('phases')
    .select('status')
    .eq('user_id', userId);

  const phaseStatusMap: { [key: string]: number } = {};
  for (const p of (phasesData ?? [])) {
    const status = p.status;
    phaseStatusMap[status] = (phaseStatusMap[status] ?? 0) + 1;
  }
  const phaseStatusDistribution = Object.entries(phaseStatusMap).map(([status, count]) => ({ status, count }));

  // 有阶段变化的事项（近期新增阶段的事项，最近30天）
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
  const { data: itemsWithPhasesData } = await supabase
    .from('phases')
    .select('item_id, items(id, title)')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgoISO);

  const itemPhaseMap: { [key: string]: { title: string; count: number } } = {};
  for (const p of (itemsWithPhasesData ?? [])) {
    const item = p.items as unknown as { id: string; title: string } | null;
    if (!item || !p.item_id) continue;
    if (!itemPhaseMap[p.item_id]) {
      itemPhaseMap[p.item_id] = { title: item.title, count: 0 };
    }
    itemPhaseMap[p.item_id].count++;
  }
  const itemsWithPhaseChanges = Object.entries(itemPhaseMap)
    .map(([item_id, v]) => ({ item_id, item_title: v.title, phase_count: v.count }))
    .sort((a, b) => b.phase_count - a.phase_count)
    .slice(0, 5);

  // ==========================================
  // 8. 目标洞察数据
  // ==========================================
  // 目标总数和按状态分布
  const { data: goalsData } = await supabase
    .from('goals')
    .select('id, status, title')
    .eq('user_id', userId);

  const goalStatusMap: { [key: string]: number } = {};
  for (const g of (goalsData ?? [])) {
    const status = g.status;
    goalStatusMap[status] = (goalStatusMap[status] ?? 0) + 1;
  }
  const goalStatusDistribution = Object.entries(goalStatusMap).map(([status, count]) => ({ status, count }));
  const totalGoals = (goalsData ?? []).length;

  // 有关联记录/事项/阶段的目标
  const goalsWithAssociations: { goal_id: string; goal_title: string; item_count: number; record_count: number }[] = [];

  if ((goalsData ?? []).length > 0) {
    const goalIds = (goalsData ?? []).map((g: { id: string }) => g.id);

    // 批量查询各目标关联的记录数
    const { data: recordsByGoal } = await supabase
      .from('records')
      .select('goal_id')
      .eq('user_id', userId)
      .in('goal_id', goalIds);

    // 1.5: items.goal_id 已移除，通过 goals.item_id 统计关联事项数
    const itemCountByGoal: { [goalId: string]: number } = {};
    for (const goal of (goalsData ?? [])) {
      // 有 item_id 的目标即关联了一个事项
      if ((goal as any).item_id) {
        itemCountByGoal[goal.id] = 1;
      } else {
        itemCountByGoal[goal.id] = 0;
      }
    }
    const recordCountByGoal: { [goalId: string]: number } = {};
    for (const rec of (recordsByGoal ?? [])) {
      if (rec.goal_id) recordCountByGoal[rec.goal_id] = (recordCountByGoal[rec.goal_id] ?? 0) + 1;
    }

    for (const goal of (goalsData ?? [])) {
      const itemCount = itemCountByGoal[goal.id] ?? 0;
      const recordCount = recordCountByGoal[goal.id] ?? 0;
      if (itemCount > 0 || recordCount > 0) {
        goalsWithAssociations.push({
          goal_id: goal.id,
          goal_title: goal.title,
          item_count: itemCount,
          record_count: recordCount,
        });
      }
    }
  }

  return {
    record_overview: {
      total_7d: total7d ?? 0,
      total_30d: total30d ?? 0,
      type_distribution: typeDistribution,
      tag_distribution: tagDistribution,
      daily_counts: dailyCounts,
    },
    item_overview: {
      active_count: activeCount ?? 0,
      top_items: topItems,
      stale_items: staleItems,
      portraits,
    },
    phaseInsights: {
      recentPhases,
      statusDistribution: phaseStatusDistribution,
      itemsWithPhaseChanges,
    },
    goalInsights: {
      totalGoals,
      statusDistribution: goalStatusDistribution,
      goalsWithAssociations: goalsWithAssociations.slice(0, 5),
    },
    time_distribution: await computeTimeDistribution(supabase, userId, dayIdsInRange),
    item_time_ranking: await computeItemTimeRanking(supabase, userId, dayIdsInRange),
    unassigned_stats: await computeUnassignedStats(supabase, userId, dayIdsInRange),
    four_axes: await computeFourAxes(supabase, userId, dayIdsInRange),
    period_comparison: await computePeriodComparison(supabase, userId),
    metrics_by_item: await computeMetricsByItem(supabase, userId, dayIdsInRange),
    inferred_stats: await computeInferredStats(supabase, userId, dayIdsInRange),
  };
}

// ==========================================
// 时间段分布：按 occurred_at 小时归类为 4 时段
// ==========================================
async function computeTimeDistribution(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<NonNullable<InsightsData['time_distribution']>> {
  const empty = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  if (dayIdsInRange.length === 0) return empty;

  const { data: records } = await supabase
    .from('records')
    .select('occurred_at')
    .eq('user_id', userId)
    .in('record_day_id', dayIdsInRange)
    .not('occurred_at', 'is', null);

  let morning = 0;    // 6-12
  let afternoon = 0;  // 12-18
  let evening = 0;    // 18-22
  let night = 0;      // 22-6

  for (const r of (records ?? [])) {
    if (!r.occurred_at) continue;
    const hour = new Date(r.occurred_at).getHours();
    if (hour >= 6 && hour < 12) morning++;
    else if (hour >= 12 && hour < 18) afternoon++;
    else if (hour >= 18 && hour < 22) evening++;
    else night++;
  }

  return { morning, afternoon, evening, night };
}

// ==========================================
// 跨事项时长对比：按 item_id 聚合 duration_minutes
// ==========================================
async function computeItemTimeRanking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<NonNullable<InsightsData['item_time_ranking']>> {
  if (dayIdsInRange.length === 0) return [];

  const { data: records } = await supabase
    .from('records')
    .select('item_id, duration_minutes, items(id, title)')
    .eq('user_id', userId)
    .in('record_day_id', dayIdsInRange)
    .not('item_id', 'is', null)
    .not('duration_minutes', 'is', null);

  // 按 item_id 聚合
  const itemMap: { [itemId: string]: { title: string; totalDuration: number; recordCount: number } } = {};
  for (const r of (records ?? [])) {
    if (!r.item_id || !r.duration_minutes) continue;
    const item = r.items as unknown as { id: string; title: string } | null;
    if (!item) continue;
    if (!itemMap[r.item_id]) {
      itemMap[r.item_id] = { title: item.title, totalDuration: 0, recordCount: 0 };
    }
    itemMap[r.item_id].totalDuration += r.duration_minutes;
    itemMap[r.item_id].recordCount++;
  }

  // 计算总时长
  const totalDuration = Object.values(itemMap).reduce((sum, v) => sum + v.totalDuration, 0);

  // 构建排名
  const ranking = Object.entries(itemMap)
    .map(([item_id, v]) => ({
      item_id,
      item_title: v.title,
      total_duration_minutes: v.totalDuration,
      record_count: v.recordCount,
      percentage: totalDuration > 0 ? Math.round((v.totalDuration / totalDuration) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total_duration_minutes - a.total_duration_minutes);

  return ranking;
}

// ==========================================
// 非事项区统计：未关联事项的记录
// ==========================================
async function computeUnassignedStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<NonNullable<InsightsData['unassigned_stats']>> {
  const empty = { unassigned_count: 0, unassigned_duration_minutes: 0, unassigned_cost: 0, total_count: 0 };
  if (dayIdsInRange.length === 0) return empty;

  // 查询范围内所有记录
  const { data: allRecords } = await supabase
    .from('records')
    .select('id, item_id, duration_minutes, cost')
    .eq('user_id', userId)
    .in('record_day_id', dayIdsInRange);

  if (!allRecords || allRecords.length === 0) return empty;

  const total_count = allRecords.length;
  const unassigned = allRecords.filter((r: { item_id: string | null }) => !r.item_id);
  const unassigned_count = unassigned.length;
  const unassigned_duration_minutes = unassigned.reduce((sum: number, r: { duration_minutes: number | null }) => sum + (r.duration_minutes || 0), 0);
  const unassigned_cost = unassigned.reduce((sum: number, r: { cost: number | null }) => sum + (r.cost || 0), 0);

  return { unassigned_count, unassigned_duration_minutes, unassigned_cost, total_count };
}

// ==========================================
// 统计4主轴
// ==========================================
async function computeFourAxes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<NonNullable<InsightsData['four_axes']>> {
  // --- 主轴1：行动vs目标 ---
  // 获取活跃事项
  const { data: activeItems } = await supabase
    .from('items')
    .select('id, title')
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中', '放缓']);

  // 获取活跃目标
  const { data: activeGoals } = await supabase
    .from('goals')
    .select('id, title, item_id, status, measure_type, target_value, current_value, unit')
    .eq('user_id', userId)
    .eq('status', '进行中');

  // 获取范围内各事项的记录统计
  const actionVsGoal: NonNullable<InsightsData['four_axes']>['action_vs_goal'] = [];
  for (const item of activeItems || []) {
    const { data: itemRecords } = await supabase
      .from('records')
      .select('id, duration_minutes')
      .eq('user_id', userId)
      .eq('item_id', item.id)
      .in('record_day_id', dayIdsInRange);

    const recordCount = itemRecords?.length || 0;
    const totalDuration = (itemRecords || []).reduce((sum: number, r: { duration_minutes: number | null }) => sum + (r.duration_minutes || 0), 0);
    const goal = (activeGoals || []).find((g: { item_id: string | null }) => g.item_id === item.id);

    let goalProgress: number | null = null;
    let deficit: number | null = null;
    let deficitUnit: string | null = null;

    if (goal && goal.measure_type === 'numeric' && goal.target_value) {
      goalProgress = goal.current_value != null
        ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
        : 0;
      deficit = goal.current_value != null
        ? Math.max(0, goal.target_value - goal.current_value)
        : goal.target_value;
      deficitUnit = goal.unit || null;
    }

    actionVsGoal.push({
      item_id: item.id,
      item_title: item.title,
      record_count: recordCount,
      total_duration_minutes: totalDuration,
      has_goal: !!goal,
      goal_title: goal?.title || null,
      goal_progress: goalProgress,
      deficit,
      deficit_unit: deficitUnit,
    });
  }

  // --- 主轴2：时间vs计划 ---
  let totalPlans = 0;
  let completedPlans = 0;
  let overduePlans = 0;
  if (dayIdsInRange.length > 0) {
    const { data: planRecords } = await supabase
      .from('records')
      .select('id, status, time_anchor_date')
      .eq('user_id', userId)
      .eq('type', '计划')
      .in('record_day_id', dayIdsInRange);

    totalPlans = planRecords?.length || 0;
    completedPlans = (planRecords || []).filter((r: { status: string | null }) => r.status === '已完成').length;
    const today = new Date().toISOString().split('T')[0];
    overduePlans = (planRecords || []).filter((r: { status: string | null; time_anchor_date: string | null }) =>
      r.status !== '已完成' && r.status !== '已取消' && r.time_anchor_date && r.time_anchor_date < today
    ).length;
  }
  const timeVsPlan = {
    total_plans: totalPlans,
    completed_plans: completedPlans,
    completion_rate: totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0,
    overdue_plans: overduePlans,
  };

  // --- 主轴3：投入vs效果 ---
  let totalRecordsWithDuration = 0;
  let totalHours = 0;
  let recordsWithResult = 0;
  if (dayIdsInRange.length > 0) {
    const { data: allRecs } = await supabase
      .from('records')
      .select('id, duration_minutes, result')
      .eq('user_id', userId)
      .in('record_day_id', dayIdsInRange);

    for (const r of allRecs || []) {
      if (r.duration_minutes) {
        totalRecordsWithDuration++;
        totalHours += r.duration_minutes;
      }
      if (r.result) recordsWithResult++;
    }
    totalHours = totalHours / 60;
  }
  const effortVsResult = {
    total_records_with_duration: totalRecordsWithDuration,
    total_hours: Math.round(totalHours * 10) / 10,
    records_with_result: recordsWithResult,
    result_rate: totalRecordsWithDuration > 0 ? Math.round((recordsWithResult / totalRecordsWithDuration) * 100) : 0,
  };

  // --- 主轴4：近期时间分布摘要 ---
  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const prevSevenDays = new Date(now); prevSevenDays.setDate(prevSevenDays.getDate() - 14);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // 近7天时长
  const { data: days7d } = await supabase
    .from('record_days').select('id').eq('user_id', userId).gte('date', fmt(sevenDaysAgo));
  const dayIds7d = (days7d || []).map((d: { id: string }) => d.id);
  let hours7d = 0;
  if (dayIds7d.length > 0) {
    const { data: recs7d } = await supabase
      .from('records').select('duration_minutes').eq('user_id', userId).in('record_day_id', dayIds7d);
    hours7d = (recs7d || []).reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0) / 60;
  }

  // 前7天时长（用于计算变化）
  const { data: daysPrev7d } = await supabase
    .from('record_days').select('id').eq('user_id', userId).gte('date', fmt(prevSevenDays)).lt('date', fmt(sevenDaysAgo));
  const dayIdsPrev7d = (daysPrev7d || []).map((d: { id: string }) => d.id);
  let hoursPrev7d = 0;
  if (dayIdsPrev7d.length > 0) {
    const { data: recsPrev7d } = await supabase
      .from('records').select('duration_minutes').eq('user_id', userId).in('record_day_id', dayIdsPrev7d);
    hoursPrev7d = (recsPrev7d || []).reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0) / 60;
  }

  // 近30天时长
  const { data: days30d } = await supabase
    .from('record_days').select('id').eq('user_id', userId).gte('date', fmt(thirtyDaysAgo));
  const dayIds30d = (days30d || []).map((d: { id: string }) => d.id);
  let hours30d = 0;
  if (dayIds30d.length > 0) {
    const { data: recs30d } = await supabase
      .from('records').select('duration_minutes').eq('user_id', userId).in('record_day_id', dayIds30d);
    hours30d = (recs30d || []).reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0) / 60;
  }

  const changePercent = hoursPrev7d > 0 ? Math.round(((hours7d - hoursPrev7d) / hoursPrev7d) * 100) : null;
  // 找top事项
  const ranking = await computeItemTimeRanking(supabase, userId, dayIds7d);
  const topItem = ranking.length > 0 ? ranking[0] : null;

  const recentTimeSummary = {
    total_hours_7d: Math.round(hours7d * 10) / 10,
    total_hours_30d: Math.round(hours30d * 10) / 10,
    change_percent: changePercent,
    top_item_title: topItem?.item_title || null,
    top_item_hours: topItem ? Math.round(topItem.total_duration_minutes / 6) / 10 : null,
  };

  return {
    action_vs_goal: actionVsGoal,
    time_vs_plan: timeVsPlan,
    effort_vs_result: effortVsResult,
    recent_time_summary: recentTimeSummary,
  };
}

// ==========================================
// 固定时间对比（本周vs上周/本月vs上月）
// ==========================================
async function computePeriodComparison(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<NonNullable<InsightsData['period_comparison']>> {
  const now = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // 本周起始（周一）
  const dayOfWeek = now.getDay() || 7; // 0=Sunday → 7
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - dayOfWeek + 1);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  // 本月起始
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // 上月最后一天

  async function fetchPeriodStats(dateFrom: string, dateTo: string) {
    const { data: days } = await supabase
      .from('record_days').select('id').eq('user_id', userId).gte('date', dateFrom).lte('date', dateTo);
    const dayIds = (days || []).map((d: { id: string }) => d.id);
    if (dayIds.length === 0) return { record_count: 0, total_hours: 0, total_cost: 0 };

    const { data: recs } = await supabase
      .from('records').select('id, duration_minutes, cost').eq('user_id', userId).in('record_day_id', dayIds);

    const record_count = recs?.length || 0;
    const total_hours = Math.round((recs || []).reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0) / 60 * 10) / 10;
    const total_cost = (recs || []).reduce((s: number, r: { cost: number | null }) => s + (r.cost || 0), 0);
    return { record_count, total_hours, total_cost };
  }

  return {
    this_week: await fetchPeriodStats(fmt(thisWeekStart), fmt(now)),
    last_week: await fetchPeriodStats(fmt(lastWeekStart), fmt(lastWeekEnd)),
    this_month: await fetchPeriodStats(fmt(thisMonthStart), fmt(now)),
    last_month: await fetchPeriodStats(fmt(lastMonthStart), fmt(lastMonthEnd)),
  };
}

// ==========================================
// 口径化指标（5大核心指标按事项计算）
// ==========================================
import { computeActivity, computeEffort, computeStagnation, computePlanAchievement, computeEffectiveness } from '@/lib/stats/metrics';

async function computeMetricsByItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<NonNullable<InsightsData['metrics_by_item']>> {
  const { data: activeItems } = await supabase
    .from('items')
    .select('id, title')
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中', '放缓']);

  if (!activeItems || activeItems.length === 0) return [];

  const now = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const sevenDaysAgo = fmt(new Date(now.getTime() - 7 * 86400000));
  const thirtyDaysAgo = fmt(new Date(now.getTime() - 30 * 86400000));

  // 获取近7天和近30天的 day IDs
  const { data: days7d } = await supabase
    .from('record_days').select('id').eq('user_id', userId).gte('date', sevenDaysAgo);
  const dayIds7d = (days7d || []).map((d: { id: string }) => d.id);

  const { data: days30d } = await supabase
    .from('record_days').select('id').eq('user_id', userId).gte('date', thirtyDaysAgo);
  const dayIds30d = (days30d || []).map((d: { id: string }) => d.id);

  const results: NonNullable<InsightsData['metrics_by_item']> = [];
  let maxDuration = 0;
  const itemStatsList: Array<{ id: string; title: string; stats: import('@/lib/stats/metrics').ItemStats }> = [];

  for (const item of activeItems) {
    // 近7天记录数
    const { count: count7d } = await supabase
      .from('records').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('item_id', item.id)
      .in('record_day_id', dayIds7d);

    // 近30天记录数
    const { count: count30d } = await supabase
      .from('records').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('item_id', item.id)
      .in('record_day_id', dayIds30d);

    // 总时长
    const { data: durationRecs } = await supabase
      .from('records').select('duration_minutes')
      .eq('user_id', userId).eq('item_id', item.id)
      .in('record_day_id', dayIdsInRange);
    const totalDuration = (durationRecs || []).reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0);
    if (totalDuration > maxDuration) maxDuration = totalDuration;

    // 最近记录时间
    const { data: latestRec } = await supabase
      .from('records').select('created_at')
      .eq('user_id', userId).eq('item_id', item.id)
      .order('created_at', { ascending: false }).limit(1);
    const lastRecordAt = latestRec && latestRec.length > 0 ? latestRec[0].created_at : null;

    // 计划统计
    const { count: totalPlans } = await supabase
      .from('records').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('item_id', item.id).eq('type', '计划')
      .in('record_day_id', dayIdsInRange);
    const { count: completedPlans } = await supabase
      .from('records').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('item_id', item.id).eq('type', '计划').eq('status', '已完成')
      .in('record_day_id', dayIdsInRange);

    // 结果统计
    const { data: resultRecs } = await supabase
      .from('records').select('id, duration_minutes, result')
      .eq('user_id', userId).eq('item_id', item.id)
      .in('record_day_id', dayIdsInRange);
    const recordsWithDuration = (resultRecs || []).filter((r: { duration_minutes: number | null }) => !!r.duration_minutes).length;
    const recordsWithResult = (resultRecs || []).filter((r: { result: string | null }) => !!r.result).length;

    const stats = {
      recordCount7d: count7d || 0,
      recordCount30d: count30d || 0,
      totalDurationMinutes: totalDuration,
      lastRecordAt,
      totalPlans: totalPlans || 0,
      completedPlans: completedPlans || 0,
      recordsWithResult,
      recordsWithDuration,
    };

    itemStatsList.push({ id: item.id, title: item.title, stats });
  }

  // 用最大时长归一化投入
  for (const item of itemStatsList) {
    results.push({
      item_id: item.id,
      item_title: item.title,
      activity: computeActivity(item.stats),
      effort: computeEffort(item.stats, maxDuration),
      stagnation_days: computeStagnation(item.stats),
      plan_achievement: computePlanAchievement(item.stats),
      effectiveness: computeEffectiveness(item.stats),
    });
  }

  return results;
}

// ==========================================
// 推断数据统计
// ==========================================
async function computeInferredStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dayIdsInRange: string[]
): Promise<NonNullable<InsightsData['inferred_stats']>> {
  if (dayIdsInRange.length === 0) {
    return { total_records: 0, inferred_count: 0, fact_count: 0, inferred_ratio: 0 };
  }

  const { data: records } = await supabase
    .from('records')
    .select('id, data_nature')
    .eq('user_id', userId)
    .in('record_day_id', dayIdsInRange);

  const total = records?.length || 0;
  const inferred = (records || []).filter((r: { data_nature: string | null }) => r.data_nature === 'inferred').length;
  const fact = total - inferred;

  return {
    total_records: total,
    inferred_count: inferred,
    fact_count: fact,
    inferred_ratio: total > 0 ? Math.round((inferred / total) * 100) : 0,
  };
}
