import { createClient } from '@/lib/supabase/server';
import type { InsightsData, InsightsQuery, Phase, Goal } from '@/types/teto';

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
  // 6. 超过 7 天无更新的停滞事项
  // ==========================================
  const sevenDaysAgoISO = sevenDaysAgo.toISOString();
  const { data: allItems } = await supabase
    .from('items')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中']);

  let staleItems: { id: string; title: string; last_record_at: string | null }[] = [];
  if ((allItems ?? []).length > 0) {
    const allItemIds = (allItems ?? []).map((i: { id: string }) => i.id);
    // 一次查询拿到所有活跃事项的最近记录时间
    const { data: recentRecords } = await supabase
      .from('records')
      .select('item_id, created_at')
      .eq('user_id', userId)
      .in('item_id', allItemIds)
      .order('created_at', { ascending: false });

    // 每个 item 取最新一条
    const lastRecordMap: { [itemId: string]: string } = {};
    for (const r of (recentRecords ?? [])) {
      if (r.item_id && !lastRecordMap[r.item_id]) {
        lastRecordMap[r.item_id] = r.created_at;
      }
    }

    for (const item of (allItems ?? [])) {
      const lastRecordAt = lastRecordMap[item.id] ?? null;
      if (!lastRecordAt || lastRecordAt < sevenDaysAgoISO) {
        staleItems.push({ id: item.id, title: item.title, last_record_at: lastRecordAt });
      }
    }
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
