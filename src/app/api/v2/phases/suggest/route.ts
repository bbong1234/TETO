import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';

interface PhaseSuggestion {
  title: string;
  start_date: string;
  end_date: string;
  reason: string;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');

    if (!itemId) {
      return NextResponse.json({ error: 'item_id 为必填参数' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. 验证事项归属
    const { data: item } = await supabase
      .from('items')
      .select('id, title')
      .eq('id', itemId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!item) {
      return NextResponse.json({ error: '事项不存在或不属于当前用户' }, { status: 404 });
    }

    // 2. 获取已有阶段（用于排除已有范围和质量过滤）
    const { data: existingPhases } = await supabase
      .from('phases')
      .select('id, title, start_date, end_date')
      .eq('item_id', itemId)
      .eq('user_id', userId);

    // 3. 获取该事项近 90 天记录
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const fromDate = ninetyDaysAgo.toISOString().split('T')[0];

    const { data: dayData } = await supabase
      .from('record_days')
      .select('id')
      .eq('user_id', userId)
      .gte('date', fromDate);

    if (!dayData || dayData.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const dayIds = dayData.map((d: { id: string }) => d.id);

    const { data: records } = await supabase
      .from('records')
      .select('id, content, metric_value, metric_name, occurred_at, created_at, record_day_id')
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .in('record_day_id', dayIds)
      .order('occurred_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (!records || records.length < 3) {
      return NextResponse.json({ data: [] });
    }

    // 构建 record_day_id → date 映射
    const { data: allDayData } = await supabase
      .from('record_days')
      .select('id, date')
      .eq('user_id', userId)
      .in('id', dayIds);

    const dayMap = new Map<string, string>();
    for (const d of (allDayData ?? [])) {
      dayMap.set(d.id, d.date);
    }

    // 4. 排除已归入阶段的记录的日期范围
    const phaseDateRanges: { start: Date; end: Date }[] = [];
    for (const p of (existingPhases ?? [])) {
      if (p.start_date && p.end_date) {
        phaseDateRanges.push({ start: new Date(p.start_date), end: new Date(p.end_date) });
      }
    }

    const isInExistingPhase = (dateStr: string): boolean => {
      const date = new Date(dateStr).getTime();
      return phaseDateRanges.some(r => {
        const s = r.start.getTime();
        const e = r.end.getTime() + 86400000; // +1 day
        return date >= s && date <= e;
      });
    };

    const filteredRecords = records.filter(r => {
      const date = dayMap.get(r.record_day_id);
      return date && !isInExistingPhase(date);
    });

    if (filteredRecords.length < 3) {
      return NextResponse.json({ data: [] });
    }

    // 5. 按周聚合记录密度
    const weeklyMap = new Map<string, { records: typeof filteredRecords; count: number; metrics: Map<string, number[]> }>();
    for (const r of filteredRecords) {
      const date = dayMap.get(r.record_day_id);
      if (!date) continue;
      const d = new Date(date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      let week = weeklyMap.get(weekKey);
      if (!week) {
        week = { records: [], count: 0, metrics: new Map() };
        weeklyMap.set(weekKey, week);
      }
      week.records.push(r);
      week.count++;
      if (r.metric_value != null && r.metric_name) {
        let vals = week.metrics.get(r.metric_name);
        if (!vals) { vals = []; week.metrics.set(r.metric_name, vals); }
        vals.push(r.metric_value);
      }
    }

    if (weeklyMap.size < 2) {
      return NextResponse.json({ data: [] });
    }

    // 6. 检测密度变化点
    const weeks = Array.from(weeklyMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    const densities = weeks.map(([, w]) => w.count);
    const avgDensity = densities.reduce((s, c) => s + c, 0) / densities.length;

    // 找连续高于均值的周段
    const suggestions: PhaseSuggestion[] = [];
    let streakStart = -1;
    let streakRecords: typeof filteredRecords = [];

    for (let i = 0; i < weeks.length; i++) {
      const [weekKey, week] = weeks[i];
      if (week.count >= avgDensity * 1.3) { // 密度1.3倍以上视为高活跃
        if (streakStart === -1) {
          streakStart = i;
          streakRecords = [...week.records];
        } else {
          streakRecords.push(...week.records);
        }
      } else {
        if (streakStart !== -1 && i - streakStart >= 2) { // 至少持续2周
          const startDate = weeks[streakStart][0];
          const endWeekKey = weeks[i - 1][0];
          const endDate = new Date(endWeekKey);
          endDate.setDate(endDate.getDate() + 6);
          const endDateStr = endDate.toISOString().split('T')[0];

          const title = generatePhaseTitle(streakRecords, item.title);
          if (title && passesQualityFilter(title, existingPhases ?? [])) {
            suggestions.push({
              title,
              start_date: startDate,
              end_date: endDateStr,
              reason: `近 ${i - streakStart} 周记录密度明显增加（日均 ${(streakRecords.length / ((i - streakStart) * 7)).toFixed(1)} 条），建议归纳为阶段`,
            });
          }
        }
        streakStart = -1;
        streakRecords = [];
      }
    }

    // 处理末尾的 streak
    if (streakStart !== -1 && weeks.length - streakStart >= 2) {
      const startDate = weeks[streakStart][0];
      const lastWeekKey = weeks[weeks.length - 1][0];
      const endDate = new Date(lastWeekKey);
      endDate.setDate(endDate.getDate() + 6);
      const endDateStr = endDate.toISOString().split('T')[0];

      const title = generatePhaseTitle(streakRecords, item.title);
      if (title && passesQualityFilter(title, existingPhases ?? [])) {
        suggestions.push({
          title,
          start_date: startDate,
          end_date: endDateStr,
          reason: `近期连续 ${weeks.length - streakStart} 周保持较高记录密度，建议归纳为阶段`,
        });
      }
    }

    // 过滤与已有阶段重叠超过 70% 的建议
    const filtered = suggestions.filter(s => {
      const sStart = new Date(s.start_date).getTime();
      const sEnd = new Date(s.end_date).getTime();
      const sDuration = sEnd - sStart;
      if (sDuration <= 0) return false;

      for (const ep of (existingPhases ?? [])) {
        if (!ep.start_date || !ep.end_date) continue;
        const epStart = new Date(ep.start_date).getTime();
        const epEnd = new Date(ep.end_date).getTime();
        const overlapStart = Math.max(sStart, epStart);
        const overlapEnd = Math.min(sEnd, epEnd);
        if (overlapEnd > overlapStart) {
          const overlapRatio = (overlapEnd - overlapStart) / sDuration;
          if (overlapRatio > 0.7) return false;
        }
      }
      return true;
    });

    return NextResponse.json({ data: filtered.slice(0, 3) });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 根据记录内容生成阶段标题
 * 核心原则：有含义的定性概括，不用编号或纯时间范围
 */
function generatePhaseTitle(records: Array<{ content: string; metric_name: string | null }>, itemTitle: string): string | null {
  if (records.length === 0) return null;

  // 分析主要 metric
  const metricCounts = new Map<string, number>();
  for (const r of records) {
    if (r.metric_name) {
      metricCounts.set(r.metric_name, (metricCounts.get(r.metric_name) ?? 0) + 1);
    }
  }

  const topMetric = [...metricCounts.entries()].sort(([, a], [, b]) => b - a)[0];

  // 提取行为关键词
  const behaviorKeywords = ['学习', '练习', '训练', '备考', '复习', '积累', '冲刺',
    '锻炼', '跑步', '阅读', '写作', '开发', '研究', '探索', '尝试', '培养', '养成',
    '坚持', '推进', '持续', '集中', '密集', '日常', '稳定', '恢复', '起步', '启动'];

  const foundBehaviors = new Set<string>();
  for (const r of records.slice(0, 20)) {
    for (const kw of behaviorKeywords) {
      if (r.content.includes(kw)) foundBehaviors.add(kw);
    }
  }

  if (foundBehaviors.size > 0) {
    const topBehaviors = [...foundBehaviors].slice(0, 2);
    const behaviorPart = topBehaviors.join('·');
    if (topMetric) {
      return `${behaviorPart}期（${topMetric[0]}）`;
    }
    return `${behaviorPart}期`;
  }

  if (topMetric) {
    return `持续${topMetric[0]}积累期`;
  }

  return `${itemTitle}密集记录期`;
}

/**
 * 质量过滤器：排除不合格的标题
 */
function passesQualityFilter(title: string, existingPhases: Array<{ title: string }>): boolean {
  // 纯数字编号 → 不通过
  if (/^第\d+[期阶段]$/.test(title) || /^阶段\d+$/.test(title)) return false;

  // 纯时间范围 → 不通过
  if (/^\d+月-\d+月$/.test(title) || /^\d{4}年第\d+季度$/.test(title)) return false;

  // 不包含任何行为/状态描述词 → 不通过
  const descWords = ['学习', '练习', '训练', '备考', '复习', '积累', '冲刺',
    '锻炼', '跑步', '阅读', '写作', '开发', '持续', '密集', '日常', '稳定',
    '恢复', '起步', '启动', '推进', '坚持', '探索', '尝试', '培养', '养成',
    '集中', '提升', '突破', '巩固', '基础', '进阶', '过渡', '转变', '调整',
    '适应', '投入', '专注', '沉淀', '蓄力', '爆发', '成长'];
  const hasDescWord = descWords.some(w => title.includes(w));
  if (!hasDescWord) return false;

  // 与已有阶段同名 → 不通过
  for (const ep of existingPhases) {
    if (ep.title === title) return false;
  }

  return true;
}
