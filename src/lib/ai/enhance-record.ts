/**
 * enhance-record.ts
 * 记录创建后的异步 AI 增强：
 * 1. 自动识别 item_hint 并归属事项
 * 2. 回写 AI 解析的结构化字段（metric/cost/duration/location/people/parsed_semantic/time_anchor_date）
 * 3. 仅当记录原值为空时才覆盖，不破坏用户手动填写的值
 */

import { parseSemantic } from './parse-semantic';
import { parseWithFallback, shouldFallback, getFallbackMessage, type SimpleUserRule } from './parse-rules-fallback';
import { createClient } from '@/lib/supabase/server';
import type { ParsedSemantic, ClarificationNeeded, ClarificationIssue, SharedContextItem } from '@/types/semantic';

/**
 * 对一条已保存的记录进行异步 AI 增强
 * - 调用 DeepSeek 解析语义
 * - 回写 AI 解析结果到记录（仅填充空字段，不覆盖用户手动值）
 * - 自动匹配 item_hint 并归属事项
 * - 检测歧义条件，有歧义时返回 ClarificationNeeded 供前端弹出澄清框
 */
/** 降级模式信息（供前端展示提示） */
export interface FallbackInfo {
  is_fallback: true;
  reason: 'ai_timeout' | 'ai_error' | 'ai_unavailable' | 'api_key_missing';
  message: string;
}

export async function enhanceRecord(
  userId: string,
  recordId: string,
  content: string,
  date: string
): Promise<ClarificationNeeded | null> {
  const supabase = await createClient();

  // 先读取当前记录的现有值（用于"仅填空"逻辑）
  const { data: existingRecord } = await supabase
    .from('records')
    .select('item_id, sub_item_id, metric_value, metric_unit, metric_name, cost, duration_minutes, location, people, parsed_semantic, time_anchor_date, mood, energy, data_nature, is_period_rule, period_start_date, period_end_date, period_frequency, period_expanded, period_source_id')
    .eq('id', recordId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingRecord) return null;

  // 获取用户事项列表（只取活跃/推进中的）
  const { data: items } = await supabase
    .from('items')
    .select('id, title')
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中', '放缓'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (!items || items.length === 0) return null;

  // 获取用户所有子项
  const { data: subItems } = await supabase
    .from('sub_items')
    .select('id, title, item_id')
    .eq('user_id', userId);

  // 获取近期记录（供 AI 判断关联）
  let recentRecords: Array<{ id: string; content: string; date: string; type: string }> | undefined;
  try {
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const { data: dayData } = await supabase
      .from('record_days')
      .select('id')
      .eq('user_id', userId)
      .gte('date', fmtDate(threeDaysAgo))
      .lte('date', fmtDate(now));
    if (dayData && dayData.length > 0) {
      const dayIds = dayData.map((d: { id: string }) => d.id);
      const { data: recsData } = await supabase
        .from('records')
        .select('id, content, type, record_days(date)')
        .eq('user_id', userId)
        .in('record_day_id', dayIds)
        .order('created_at', { ascending: false })
        .limit(30);
      if (recsData) {
        recentRecords = recsData.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          content: r.content as string,
          type: r.type as string,
          date: ((r.record_days as Record<string, unknown> | null)?.date as string) || date,
        }));
      }
    }
  } catch { /* 获取近期记录失败不影响主流程 */ }

  // 调用语义解析（带降级兜底）
  let result;
  let fallbackInfo: FallbackInfo | null = null;
  try {
    result = await parseSemantic(content, date, recentRecords, items, subItems ?? undefined);
   } catch (err) {
    // AI 解析失败 → 尝试本地规则兜底
    const fallbackReason = shouldFallback(err);
    if (fallbackReason) {
      // 查询用户规则，降级模式下仍可使用已学习的归类偏好
      let userRulesForFallback: SimpleUserRule[] = [];
      try {
        const { data: rulesData } = await supabase
          .from('user_rules')
          .select('trigger_pattern, target_id, target_type, rule_type')
          .eq('user_id', userId)
          .eq('is_active', true);
        userRulesForFallback = (rulesData || []) as SimpleUserRule[];
      } catch { /* 规则查询失败不影响降级 */ }

      const fallbackResult = parseWithFallback(content, date, items, fallbackReason, userRulesForFallback);
      result = {
        parsed: fallbackResult.parsed,
        type_hints: fallbackResult.type_hints,
      };
      fallbackInfo = {
        is_fallback: true,
        reason: fallbackReason,
        message: getFallbackMessage(fallbackReason),
      };
    } else {
      // 非降级型错误，静默退出
      return null;
    }
  }

  const firstUnit = result.parsed.units[0];
  if (!firstUnit) return null;

  // 构建"仅填空"的更新载荷
  const update: Record<string, unknown> = {};

  // --- item_id：匹配事项 ---
  if (!existingRecord.item_id && firstUnit.item_hint) {
    const hint = firstUnit.item_hint.trim();
    let matched = items.find((i) => i.title === hint);
    if (!matched) {
      matched = items.find((i) => i.title.includes(hint) || hint.includes(i.title));
    }
    if (matched) {
      update.item_id = matched.id;
    }
  }

  // --- sub_item_id：AI sub_item_hint 匹配子项（限定在已匹配的事项范围内） ---
  const targetItemId4Sub = (update.item_id as string) || existingRecord.item_id;
  if (!existingRecord.sub_item_id && firstUnit.sub_item_hint && targetItemId4Sub) {
    const hint = firstUnit.sub_item_hint.trim().toLowerCase();
    const subsUnderItem = (subItems ?? []).filter(s => s.item_id === targetItemId4Sub);
    // 优先 action 匹配
    const action = firstUnit.action?.trim().toLowerCase() || '';
    let matchedSub = action
      ? subsUnderItem.find(s => s.title.toLowerCase().includes(action))
      : undefined;
    if (!matchedSub) {
      matchedSub =
        subsUnderItem.find(s => s.title.toLowerCase() === hint) ||
        subsUnderItem.find(s => s.title.toLowerCase().includes(hint) || hint.includes(s.title.toLowerCase()));
    }
    if (matchedSub) {
      update.sub_item_id = matchedSub.id;
    }
  }

  // --- sub_item_id 兜底：有 item_id 无 sub_item_id 时，用 action > metric_name 匹配子项 ---
  if (!existingRecord.sub_item_id && !update.sub_item_id && targetItemId4Sub) {
    const subsUnderItem = (subItems ?? []).filter(s => s.item_id === targetItemId4Sub);
    // 优先 action 匹配
    const action = firstUnit.action?.trim().toLowerCase() || '';
    let matched = action ? subsUnderItem.find(s => s.title.toLowerCase().includes(action)) : undefined;
    // 兜底 metric_name 匹配
    if (!matched) {
      const metricName = firstUnit.metric?.name || (update.metric_name as string | undefined);
      if (metricName) {
        const needle = metricName.toLowerCase();
        matched =
          subsUnderItem.find(s => s.title.toLowerCase() === needle) ||
          subsUnderItem.find(s => s.title.toLowerCase().includes(needle) || needle.includes(s.title.toLowerCase()));
      }
    }
    if (matched) {
      update.sub_item_id = matched.id;
    }
  }

  // --- metric 字段 ---
  if (firstUnit.metric && typeof firstUnit.metric === 'object') {
    if (existingRecord.metric_value == null && firstUnit.metric.value != null) {
      update.metric_value = firstUnit.metric.value;
    }
    if (!existingRecord.metric_unit && firstUnit.metric.unit) {
      update.metric_unit = firstUnit.metric.unit;
    }
    if (!existingRecord.metric_name && firstUnit.metric.name) {
      update.metric_name = firstUnit.metric.name;
    }
  }

  // --- cost ---
  if (existingRecord.cost == null && firstUnit.cost != null) {
    update.cost = firstUnit.cost;
  }

  // --- duration_minutes ---
  if (existingRecord.duration_minutes == null && firstUnit.duration_minutes != null) {
    update.duration_minutes = firstUnit.duration_minutes;
  }

  // --- mood ---
  if (!existingRecord.mood && firstUnit.mood) {
    update.mood = firstUnit.mood;
  }

  // --- energy ---
  if (!existingRecord.energy && firstUnit.energy) {
    update.energy = firstUnit.energy;
  }

  // --- location ---
  if (!existingRecord.location && firstUnit.location) {
    update.location = firstUnit.location;
  }

  // --- people ---
  if ((!existingRecord.people || (Array.isArray(existingRecord.people) && existingRecord.people.length === 0))
      && Array.isArray(firstUnit.people) && firstUnit.people.length > 0) {
    update.people = firstUnit.people;
  }

  // --- parsed_semantic ---
  if (!existingRecord.parsed_semantic) {
    update.parsed_semantic = firstUnit;
  } else {
    // 已有 parsed_semantic 时，补充 reasoning 和 risk_level
    const existingParsed = existingRecord.parsed_semantic as Record<string, unknown>;
    const patchParsed: Record<string, unknown> = {};
    if (!existingParsed.reasoning && firstUnit.reasoning) patchParsed.reasoning = firstUnit.reasoning;
    if (!existingParsed.risk_level && firstUnit.risk_level) patchParsed.risk_level = firstUnit.risk_level;
    if (Object.keys(patchParsed).length > 0) {
      update.parsed_semantic = { ...existingParsed, ...patchParsed };
    }
  }

  // --- time_anchor_date ---
  if (!existingRecord.time_anchor_date && firstUnit.time_anchor) {
    const resolvedDate = resolveTimeAnchorDate(firstUnit.time_anchor, date);
    if (resolvedDate) {
      update.time_anchor_date = resolvedDate;
    }
  }

  // --- 规律/历史字段 ---
  if (firstUnit.is_period_rule && !existingRecord.is_period_rule) {
    update.is_period_rule = true;
    if (firstUnit.period_frequency) update.period_frequency = firstUnit.period_frequency;
    if (firstUnit.period_start_date && !existingRecord.period_start_date) update.period_start_date = firstUnit.period_start_date;
    if (firstUnit.period_end_date && !existingRecord.period_end_date) update.period_end_date = firstUnit.period_end_date;
  }
  if (firstUnit.data_nature && !existingRecord.data_nature) {
    update.data_nature = firstUnit.data_nature;
  }

  // --- 歧义检测（按优先级：共享时长 > 子项归属 > 事项归属 > 低置信度） ---
  const issues: ClarificationIssue[] = [];

  // 优先级1：共享时长
  const sharedDuration = firstUnit.shared_context?.find(
    (sc: SharedContextItem) => sc.field === 'duration_minutes'
  );
  if (sharedDuration) {
    issues.push({
      type: 'shared_duration',
      unitIndex: 0,
      message: `"${sharedDuration.raw}"无法确定如何分配`,
      reason: `原话中"${sharedDuration.raw}"无法确定属于哪个子行动`,
      sharedContext: sharedDuration,
    });
  }

  // 优先级2：子项归属歧义（metric_name 匹配到多个子项）
  if (!existingRecord.sub_item_id && !update.sub_item_id && (update.item_id || existingRecord.item_id)) {
    const targetItemId = (update.item_id as string) || existingRecord.item_id;
    const metricName = firstUnit.metric?.name || (update.metric_name as string | undefined);
    if (metricName) {
      const needle = metricName.toLowerCase();
      const subsUnderItem = (subItems ?? []).filter(s => s.item_id === targetItemId);
      const matchedSubs = subsUnderItem.filter(s =>
        s.title.toLowerCase().includes(needle) || needle.includes(s.title.toLowerCase())
      );
      if (matchedSubs.length > 1) {
        issues.push({
          type: 'sub_item_ambiguous',
          unitIndex: 0,
          message: `"${metricName}"属于哪个子项？`,
          reason: `"${metricName}"同时匹配到${matchedSubs.map(s => '"' + s.title + '"').join('和')}两个子项`,
          options: matchedSubs.map(s => ({ label: s.title, value: s.id })),
        });
      }
    }
  }

  // 优先级3：事项归属缺失
  if (!existingRecord.item_id && !update.item_id && !firstUnit.item_hint) {
    issues.push({
      type: 'item_missing',
      unitIndex: 0,
      message: `未匹配到事项`,
      reason: 'AI未能从输入中识别出关联的事项名称',
      options: items.slice(0, 5).map(i => ({ label: i.title, value: i.id })),
    });
  }

  // 优先级4：模糊输入分类（fuzzy_category）
  if (firstUnit.fuzzy_category) {
    const fuzzyTypeMap: Record<string, 'fuzzy_unintelligible' | 'fuzzy_insufficient' | 'fuzzy_unreasonable'> = {
      unintelligible: 'fuzzy_unintelligible',
      insufficient_info: 'fuzzy_insufficient',
      unreasonable: 'fuzzy_unreasonable',
    };
    const fuzzyMessageMap: Record<string, string> = {
      unintelligible: '无法理解你的输入，请补充更多信息',
      insufficient_info: '信息不足，建议补充关键信息',
      unreasonable: '内容过多或存在冲突，建议拆分或改写',
    };
    issues.push({
      type: fuzzyTypeMap[firstUnit.fuzzy_category],
      unitIndex: 0,
      message: fuzzyMessageMap[firstUnit.fuzzy_category] || '输入模糊，需要确认',
      reason: firstUnit.fuzzy_hint || 'AI判断输入属于模糊类别',
    });
  }

  // 优先级5：高风险记录（risk_level=high）
  if (issues.length === 0 && firstUnit.risk_level === 'high') {
    issues.push({
      type: 'high_risk',
      unitIndex: 0,
      message: '此输入错误代价较高，需要确认',
      reason: '内容涉及历史概括/批量推断，自动处理可能导致数据失真',
    });
  }

  // 优先级5.5：中风险记录（risk_level=medium）——候选确认
  // 中风险：信息有一定模糊性但不严重，给出AI推测的候选结果让用户确认
  if (issues.length === 0 && firstUnit.risk_level === 'medium') {
    issues.push({
      type: 'medium_risk',
      unitIndex: 0,
      message: 'AI推测结果可能不完全准确',
      reason: firstUnit.reasoning || '输入有一定模糊性，AI归类可能需要确认',
      options: items.slice(0, 3).map(i => ({ label: i.title, value: i.id })),
    });
  }

  // 优先级6：低置信度（仅当前五种都不触发时）
  if (issues.length === 0 && result.parsed.confidence < 0.7) {
    const guessFields = firstUnit.field_confidence
      ? Object.entries(firstUnit.field_confidence)
          .filter(([, v]) => v === 'guess')
          .map(([k]) => k)
      : [];
    if (guessFields.length > 0 || !firstUnit.action) {
      issues.push({
        type: 'low_confidence',
        unitIndex: 0,
        message: '部分信息AI不太确定',
        reason: '输入过于模糊，AI无法准确识别关键字段',
      });
    }
  }

  // --- 如果有歧义，写入 needs_clarification 标记并返回 ---
  if (issues.length > 0) {
    // 回写无争议的字段
    const safeUpdate = { ...update };
    delete safeUpdate.duration_minutes; // 共享时长时不自动回写
    delete safeUpdate.sub_item_id; // 子项歧义时不自动回写

    // 模糊输入中 unintelligible 和 unreasonable 阻断自动落地，仅 insufficient_info 允许低精度落地
    const isFuzzyBlocked = firstUnit.fuzzy_category === 'unintelligible' || firstUnit.fuzzy_category === 'unreasonable';
    if (isFuzzyBlocked) {
      // 不回写任何语义字段，只标记需要澄清
      const fieldsToRemove = ['type_hint', 'item_id', 'sub_item_id', 'metric_value', 'metric_unit', 'metric_name', 'cost', 'duration_minutes'];
      fieldsToRemove.forEach(f => delete safeUpdate[f]);
    }

    // 写入 needs_clarification 标记 + 降级信息
    const existingParsed = (existingRecord.parsed_semantic as Record<string, unknown>) ?? {};
    safeUpdate.parsed_semantic = {
      ...existingParsed,
      needs_clarification: true,
      clarification_issues: issues,
      ...(fallbackInfo ? { fallback: fallbackInfo } : {}),
    };

    if (Object.keys(safeUpdate).length > 0) {
      await supabase
        .from('records')
        .update(safeUpdate)
        .eq('id', recordId)
        .eq('user_id', userId);
    }

    return {
      recordId,
      recordIds: [recordId],
      issues,
      timestamp: Date.now(),
      originalInput: content,
    };
  }

  // --- 无歧义：正常回写 ---
  // 降级模式下也写入降级信息到 parsed_semantic
  if (fallbackInfo && !update.parsed_semantic) {
    const existingParsed = (existingRecord.parsed_semantic as Record<string, unknown>) ?? {};
    update.parsed_semantic = {
      ...existingParsed,
      fallback: fallbackInfo,
    };
  }

  // 执行更新
  if (Object.keys(update).length > 0) {
    await supabase
      .from('records')
      .update(update)
      .eq('id', recordId)
      .eq('user_id', userId);
  }

  return null;
}

/**
 * 从 AI 解析的 time_anchor 中解析出目标日期
 */
function resolveTimeAnchorDate(
  anchor: NonNullable<ParsedSemantic['time_anchor']>,
  baseDate: string
): string | null {
  // 如果 AI 已经给出 resolved_date 且非空，直接使用
  if (anchor.resolved_date) return anchor.resolved_date;

  // 否则基于 direction 和 raw 文本解析
  const base = new Date(baseDate);
  base.setHours(0, 0, 0, 0);

  const anchors: Array<{ keywords: string[]; offsetDays: number }> = [
    { keywords: ['前天'], offsetDays: -2 },
    { keywords: ['昨天', '昨日'], offsetDays: -1 },
    { keywords: ['今天', '今日', '当天'], offsetDays: 0 },
    { keywords: ['明天', '明日'], offsetDays: 1 },
    { keywords: ['后天'], offsetDays: 2 },
    { keywords: ['大后天'], offsetDays: 3 },
    { keywords: ['上周', '上礼拜'], offsetDays: -7 },
    { keywords: ['下周', '下礼拜'], offsetDays: 7 },
    { keywords: ['上个月'], offsetDays: -30 },
    { keywords: ['下个月'], offsetDays: 30 },
  ];

  const raw = anchor.raw || '';
  for (const { keywords, offsetDays } of anchors) {
    for (const kw of keywords) {
      if (raw.includes(kw)) {
        const target = new Date(base);
        target.setDate(target.getDate() + offsetDays);
        return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
      }
    }
  }

  // 匹配 "X月Y号/日" 格式
  const dateMatch = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]);
    const day = parseInt(dateMatch[2]);
    const target = new Date(base.getFullYear(), month - 1, day);
    // 如果目标日期比 base 小超过半年，可能是明年
    if (target.getMonth() < base.getMonth() - 5) {
      target.setFullYear(target.getFullYear() + 1);
    }
    return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
  }

  return null;
}
