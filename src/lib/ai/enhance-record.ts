/**
 * enhance-record.ts
 * 记录创建后的异步 AI 增强：
 * 1. 自动识别 item_hint 并归属事项
 * 2. 回写 AI 解析的结构化字段（metric/cost/duration/location/people/parsed_semantic/time_anchor_date）
 * 3. 通过规则中心管控写入，由 applyFieldOwnershipPolicy 处理字段归属
 */

import { parseSemantic } from './parse-semantic';
import { parseWithFallback, shouldFallback } from './parse-rules-fallback';
import { matchItemSmart } from '@/lib/utils/item-match';
import { buildUnitFields, generateContentSummary } from '@/lib/utils/record-unit-mapper';
import { createClient } from '@/lib/supabase/server';
import { RULES } from '@/lib/rules';
import { applyAiEnhancementSafely } from '@/lib/domain/record-ai-service';
import { createRecordSafely } from '@/lib/domain/record-service';
import { genDecisionId, genBehaviorId, genUnitId } from '@/lib/observability/id-registry';
import { logDecision, logItemMatch, logFieldChanges } from '@/lib/observability/decision-logger';
import { persistTraceSummary } from '@/lib/observability/trace';
import { createComponentLogger } from '@/lib/observability/logger';
import type { ParsedSemantic, ClarificationNeeded, ClarificationIssue, SharedContextItem, EnhanceResult } from '@/types/semantic';

const log = createComponentLogger('enhance-record');

/**
 * 对一条已保存的记录进行异步 AI 增强
 * - 调用 DeepSeek 解析语义
 * - 通过规则中心回写 AI 解析结果（字段归属策略自动处理覆写规则）
 * - 自动匹配 item_hint 并归属事项
 * - 检测歧义条件，有歧义时返回 ClarificationNeeded 供前端弹出澄清框
 */
export async function enhanceRecord(
  userId: string,
  recordId: string,
  content: string,
  date: string,
  traceId?: string,
  inputId?: string
): Promise<EnhanceResult> {
  genBehaviorId('B-004'); // enhanceRecord 入口追踪
  const supabase = await createClient();

  // 读取当前记录（用于安全网检查 + 事项匹配 + 发生时间推算）
  const { data: existingRecord } = await supabase
    .from('records')
    .select('item_id, sub_item_id, duration_minutes, occurred_at, occurred_at_end, time_precision, parsed_semantic')
    .eq('id', recordId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingRecord) return { clarification: null, compoundDetected: false, compoundUnitsCount: 0 };

  // 安全网：如果记录已有 parsed_semantic，说明已被客户端 enhanceWithAi 或
  // confirmSplitUnits 处理过，无需重复调用 DeepSeek（避免双重解析竞态）
  if (existingRecord.parsed_semantic) return { clarification: null, compoundDetected: false, compoundUnitsCount: 0 };

  // 获取用户事项列表（只取活跃/推进中的）
  const { data: items } = await supabase
    .from('items')
    .select('id, title')
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中', '放缓'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (!items || items.length === 0) {
    // 没有活跃事项时仍继续 AI 解析和结构化字段回写，仅跳过事项/子项匹配
  }
  const effectiveItems = items ?? [];

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

  // 调用语义解析（AI 失败时降级到本地规则兜底）
  let result;
  try {
    result = await parseSemantic(content, date, recentRecords, effectiveItems, subItems ?? undefined);
    genDecisionId('ENHANCE');
  } catch (err) {
    const reason = shouldFallback(err);
    genDecisionId('AI_FALLBACK');
    if (reason) {
      const fallback = parseWithFallback(content, date, effectiveItems, reason);
      result = { parsed: fallback.parsed, type_hints: fallback.type_hints };
    } else {
      return { clarification: null, compoundDetected: false, compoundUnitsCount: 0 };
    }
  }

  const firstUnit = result.parsed.units[0];
  if (!firstUnit) return { clarification: null, compoundDetected: false, compoundUnitsCount: 0 };

  // ──────────────────────────────────────────────────────
  // 构建 AI 更新载荷：所有 AI 提议的值，不做 OFFE 判断
  // 字段归属策略由 applyFieldOwnershipPolicy 在
  // applyAiEnhancementSafely 中统一处理
  // ──────────────────────────────────────────────────────
  const aiUpdate: Record<string, unknown> = {};

  // 复合句信号：如果 AI 返回多个 units，将信号存入 parsed_semantic 而非作为独立 DB 列
  const isCompound = result.parsed.is_compound && result.parsed.units.length > 1;

  // --- item_id：智能事项匹配（核心关键词验证，避免 AI 幻觉误归类） ---
  // 仅当现有 item_id 为空时才尝试匹配（性能优化，非 OFFE 逻辑）
  if (!existingRecord.item_id && firstUnit.item_hint) {
    const hint = firstUnit.item_hint.trim();
    const matchResult = matchItemSmart(hint, effectiveItems, content, subItems ?? undefined);
    if (matchResult && matchResult.confidence === 'high') {
      aiUpdate.item_id = matchResult.itemId;
      if (matchResult.subItemId) {
        aiUpdate.sub_item_id = matchResult.subItemId;
      }
    }
    // 5.2: 事项匹配决策日志
    if (matchResult) {
      logItemMatch(undefined, hint, matchResult.itemTitle, matchResult.matchType, matchResult.confidence);
    }
  }

  // --- sub_item_id：AI sub_item_hint 匹配子项（限定在已匹配的事项范围内） ---
  // 仅当现有 sub_item_id 为空时才尝试匹配（性能优化，非 OFFE 逻辑）
  const targetItemId4Sub = (aiUpdate.item_id as string) || existingRecord.item_id;
  let subItemAmbiguous: { label: string; value: string }[] | null = null;
  if (!existingRecord.sub_item_id && targetItemId4Sub) {
    const subsUnderItem = (subItems ?? []).filter(s => s.item_id === targetItemId4Sub);
    const action = firstUnit.action_text?.trim().toLowerCase() || '';
    const hint = typeof firstUnit.sub_item_hint === 'string' ? firstUnit.sub_item_hint.trim().toLowerCase() : '';
    const metricName = firstUnit.metric?.name || (aiUpdate.metric_name as string | undefined);
    const metricNeedle = metricName ? metricName.toLowerCase() : '';

    // 收集所有匹配的子项（用 filter 而非 find，检测歧义）
    const matchedSubs: Array<{ id: string; title: string; source: string }> = [];
    for (const s of subsUnderItem) {
      const sLower = s.title.toLowerCase();
      if (hint && sLower === hint) {
        matchedSubs.push({ id: s.id, title: s.title, source: 'exact_hint' });
      } else if (action && sLower.includes(action)) {
        matchedSubs.push({ id: s.id, title: s.title, source: 'action' });
      } else if (hint && (sLower.includes(hint) || hint.includes(sLower))) {
        matchedSubs.push({ id: s.id, title: s.title, source: 'hint_partial' });
      } else if (metricNeedle && (sLower.includes(metricNeedle) || metricNeedle.includes(sLower))) {
        matchedSubs.push({ id: s.id, title: s.title, source: 'metric' });
      }
    }

    const uniqueMatches = matchedSubs.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);

    if (uniqueMatches.length === 1) {
      aiUpdate.sub_item_id = uniqueMatches[0].id;
    } else if (uniqueMatches.length > 1) {
      subItemAmbiguous = uniqueMatches.map(m => ({ label: m.title, value: m.id }));
    } else if (subsUnderItem.length > 0) {
      subItemAmbiguous = subsUnderItem.map(s => ({ label: s.title, value: s.id }));
    }
  }

  // --- metric 字段 ---
  if (firstUnit.metric && typeof firstUnit.metric === 'object') {
    if (firstUnit.metric.value != null) aiUpdate.metric_value = firstUnit.metric.value;
    if (firstUnit.metric.unit) aiUpdate.metric_unit = firstUnit.metric.unit;
    if (firstUnit.metric.name) aiUpdate.metric_name = firstUnit.metric.name;
  }

  // --- cost ---
  if (firstUnit.cost != null) aiUpdate.cost = firstUnit.cost;

  // --- duration_minutes ---
  if (firstUnit.duration_minutes != null) aiUpdate.duration_minutes = firstUnit.duration_minutes;

  // --- 反向推算 occurred_at_end ---
  const effectiveDuration = (aiUpdate.duration_minutes as number | undefined) ?? (existingRecord.duration_minutes as number | null);
  const effectiveStart = (existingRecord.occurred_at as string | null);
  const alreadyHasEnd = !!(existingRecord.occurred_at_end);
  if (effectiveDuration && effectiveDuration > 0 && effectiveStart && !alreadyHasEnd) {
    try {
      const startDate = new Date(effectiveStart);
      if (!isNaN(startDate.getTime())) {
        const endDate = new Date(startDate.getTime() + effectiveDuration * 60 * 1000);
        aiUpdate.occurred_at_end = endDate.toISOString();
        if (!existingRecord.time_precision || existingRecord.time_precision === 'unknown') {
          aiUpdate.time_precision = 'approx';
        }
      }
    } catch { /* 解析失败不影响主流程 */ }
  }

  // --- mood ---
  if (firstUnit.mood) aiUpdate.mood = firstUnit.mood;

  // --- energy ---
  if (firstUnit.energy) aiUpdate.energy = firstUnit.energy;

  // --- location ---
  if (firstUnit.location) aiUpdate.location = firstUnit.location;

  // --- people ---
  if (Array.isArray(firstUnit.people) && firstUnit.people.length > 0) aiUpdate.people = firstUnit.people;

  // --- 三层九组结构化字段 ---
  if (firstUnit.action_text) aiUpdate.action_text = firstUnit.action_text;
  if (firstUnit.event_text) aiUpdate.event_text = firstUnit.event_text;
  if (firstUnit.object_text) aiUpdate.object_text = firstUnit.object_text;
  if (firstUnit.outcome_type) aiUpdate.outcome_type = firstUnit.outcome_type;
  if (firstUnit.outcome_direction) aiUpdate.outcome_direction = firstUnit.outcome_direction;
  if (firstUnit.cause_text) aiUpdate.cause_text = firstUnit.cause_text;
  if (firstUnit.time_text) aiUpdate.time_text = firstUnit.time_text;
  if (firstUnit.time_precision) aiUpdate.time_precision = firstUnit.time_precision;
  if (firstUnit.place_type) aiUpdate.place_type = firstUnit.place_type;
  if (firstUnit.money_direction) aiUpdate.money_direction = firstUnit.money_direction;
  if (Array.isArray(firstUnit.relation_roles) && firstUnit.relation_roles.length > 0) aiUpdate.relation_roles = firstUnit.relation_roles;

  // --- 1.5 录入结构对齐新增字段 ---
  if (firstUnit.body_state) aiUpdate.body_state = firstUnit.body_state;
  if (firstUnit.money_currency) aiUpdate.money_currency = firstUnit.money_currency;
  // result_text 映射到 result 列
  if (firstUnit.result_text) aiUpdate.result = firstUnit.result_text;
  // state 映射到 status 列
  if (firstUnit.state) aiUpdate.status = firstUnit.state;

  // --- parsed_semantic（AI 自有字段，需要特殊合并语义） ---
  // 不通过 applyFieldOwnershipPolicy 的 if_empty/never 规则处理，
  // 因为 parsed_semantic 有 JSONB 合并语义（复合句标记追加到已有数据）
  let parsedSemanticValue: Record<string, unknown> | null = null;
  if (!existingRecord.parsed_semantic) {
    const semanticData: Record<string, unknown> = { ...firstUnit };
    if (isCompound) {
      semanticData.compound_detected = true;
      semanticData.compound_units_count = result.parsed.units.length;
    }
    parsedSemanticValue = semanticData;
  } else if (isCompound) {
    // 已有 parsed_semantic 但需要追加复合句标记（合并语义，非覆写）
    const existingParsed = (existingRecord.parsed_semantic as Record<string, unknown>) ?? {};
    parsedSemanticValue = {
      ...existingParsed,
      compound_detected: true,
      compound_units_count: result.parsed.units.length,
    };
  }
  if (parsedSemanticValue) {
    aiUpdate.parsed_semantic = parsedSemanticValue;
  }

  // --- time_anchor_date ---
  if (firstUnit.time_anchor) {
    const resolvedDate = resolveTimeAnchorDate(firstUnit.time_anchor, date);
    if (resolvedDate) aiUpdate.time_anchor_date = resolvedDate;
  }

  // ──────────────────────────────────────────────────────
  // 歧义检测（按优先级：共享时长 > 子项归属 > 低置信度）
  // 检测逻辑保持不变
  // ──────────────────────────────────────────────────────
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

  // 优先级2：子项归属歧义
  if (subItemAmbiguous && subItemAmbiguous.length > 1) {
    issues.push({
      type: 'sub_item_ambiguous',
      unitIndex: 0,
      message: `属于哪个子项？`,
      reason: `同时匹配到${subItemAmbiguous.map(s => '"' + s.label + '"').join('和')}多个子项`,
      options: subItemAmbiguous,
    });
  }

  // 优先级3：低置信度（仅当前两种都不触发时）
  if (issues.length === 0 && result.parsed.confidence < RULES.fallback.low_confidence_threshold) {
    const guessFields = firstUnit.field_confidence
      ? Object.entries(firstUnit.field_confidence)
          .filter(([, v]) => v === 'guess')
          .map(([k]) => k)
      : [];
    if (guessFields.length > 0 || (!firstUnit.action_text && !firstUnit.action)) {
      issues.push({
        type: 'low_confidence',
        unitIndex: 0,
        message: '部分信息AI不太确定',
        reason: '输入过于模糊，AI无法准确识别关键字段',
      });
    }
  }

  // ──────────────────────────────────────────────────────
  // 写入路径：通过规则中心 applyAiEnhancementSafely
  // ──────────────────────────────────────────────────────

  // --- 如果有歧义，写入无争议字段 + needs_clarification 标记并返回 ---
  if (issues.length > 0) {
    // 回写无争议的字段（移除争议字段）
    const safeAiUpdate = { ...aiUpdate };
    delete safeAiUpdate.duration_minutes; // 共享时长时不自动回写
    delete safeAiUpdate.sub_item_id; // 子项歧义时不自动回写

    // 写入 needs_clarification 标记到 parsed_semantic
    // parsed_semantic 不走策略引擎（AI 自有字段的 JSONB 合并语义）
    const clarificationParsedSemantic: Record<string, unknown> = {
      ...(existingRecord.parsed_semantic as Record<string, unknown> ?? {}),
      needs_clarification: true,
      clarification_issues: issues,
    };
    // 从 safeAiUpdate 中取出 parsed_semantic（如果有），合并进去
    if (safeAiUpdate.parsed_semantic && typeof safeAiUpdate.parsed_semantic === 'object') {
      Object.assign(clarificationParsedSemantic, safeAiUpdate.parsed_semantic);
    }
    // parsed_semantic 不走策略引擎，直接加入 safeAiUpdate
    safeAiUpdate.parsed_semantic = clarificationParsedSemantic;

    if (Object.keys(safeAiUpdate).length > 0) {
      await applyAiEnhancementSafely({
        userId,
        recordId,
        aiUpdate: safeAiUpdate,
        supabase,
      });
      // 5.1: 增强前后字段对比日志
      logFieldChanges(undefined, recordId,
        Object.entries(safeAiUpdate).filter(([k]) => k !== 'parsed_semantic').map(([k, v]) => ({
          field: k, from: (existingRecord as unknown as Record<string, unknown>)[k], to: v,
        })),
        'ENHANCE_CLARIFY');
    }

    // 持久化 trace（歧义路径）
    if (traceId) {
      persistTraceSummary({
        supabase,
        userId,
        traceId,
        operation: 'record_enhance',
        status: 'partial',
      });
    }

    return {
      clarification: {
        cardType: issues.some(i => i.type === 'shared_duration')
          ? 'split'
          : issues.some(i => i.type === 'sub_item_ambiguous')
            ? 'attribution'
            : 'clarify',
        recordId,
        recordIds: [recordId],
        issues,
        timestamp: Date.now(),
        originalInput: content,
      },
      compoundDetected: isCompound,
      compoundUnitsCount: result.parsed.units.length,
    };
  }

  // --- 无歧义：通过规则中心正常回写 ---
  if (Object.keys(aiUpdate).length > 0) {
    await applyAiEnhancementSafely({
      userId,
      recordId,
      aiUpdate,
      supabase,
    });
    // 5.1: 增强前后字段对比日志
    logFieldChanges(undefined, recordId,
      Object.entries(aiUpdate).filter(([k]) => k !== 'parsed_semantic').map(([k, v]) => ({
        field: k, from: (existingRecord as unknown as Record<string, unknown>)[k], to: v,
      })),
      'ENHANCE');
  }

  // 持久化 trace（继承 POST 的 trace_id）
  if (traceId) {
    persistTraceSummary({
      supabase,
      userId,
      traceId,
      operation: 'record_enhance',
      status: 'ok',
    });
  }

  // --- 复合句拆分：为 units[1..n] 创建独立记录 ---
  const splitRecordIds: string[] = [];
  if (isCompound && inputId) {
    const batchId = crypto.randomUUID();
    const units = result.parsed.units;

    for (let i = 1; i < units.length; i++) {
      try {
        const unit = units[i] as unknown as Record<string, unknown>;
        const unitId = genUnitId(inputId, i);
        const summary = generateContentSummary(unit, '');
        const fields = buildUnitFields(unit);

        const createPayload: Record<string, unknown> = {
          content: summary || `（拆分 ${i + 1}/${units.length}）`,
          date,
          type: fields.type || '发生',
          input_id: unitId,
          parent_input_id: inputId,
          batch_id: batchId,
          parsed_semantic: unit,
          ...fields,
        };

        const splitResult = await createRecordSafely({
          userId,
          payload: createPayload as any,
          supabase,
        });

        if (splitResult.ok && splitResult.data) {
          const splitRecord = splitResult.data as unknown as Record<string, unknown>;
          if (splitRecord.id) {
            splitRecordIds.push(splitRecord.id as string);

            // 建立 derived_from 关联
            await supabase.from('record_links').insert({
              source_id: splitRecord.id,
              target_id: recordId,
              link_type: 'derived_from',
              user_id: userId,
            }).select('id').maybeSingle();
          }
        } else {
          log.error('拆分记录创建失败', {
            details: {
              unitIndex: i,
              errors: splitResult.errors.map(e => e.message).join('; '),
            },
          });
        }
      } catch (err) {
        log.error('拆分记录异常', {
          details: { unitIndex: i, error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    // 同时更新主记录的 batch_id
    try {
      const updatePayload: Record<string, unknown> = {
        batch_id: batchId,
        input_id: inputId,
      };
      await supabase.from('records').update(updatePayload).eq('id', recordId);
    } catch { /* 静默 */ }
  }

  return {
    clarification: null,
    compoundDetected: isCompound,
    compoundUnitsCount: result.parsed.units.length,
    splitRecordIds,
  };
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
