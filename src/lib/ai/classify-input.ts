/**
 * classify-input.ts — TETO 1.6 入库前 AI 清分
 *
 * 核心原则：AI 判断必须发生在正式入库前。
 * 此函数只做分析不做写入，返回分类结果供 POST handler 决策。
 *
 * 流程：
 *   1. 调用 parseSemantic（DeepSeek AI 解析）
 *   2. 匹配事项/子项
 *   3. 构建字段映射提案
 *   4. 歧义检测
 *   5. 返回 ClassificationResult
 */

import { parseSemantic, type ParseSemanticResult } from './parse-semantic';
import { parseWithFallback, shouldFallback } from './parse-rules-fallback';
import { matchItemSmart } from '@/lib/utils/item-match';
import { buildUnitFields, generateContentSummary } from '@/lib/utils/record-unit-mapper';
import { createClient } from '@/lib/supabase/server';
import { RULES } from '@/lib/rules';
import { getActiveRulesByType } from '@/lib/db/user-rules';
import type { UserRule } from '@/lib/db/user-rules';
import { createComponentLogger } from '@/lib/observability/logger';
import { genDecisionId, DECISION_TYPES } from '@/lib/observability/id-registry';
import type {
  ParsedSemantic,
  ClarificationIssue,
  ClarificationNeeded,
  SharedContextItem,
  ClassificationResult,
  UnitFieldProposal,
  DecisionRecord,
} from '@/types/semantic';

const log = createComponentLogger('classify-input');

/**
 * 模型未标 is_compound 时，用语义线索提示「可能该拆成多条」。
 * 典型：工作会议/时长叙述 + 独立的「花了…买」（例8 类），模型偶发合并为一条。
 */
function heuristicLikelyMultiEvent(content: string): boolean {
  const t = content.trim();
  if (t.length < 22) return false;
  const spendThenBuy = /花了\s*\d+[^\n，。]{0,40}(买|买了)/.test(t);
  if (!spendThenBuy) return false;
  const activityCue =
    /(开会|会议|开了\s*\d+|讨论|复盘)/.test(t) ||
    (/小时|分钟/.test(t) && /(公司|同事|客户)/.test(t));
  return activityCue;
}

function shiftDate(baseDate: string, days: number): string {
  const d = new Date(`${baseDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inferAnchorDateFromTimeText(baseDate: string, timeText: string | null | undefined): string | null {
  if (!timeText) return null;
  const t = timeText.trim();
  if (!t) return null;
  if (t.includes('大后天')) return shiftDate(baseDate, 3);
  if (t.includes('后天')) return shiftDate(baseDate, 2);
  if (t.includes('明天') || t.includes('明早') || t.includes('明晚')) return shiftDate(baseDate, 1);
  if (t.includes('今天') || t.includes('今晚') || t.includes('今日')) return baseDate;
  if (t.includes('昨天') || t.includes('昨晚') || t.includes('昨日')) return shiftDate(baseDate, -1);
  if (t.includes('前天')) return shiftDate(baseDate, -2);
  return null;
}

/**
 * 对用户原始输入进行 AI 清分（不入库）
 *
 * @param content — 必须是用户原文（与 records.raw_input 一致），勿传入摘要或规则切碎后的替代串
 * @returns ClassificationResult — 包含是否可入库、需确认的问题、字段映射提案
 */
export async function classifyInput(
  userId: string,
  content: string,
  date: string,
  traceId?: string
): Promise<ClassificationResult> {
  const supabase = await createClient();

  // ── 1. 获取用户事项和子项（用于匹配） ──
  const { data: items } = await supabase
    .from('items')
    .select('id, title')
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中', '放缓'])
    .order('created_at', { ascending: false })
    .limit(50);

  const effectiveItems = items ?? [];

  const { data: subItems } = await supabase
    .from('sub_items')
    .select('id, title, item_id')
    .eq('user_id', userId);

  // ── 1b. 获取用户学习规则（用于增强匹配）──
  let itemMappingRules: UserRule[] = [];
  let subItemMappingRules: UserRule[] = [];
  try {
    [itemMappingRules, subItemMappingRules] = await Promise.all([
      getActiveRulesByType(userId, 'item_mapping'),
      getActiveRulesByType(userId, 'sub_item_mapping'),
    ]);
  } catch {
    /* 规则获取失败不影响主流程 */
  }

  // ── 2. 获取近期记录（供 AI 上下文） ──
  let recentRecords: Array<{ id: string; content: string; date: string; type: string }> | undefined;
  try {
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  } catch {
    /* 获取近期记录失败不影响主流程 */
  }

  // ── 3. 语义解析 ──
  let result: ParseSemanticResult;
  try {
    result = await parseSemantic(content, date, recentRecords, effectiveItems, subItems ?? undefined);
  } catch (err) {
    const reason = shouldFallback(err);
    if (reason) {
      const fallback = parseWithFallback(content, date, effectiveItems, reason);
      result = { parsed: fallback.parsed, type_hints: fallback.type_hints, thinking: [], violations: [], degraded: false };
    } else {
      // 完全无法解析 → 返回澄清卡片
      return {
        needsConfirmation: true,
        clarification: {
          cardType: 'clarify',
          recordId: '',
          recordIds: [],
          issues: [
            {
              type: 'low_confidence',
              unitIndex: 0,
              message: 'AI 无法理解输入内容',
              reason: '输入过于模糊或格式不兼容，请重新表述',
            },
          ],
          timestamp: Date.now(),
          originalInput: content,
        },
        isCompound: false,
        unitsCount: 0,
        unitProposals: [],
        decisions: [],
        rawParsed: null,
      };
    }
  }

  const units = result.parsed.units;
  if (!units || units.length === 0) {
    return {
      needsConfirmation: true,
      clarification: {
        cardType: 'clarify',
        recordId: '',
        recordIds: [],
        issues: [
          {
            type: 'low_confidence',
            unitIndex: 0,
            message: 'AI 未能识别有效内容',
            reason: '输入可能过短或无法提取结构化信息',
          },
        ],
        timestamp: Date.now(),
        originalInput: content,
      },
      isCompound: false,
      unitsCount: 0,
      unitProposals: [],
      decisions: [],
      rawParsed: null,
    };
  }

  const isCompound = result.parsed.is_compound && units.length > 1;
  const rawParsed = result.parsed as unknown as Record<string, unknown>;

  // ── 4. 决策记录 ──
  const decisions: DecisionRecord[] = [];
  if (isCompound) {
    decisions.push({
      decisionId: genDecisionId('SPLIT'),
      type: 'DEC-SPLIT',
      unitIndex: -1,
      explain: `复合句拆分为 ${units.length} 个独立单元`,
      detail: { unitsCount: units.length, confidence: result.parsed.confidence },
    });
  }

  // ── 5. 逐 unit 构建字段映射提案 ──
  const unitProposals: UnitFieldProposal[] = [];
  const allIssues: ClarificationIssue[] = [];
  const explicitAnchors = new Set<string>();
  let inheritedAnchorDate: string | null = null;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i] as unknown as Record<string, unknown>;
    const fields = buildUnitFields(unit);
    const contentSummary = generateContentSummary(unit, content);
    const anchorFromSemantic =
      typeof (unit.time_anchor as { resolved_date?: unknown } | null)?.resolved_date === 'string'
        ? ((unit.time_anchor as { resolved_date?: string }).resolved_date ?? null)
        : null;
    const anchorFromText = inferAnchorDateFromTimeText(
      date,
      typeof unit.time_text === 'string' ? unit.time_text : null
    );
    const explicitAnchor = anchorFromSemantic || anchorFromText;
    if (explicitAnchor) {
      fields.time_anchor_date = explicitAnchor;
      inheritedAnchorDate = explicitAnchor;
      explicitAnchors.add(explicitAnchor);
    } else if ((isCompound || units.length > 1) && inheritedAnchorDate && !fields.time_anchor_date) {
      // 同一次解析多 unit：后续 unit 继承首个明确锚点（不限于 is_compound 标记）
      fields.time_anchor_date = inheritedAnchorDate;
      fields.time_precision = fields.time_precision || 'inherited';
    }

    // ── 事项匹配 ──
    const itemHint = typeof unit.item_hint === 'string' ? unit.item_hint.trim() : '';
    let matchedItemId: string | undefined;
    let matchedSubItemId: string | undefined;
    let itemMatchAmbiguous: { itemId: string; itemTitle: string } | null = null;

    if (itemHint && effectiveItems.length > 0) {
      const matchResult = matchItemSmart(itemHint, effectiveItems, content, subItems ?? undefined);
      if (matchResult && matchResult.confidence === 'high') {
        matchedItemId = matchResult.itemId;
        fields.item_id = matchedItemId;
        if (matchResult.subItemId) {
          matchedSubItemId = matchResult.subItemId;
          fields.sub_item_id = matchedSubItemId;
        }
        decisions.push({
          decisionId: genDecisionId('ITEM'),
          type: 'DEC-ITEM',
          unitIndex: i,
          explain: matchResult.explain || `"${itemHint}" 匹配事项 ${matchResult.itemTitle}`,
          detail: { itemId: matchResult.itemId, itemTitle: matchResult.itemTitle, matchType: matchResult.matchType, subItemId: matchResult.subItemId },
        });
      } else if (matchResult && matchResult.confidence === 'medium') {
        // 中等置信度：暂不写入 item_id，记录候选供歧义检测
        itemMatchAmbiguous = { itemId: matchResult.itemId, itemTitle: matchResult.itemTitle };
      }
    }

    // ── 用户学习规则匹配（TETO 1.6）──
    // 当标准匹配未产生高置信结果时，尝试用户自定义/学习的规则
    if (!matchedItemId && itemMappingRules.length > 0) {
      const searchText = (itemHint || content).toLowerCase();
      for (const rule of itemMappingRules) {
        if (searchText.includes(rule.trigger_pattern.toLowerCase())) {
          const targetItem = effectiveItems.find(it => it.id === rule.target_id);
          if (targetItem) {
            matchedItemId = rule.target_id!;
            fields.item_id = matchedItemId;
            decisions.push({
              decisionId: genDecisionId('ITEM'),
              type: 'DEC-ITEM',
              unitIndex: i,
              explain: `用户规则匹配: "${rule.trigger_pattern}" → ${targetItem.title}`,
              detail: {
                itemId: rule.target_id,
                itemTitle: targetItem.title,
                matchType: 'user_rule',
                ruleId: rule.id,
                ruleConfidence: rule.confidence,
              },
            });
            break;
          }
        }
      }
    }

    // ── 用户学习规则：子项匹配（TETO 1.6）──
    if (!matchedSubItemId && matchedItemId && subItemMappingRules.length > 0) {
      const searchText = (itemHint || content).toLowerCase();
      for (const rule of subItemMappingRules) {
        if (
          rule.target_type === 'sub_item' &&
          searchText.includes(rule.trigger_pattern.toLowerCase())
        ) {
          const subsUnderItem = (subItems ?? []).filter(
            s => s.item_id === matchedItemId && s.id === rule.target_id
          );
          if (subsUnderItem.length > 0) {
            matchedSubItemId = rule.target_id!;
            fields.sub_item_id = matchedSubItemId;
            decisions.push({
              decisionId: genDecisionId('ITEM'),
              type: 'DEC-ITEM',
              unitIndex: i,
              explain: `用户规则匹配子项: "${rule.trigger_pattern}" → ${subsUnderItem[0].title}`,
              detail: {
                subItemId: rule.target_id,
                matchType: 'user_rule',
                ruleId: rule.id,
              },
            });
            break;
          }
        }
      }
    }

    // ── 子项匹配 ──
    let subItemAmbiguous: { label: string; value: string }[] | null = null;
    if (!matchedSubItemId && matchedItemId) {
      const subsUnderItem = (subItems ?? []).filter(s => s.item_id === matchedItemId);
      const action = typeof unit.action_text === 'string' ? unit.action_text.trim().toLowerCase() : '';
      const hint = typeof unit.sub_item_hint === 'string' ? unit.sub_item_hint.trim().toLowerCase() : '';

      const matchedSubs: Array<{ id: string; title: string }> = [];
      for (const s of subsUnderItem) {
        const sLower = s.title.toLowerCase();
        if (hint && sLower === hint) matchedSubs.push({ id: s.id, title: s.title });
        else if (action && sLower.includes(action)) matchedSubs.push({ id: s.id, title: s.title });
        else if (hint && (sLower.includes(hint) || hint.includes(sLower)))
          matchedSubs.push({ id: s.id, title: s.title });
      }

      const uniqueMatches = matchedSubs.filter((m, idx, arr) => arr.findIndex(x => x.id === m.id) === idx);
      if (uniqueMatches.length === 1) {
        matchedSubItemId = uniqueMatches[0].id;
        fields.sub_item_id = matchedSubItemId;
      } else if (uniqueMatches.length > 1) {
        subItemAmbiguous = uniqueMatches.map(m => ({ label: m.title, value: m.id }));
      }
    }

    // ── 歧义检测 ──
    // 共享时长（仅复合句时检测）
    if (isCompound) {
      const sharedDuration = (unit.shared_context as SharedContextItem[] | undefined)?.find(
        (sc: SharedContextItem) => sc.field === 'duration_minutes'
      );
      if (sharedDuration) {
        allIssues.push({
          type: 'shared_duration',
          unitIndex: i,
          message: `"${sharedDuration.raw}"无法确定如何分配`,
          reason: `原话中"${sharedDuration.raw}"无法确定属于哪个子行动`,
          sharedContext: sharedDuration,
        });
      }
    }

    // 子项归属歧义
    if (subItemAmbiguous && subItemAmbiguous.length > 1) {
      allIssues.push({
        type: 'sub_item_ambiguous',
        unitIndex: i,
        message: '属于哪个子项？',
        reason: `同时匹配到${subItemAmbiguous.map(s => '"' + s.label + '"').join('和')}多个子项`,
        options: subItemAmbiguous,
      });
    }

    // 事项归属不明确（AI 有提示但仅中等置信度）
    if (!matchedItemId && itemMatchAmbiguous) {
      allIssues.push({
        type: 'item_ambiguous',
        unitIndex: i,
        message: `"${itemMatchAmbiguous.itemTitle}"是正确归类吗？`,
        reason: `AI 建议关联事项"${itemMatchAmbiguous.itemTitle}"，但未在输入中找到核心关键词，请确认`,
        options: [{ label: itemMatchAmbiguous.itemTitle, value: itemMatchAmbiguous.itemId }],
      });
    }

    // 核心动作无法识别（主谓宾不完整）
    if (
      allIssues.filter(iss => iss.unitIndex === i).length === 0 &&
      !unit.action_text && !(unit as Record<string, unknown>).action
    ) {
      allIssues.push({
        type: 'parse_uncertain',
        unitIndex: i,
        message: 'AI 未能识别核心动作',
        reason: '输入可能缺少明确的主谓宾结构，请补充动作描述（如"跑步"、"看书"）',
      });
    }

    // mood/cause 边界模糊（"因为太累所以没跑步" → mood还是cause?）
    if (
      allIssues.filter(iss => iss.unitIndex === i).length === 0 &&
      (typeof unit.mood === 'string' || typeof unit.body_state === 'string') &&
      typeof unit.cause_text === 'string'
    ) {
      allIssues.push({
        type: 'boundary_blur',
        unitIndex: i,
        message: '情绪状态与原因边界模糊',
        reason: `AI 同时识别到情绪/身体状态和原因（"${unit.cause_text}"），可能存在边界模糊，请确认归类是否正确`,
      });
    }

    // 低置信度（整体置信度低于阈值 + 有 guess 字段）
    if (
      allIssues.filter(iss => iss.unitIndex === i).length === 0 &&
      result.parsed.confidence < RULES.fallback.low_confidence_threshold
    ) {
      const guessFields = (unit.field_confidence as Record<string, string> | undefined)
        ? Object.entries(unit.field_confidence as Record<string, string>)
            .filter(([, v]) => v === 'guess')
            .map(([k]) => k)
        : [];
      if (guessFields.length > 0) {
        allIssues.push({
          type: 'low_confidence',
          unitIndex: i,
          message: '部分信息AI不太确定',
          reason: `以下字段AI推测置信度较低: ${guessFields.join('、')}`,
        });
      }
    }

    // ── 决策：DEC-TYPE（记录类型） ──
    const typeHint = result.type_hints?.[i];
    const inferredType = (fields.type as string) || typeHint || '发生';
    if (typeHint) {
      decisions.push({
        decisionId: genDecisionId('TYPE'),
        type: 'DEC-TYPE',
        unitIndex: i,
        explain: `AI 识别类型为"${inferredType}"`,
        detail: { type: inferredType, source: 'ai_hint' },
      });
    }

    // ── 决策：DEC-TIME（时间识别） ──
    if (fields.time_text || fields.time_anchor_date || fields.time_precision) {
      decisions.push({
        decisionId: genDecisionId('TIME'),
        type: 'DEC-TIME',
        unitIndex: i,
        explain: fields.time_anchor_date
          ? `时间锚点解析为 ${fields.time_anchor_date}`
          : `识别到时间信息`,
        detail: { timeText: fields.time_text, timeAnchor: fields.time_anchor_date, precision: fields.time_precision },
      });
    }

    // ── 决策：DEC-AMOUNT（金额/数量识别） ──
    if (fields.cost != null || fields.metric_value != null || fields.duration_minutes != null) {
      const amounts: string[] = [];
      if (fields.cost != null) amounts.push(`金额=${fields.cost}`);
      if (fields.metric_value != null) amounts.push(`指标=${fields.metric_value}${fields.metric_unit || ''}`);
      if (fields.duration_minutes != null) amounts.push(`时长=${fields.duration_minutes}min`);
      decisions.push({
        decisionId: genDecisionId('AMOUNT'),
        type: 'DEC-AMOUNT',
        unitIndex: i,
        explain: `识别到量化数据: ${amounts.join(', ')}`,
        detail: { cost: fields.cost, metricValue: fields.metric_value, durationMinutes: fields.duration_minutes },
      });
    }

    unitProposals.push({
      unitIndex: i,
      contentSummary,
      fields,
      itemId: matchedItemId,
      subItemId: matchedSubItemId,
    });
  }

  if (isCompound && explicitAnchors.size > 1) {
    allIssues.push({
      type: 'compound_uncertain',
      unitIndex: -1,
      message: '同一句里出现了多个互斥日期（如昨天/今天），请确认如何保存',
      reason: `检测到冲突时间锚点：${Array.from(explicitAnchors).join('、')}`,
    });
  }

  // ── 5a. 启发式复合：未标 compound 但文本像「活动 + 独立消费」
  if (!isCompound && units.length === 1 && heuristicLikelyMultiEvent(content)) {
    allIssues.push({
      type: 'compound_uncertain',
      unitIndex: 0,
      message:
        '这段话里可能有多件独立的事（例如工作会议与单独买东西）。若要拆成多条，请先取消本次录入，再分两行分别提交；也可先保存为一条。',
      reason: '启发式：活动/时长叙述与独立「花了…买」并存',
    });
  }

  // ── 5b. 复合句：始终要求用户先确认是否拆分入库（并且仅问这一题）
  const conflictAnchorIssue =
    allIssues.find((issue) => issue.type === 'compound_uncertain' && issue.unitIndex === -1) ?? null;
  const compoundConfirmIssue: ClarificationIssue | null =
    isCompound && units.length > 1
      ? {
          type: 'compound_uncertain',
          unitIndex: -1,
          message: conflictAnchorIssue?.message ?? `检测到 ${units.length} 条独立事件，确认后分别保存`,
          reason:
            conflictAnchorIssue?.reason ??
            `AI 已将输入拆分为 ${units.length} 个独立单元，需要你确认是否分别入库`,
        }
      : null;

  const finalIssues: ClarificationIssue[] = compoundConfirmIssue
    ? [compoundConfirmIssue]
    : allIssues;

  // ── 6. 判定是否需要确认 ──
  if (finalIssues.length > 0) {
    // DEC-ADMISSION: 拒绝入库
    decisions.push({
      decisionId: genDecisionId('ADMISSION'),
      type: 'DEC-ADMISSION',
      unitIndex: -1,
      explain: `拒绝入库：存在 ${finalIssues.length} 个待确认问题`,
      detail: { issueTypes: finalIssues.map(i => i.type), issuesCount: finalIssues.length },
    });

    return {
      needsConfirmation: true,
      clarification: {
        cardType: finalIssues.some(i => i.type === 'shared_duration')
          ? 'split'
          : finalIssues.some(i => i.type === 'sub_item_ambiguous')
            ? 'attribution'
            : 'clarify',
        recordId: '',
        recordIds: [],
        issues: finalIssues,
        timestamp: Date.now(),
        originalInput: content,
      },
      isCompound,
      unitsCount: units.length,
      unitProposals,
      decisions,
      rawParsed,
    };
  }

  // ── 7. 可入库 ──
  // DEC-ADMISSION: 允许入库
  decisions.push({
    decisionId: genDecisionId('ADMISSION'),
    type: 'DEC-ADMISSION',
    unitIndex: -1,
    explain: `允许入库：${units.length} 个单元通过清分`,
    detail: { unitsCount: units.length, confidence: result.parsed.confidence },
  });

  return {
    needsConfirmation: false,
    clarification: null,
    isCompound,
    unitsCount: units.length,
    unitProposals,
    decisions,
    rawParsed,
  };
}
