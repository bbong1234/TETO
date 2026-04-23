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

    // 批量查询各目标关联的事项数
    const { data: itemsByGoal } = await supabase
      .from('items')
      .select('goal_id')
      .eq('user_id', userId)
      .in('goal_id', goalIds);

    // 批量查询各目标关联的记录数
    const { data: recordsByGoal } = await supabase
      .from('records')
      .select('goal_id')
      .eq('user_id', userId)
      .in('goal_id', goalIds);

    const itemCountByGoal: { [goalId: string]: number } = {};
    for (const item of (itemsByGoal ?? [])) {
      if (item.goal_id) itemCountByGoal[item.goal_id] = (itemCountByGoal[item.goal_id] ?? 0) + 1;
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
  };
}
