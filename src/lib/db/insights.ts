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

  // 并行计算所有独立子模块（原来串行7个await，现在并行）
  const [
    timeDistribution,
    itemTimeRanking,
    unassignedStats,
    fourAxes,
    periodComparison,
    metricsByItem,
    inferredStats,
  ] = await Promise.all([
    computeTimeDistribution(supabase, userId, dayIdsInRange),
    computeItemTimeRanking(supabase, userId, dayIdsInRange),
    computeUnassignedStats(supabase, userId, dayIdsInRange),
    computeFourAxes(supabase, userId, dayIdsInRange),
    computePeriodComparison(supabase, userId),
    computeMetricsByItem(supabase, userId, dayIdsInRange),
    computeInferredStats(supabase, userId, dayIdsInRange),
  ]);

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
    time_distribution: timeDistribution,
    item_time_ranking: itemTimeRanking,
    unassigned_stats: unassignedStats,
    four_axes: fourAxes,
    period_comparison: periodComparison,
    metrics_by_item: metricsByItem,
    inferred_stats: inferredStats,
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
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const prevSevenDays = new Date(now); prevSevenDays.setDate(prevSevenDays.getDate() - 14);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 并行获取所有需要的基础数据
  const [
    activeItemsResult,
    activeGoalsResult,
    allRecordsResult,    // 用于主轴1+3
    planRecordsResult,   // 用于主轴2
    days7dResult,
    daysPrev7dResult,
    days30dResult,
  ] = await Promise.all([
    supabase.from('items').select('id, title').eq('user_id', userId).in('status', ['活跃', '推进中', '放缓']),
    supabase.from('goals').select('id, title, item_id, status, measure_type, target_value, current_value, unit').eq('user_id', userId).eq('status', '进行中'),
    dayIdsInRange.length > 0
      ? supabase.from('records').select('id, item_id, duration_minutes, result').eq('user_id', userId).in('record_day_id', dayIdsInRange)
      : Promise.resolve({ data: [], error: null }),
    dayIdsInRange.length > 0
      ? supabase.from('records').select('id, status, time_anchor_date').eq('user_id', userId).eq('type', '计划').in('record_day_id', dayIdsInRange)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('record_days').select('id, date').eq('user_id', userId).gte('date', fmt(sevenDaysAgo)),
    supabase.from('record_days').select('id, date').eq('user_id', userId).gte('date', fmt(prevSevenDays)).lt('date', fmt(sevenDaysAgo)),
    supabase.from('record_days').select('id, date').eq('user_id', userId).gte('date', fmt(thirtyDaysAgo)),
  ]);

  const activeItems = activeItemsResult.data || [];
  const activeGoals = activeGoalsResult.data || [];
  const allRecords = allRecordsResult.data || [];
  const planRecords = planRecordsResult.data || [];

  // --- 主轴1：行动vs目标（批量聚合，不用循环查询） ---
  const itemRecordMap = new Map<string, { count: number; duration: number }>();
  for (const r of allRecords) {
    const iid = (r as { item_id: string | null }).item_id;
    if (!iid) continue;
    const existing = itemRecordMap.get(iid) || { count: 0, duration: 0 };
    existing.count++;
    existing.duration += (r as { duration_minutes: number | null }).duration_minutes || 0;
    itemRecordMap.set(iid, existing);
  }

  const actionVsGoal: NonNullable<InsightsData['four_axes']>['action_vs_goal'] = [];
  for (const item of activeItems) {
    const stats = itemRecordMap.get(item.id) || { count: 0, duration: 0 };
    const goal = (activeGoals as { item_id: string | null }[]).find(g => g.item_id === item.id) as typeof activeGoals[number] | undefined;

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
      record_count: stats.count,
      total_duration_minutes: stats.duration,
      has_goal: !!goal,
      goal_title: goal?.title || null,
      goal_progress: goalProgress,
      deficit,
      deficit_unit: deficitUnit,
    });
  }

  // --- 主轴2：时间vs计划（已批量获取） ---
  const totalPlans = planRecords.length;
  const completedPlans = planRecords.filter((r: { status: string | null }) => r.status === '已完成').length;
  const today = now.toISOString().split('T')[0];
  const overduePlans = planRecords.filter((r: { status: string | null; time_anchor_date: string | null }) =>
    r.status !== '已完成' && r.status !== '已取消' && r.time_anchor_date && r.time_anchor_date < today
  ).length;
  const timeVsPlan = {
    total_plans: totalPlans,
    completed_plans: completedPlans,
    completion_rate: totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0,
    overdue_plans: overduePlans,
  };

  // --- 主轴3：投入vs效果（已批量获取） ---
  let totalRecordsWithDuration = 0;
  let totalHours = 0;
  let recordsWithResult = 0;
  for (const r of allRecords) {
    const rec = r as { duration_minutes: number | null; result: string | null };
    if (rec.duration_minutes) {
      totalRecordsWithDuration++;
      totalHours += rec.duration_minutes;
    }
    if (rec.result) recordsWithResult++;
  }
  totalHours = totalHours / 60;
  const effortVsResult = {
    total_records_with_duration: totalRecordsWithDuration,
    total_hours: Math.round(totalHours * 10) / 10,
    records_with_result: recordsWithResult,
    result_rate: totalRecordsWithDuration > 0 ? Math.round((recordsWithResult / totalRecordsWithDuration) * 100) : 0,
  };

  // --- 主轴4：近期时间分布摘要 ---
  const dayIds7d = (days7dResult.data || []).map((d: { id: string }) => d.id);
  const dayIdsPrev7d = (daysPrev7dResult.data || []).map((d: { id: string }) => d.id);
  const dayIds30d = (days30dResult.data || []).map((d: { id: string }) => d.id);

  // 并行获取3段时长数据
  const [recs7dResult, recsPrev7dResult, recs30dResult] = await Promise.all([
    dayIds7d.length > 0
      ? supabase.from('records').select('duration_minutes, item_id, items(id, title)').eq('user_id', userId).in('record_day_id', dayIds7d)
      : Promise.resolve({ data: [], error: null }),
    dayIdsPrev7d.length > 0
      ? supabase.from('records').select('duration_minutes').eq('user_id', userId).in('record_day_id', dayIdsPrev7d)
      : Promise.resolve({ data: [], error: null }),
    dayIds30d.length > 0
      ? supabase.from('records').select('duration_minutes').eq('user_id', userId).in('record_day_id', dayIds30d)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const hours7d = (recs7dResult.data || []).reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0) / 60;
  const hoursPrev7d = (recsPrev7dResult.data || []).reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0) / 60;
  const hours30d = (recs30dResult.data || []).reduce((s: number, r: { duration_minutes: number | null }) => s + (r.duration_minutes || 0), 0) / 60;

  const changePercent = hoursPrev7d > 0 ? Math.round(((hours7d - hoursPrev7d) / hoursPrev7d) * 100) : null;

  // 从近7天记录中找top事项（内联聚合，不再调computeItemTimeRanking）
  const itemDuration7d = new Map<string, { title: string; totalDuration: number }>();
  for (const r of (recs7dResult.data || [])) {
    const rec = r as { item_id: string | null; duration_minutes: number | null; items: unknown };
    if (!rec.item_id || !rec.duration_minutes) continue;
    const item = rec.items as { id: string; title: string } | null;
    if (!item) continue;
    const existing = itemDuration7d.get(rec.item_id) || { title: item.title, totalDuration: 0 };
    existing.totalDuration += rec.duration_minutes;
    itemDuration7d.set(rec.item_id, existing);
  }
  const topEntry = [...itemDuration7d.entries()].sort((a, b) => b[1].totalDuration - a[1].totalDuration)[0];

  const recentTimeSummary = {
    total_hours_7d: Math.round(hours7d * 10) / 10,
    total_hours_30d: Math.round(hours30d * 10) / 10,
    change_percent: changePercent,
    top_item_title: topEntry?.[1]?.title || null,
    top_item_hours: topEntry ? Math.round(topEntry[1].totalDuration / 6) / 10 : null,
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

  // 并行获取4个时段数据
  const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
    fetchPeriodStats(fmt(thisWeekStart), fmt(now)),
    fetchPeriodStats(fmt(lastWeekStart), fmt(lastWeekEnd)),
    fetchPeriodStats(fmt(thisMonthStart), fmt(now)),
    fetchPeriodStats(fmt(lastMonthStart), fmt(lastMonthEnd)),
  ]);

  return { this_week: thisWeek, last_week: lastWeek, this_month: thisMonth, last_month: lastMonth };
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
  const activeItemIds = activeItems.map(i => i.id);

  // 并行批量获取所有数据
  const [days7dResult, days30dResult, recs7dResult, recs30dResult, recsInRangeResult, recsLatestResult, planRecsResult, completedPlanRecsResult] = await Promise.all([
    supabase.from('record_days').select('id').eq('user_id', userId).gte('date', sevenDaysAgo),
    supabase.from('record_days').select('id').eq('user_id', userId).gte('date', thirtyDaysAgo),
    // 近7天记录按事项聚合
    supabase.from('records').select('item_id').eq('user_id', userId).in('item_id', activeItemIds).in('record_day_id', /* dayIds7d will be computed */ [] as string[]),
    supabase.from('records').select('item_id').eq('user_id', userId).in('item_id', activeItemIds),
    // 范围内记录按事项聚合（时长+结果+计划）
    dayIdsInRange.length > 0
      ? supabase.from('records').select('item_id, duration_minutes, result, type, status').eq('user_id', userId).in('item_id', activeItemIds).in('record_day_id', dayIdsInRange)
      : Promise.resolve({ data: [], error: null }),
    // 最近记录时间
    supabase.from('records').select('item_id, created_at').eq('user_id', userId).in('item_id', activeItemIds).order('created_at', { ascending: false }).limit(1000),
    supabase.from('records').select('item_id').eq('user_id', userId).in('item_id', activeItemIds).eq('type', '计划').in('record_day_id', dayIdsInRange),
    supabase.from('records').select('item_id').eq('user_id', userId).in('item_id', activeItemIds).eq('type', '计划').eq('status', '已完成').in('record_day_id', dayIdsInRange),
  ]);

  const dayIds7d = (days7dResult.data || []).map((d: { id: string }) => d.id);
  const dayIds30d = (days30dResult.data || []).map((d: { id: string }) => d.id);

  // 近7天按事项聚合（需二次查询，因为dayIds7d依赖第一次查询）
  const { data: recs7dAgg } = dayIds7d.length > 0
    ? await supabase.from('records').select('item_id').eq('user_id', userId).in('item_id', activeItemIds).in('record_day_id', dayIds7d)
    : { data: [] };
  const { data: recs30dAgg } = dayIds30d.length > 0
    ? await supabase.from('records').select('item_id').eq('user_id', userId).in('item_id', activeItemIds).in('record_day_id', dayIds30d)
    : { data: [] };

  const recsInRange = recsInRangeResult.data || [];
  const recsLatest = recsLatestResult.data || [];
  const planRecs = planRecsResult.data || [];
  const completedPlanRecs = completedPlanRecsResult.data || [];

  // 按事项聚合
  const countByItem7d = new Map<string, number>();
  for (const r of (recs7dAgg || [])) countByItem7d.set((r as { item_id: string }).item_id, (countByItem7d.get((r as { item_id: string }).item_id) || 0) + 1);

  const countByItem30d = new Map<string, number>();
  for (const r of (recs30dAgg || [])) countByItem30d.set((r as { item_id: string }).item_id, (countByItem30d.get((r as { item_id: string }).item_id) || 0) + 1);

  const durationByItem = new Map<string, number>();
  const resultCountByItem = new Map<string, number>();
  const withDurationByItem = new Map<string, number>();
  const planCountByItem = new Map<string, number>();
  const completedPlanByItem = new Map<string, number>();

  for (const r of recsInRange) {
    const rec = r as { item_id: string; duration_minutes: number | null; result: string | null; type: string | null; status: string | null };
    durationByItem.set(rec.item_id, (durationByItem.get(rec.item_id) || 0) + (rec.duration_minutes || 0));
    if (rec.result) resultCountByItem.set(rec.item_id, (resultCountByItem.get(rec.item_id) || 0) + 1);
    if (rec.duration_minutes) withDurationByItem.set(rec.item_id, (withDurationByItem.get(rec.item_id) || 0) + 1);
  }
  for (const r of planRecs) planCountByItem.set((r as { item_id: string }).item_id, (planCountByItem.get((r as { item_id: string }).item_id) || 0) + 1);
  for (const r of completedPlanRecs) completedPlanByItem.set((r as { item_id: string }).item_id, (completedPlanByItem.get((r as { item_id: string }).item_id) || 0) + 1);

  const latestByItem = new Map<string, string>();
  for (const r of recsLatest) {
    const rec = r as { item_id: string; created_at: string };
    if (!latestByItem.has(rec.item_id)) latestByItem.set(rec.item_id, rec.created_at);
  }

  let maxDuration = 0;
  const itemStatsList: Array<{ id: string; title: string; stats: import('@/lib/stats/metrics').ItemStats }> = [];

  for (const item of activeItems) {
    const totalDuration = durationByItem.get(item.id) || 0;
    if (totalDuration > maxDuration) maxDuration = totalDuration;
    itemStatsList.push({
      id: item.id,
      title: item.title,
      stats: {
        recordCount7d: countByItem7d.get(item.id) || 0,
        recordCount30d: countByItem30d.get(item.id) || 0,
        totalDurationMinutes: totalDuration,
        lastRecordAt: latestByItem.get(item.id) || null,
        totalPlans: planCountByItem.get(item.id) || 0,
        completedPlans: completedPlanByItem.get(item.id) || 0,
        recordsWithResult: resultCountByItem.get(item.id) || 0,
        recordsWithDuration: withDurationByItem.get(item.id) || 0,
      },
    });
  }

  const results: NonNullable<InsightsData['metrics_by_item']> = [];
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
