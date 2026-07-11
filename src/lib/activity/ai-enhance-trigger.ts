import type { Item, Record as TetoRecord } from '@/types/teto';
import type { ParsedSemantic } from '@/types/semantic';
import { genTraceId } from '@/lib/observability/id-registry';
import { jsonHeadersWithTrace, parseClientApiJson } from '@/lib/observability/client-request';
import { generateContentSummary } from '@/lib/utils/generate-content-summary';
import { matchByUserRules, matchItemSmart, matchPresetsByText, type UserRuleForMatch } from '@/lib/utils/item-match';
import { buildUnitUpdate } from '@/lib/activity/build-unit-update';
import { resolveTemporalFields } from '@/lib/utils/record-unit-mapper';

const QUICK_NOTE_AI_ATTRIBUTE_FIELDS = new Set([
  'mood',
  'energy',
  'body_state',
  'status',
  'location',
  'place_type',
  'people',
  'relation_roles',
  'cause_text',
  'result',
  'outcome_type',
  'outcome_direction',
  'object_text',
  'event_text',
  'action_text',
  'metric_name',
  'metric_value',
  'metric_unit',
  'money_direction',
  'money_currency',
  'cost',
  'duration_minutes',
  'parsed_semantic',
]);

/** 随手记的 AI 只补属性，不参与归属、类型和时间决策。 */
export function filterQuickNoteAiUpdate(
  update: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(update).filter(([field]) =>
      QUICK_NOTE_AI_ATTRIBUTE_FIELDS.has(field)
    )
  );
}

function resolveAnchorDate(rawAnchor: string, baseDate: string): string | null {
  const today = new Date(baseDate);
  if (rawAnchor.includes('明天')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (rawAnchor.includes('后天')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (rawAnchor.includes('昨天')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

export interface NewItemSuggestion {
  name: string;
  /** AI 推断的大类名（如「保险」），可为 null */
  categoryHint: string | null;
  /** AI 推断的职能动作（来自 action_text），可为 null */
  functionTagHint: string | null;
  recordId: string;
}

export interface TriggerAiEnhanceOptions {
  recordId: string;
  inputText: string;
  date: string;
  items: Item[];
  userRules?: UserRuleForMatch[];
  existingItemId?: string | null;
  onFieldsUpdated?: (patch: Record<string, unknown>, record?: TetoRecord) => void;
  onError?: (message: string) => void;
  /** AI 检测到输入中提到了一个系统里不存在的事项名，供 UI 弹确认气泡 */
  onNewItemSuggested?: (suggestion: NewItemSuggestion) => void;
  /** 随手记：只填结构化属性，不改 content / input_source */
  inputSource?: 'quick' | 'manual' | 'ai';
}

/**
 * 后台 AI 增强：解析自然语言并 PATCH 记录字段
 */
export async function triggerAiEnhance(options: TriggerAiEnhanceOptions): Promise<void> {
  const {
    recordId,
    inputText,
    date,
    items,
    userRules = [],
    existingItemId,
    onFieldsUpdated,
    onError,
    onNewItemSuggested,
    inputSource,
  } = options;

  const isQuickNote = inputSource === 'quick';

  const trimmed = inputText.trim();
  if (!trimmed) return;

  const traceId = genTraceId();
  const aiHdr = jsonHeadersWithTrace(traceId);

  try {
    let recentRecords: Array<{ id: string; content: string; date: string; type: string }> | undefined;
    try {
      const now = new Date();
      const threeDaysAgo = new Date(now);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const recentRes = await fetch(
        `/api/v2/records?date_from=${fmtDate(threeDaysAgo)}&date_to=${fmtDate(now)}`,
        { headers: { 'x-trace-id': traceId } }
      );
      if (recentRes.ok) {
        const recentJson = await recentRes.json();
        if (Array.isArray(recentJson.data)) {
          recentRecords = recentJson.data.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            content: r.content as string,
            date: r.date as string,
            type: r.type as string,
          }));
        }
      }
    } catch {
      /* ignore */
    }

    const parseRes = await fetch('/api/v2/parse', {
      method: 'POST',
      headers: aiHdr,
      body: JSON.stringify({
        input: trimmed,
        date,
        recent_records: recentRecords,
        items: items.map((i) => ({ id: i.id, title: i.title })),
      }),
    });
    if (!parseRes.ok) return;

    const parseJson = await parseRes.json();
    const env = parseClientApiJson(parseJson);
    const payload = env.data as {
      parsed: { units: Array<Record<string, unknown>>; confidence: number };
      type_hints: string[];
    } | undefined;
    if (!payload?.parsed) return;

    const unit = payload.parsed.units[0];
    if (!unit) return;

    const type_hints = payload.type_hints ?? [];
    let update = buildUnitUpdate(unit, type_hints[0]);
    update.parsed_semantic = unit;
    if (!isQuickNote) {
      update.input_source = 'ai';
    } else {
      update = filterQuickNoteAiUpdate(update);
    }

    let skipAiMatch = false;
    if (!isQuickNote && !existingItemId) {
      const presets = matchPresetsByText(trimmed, userRules);
      if (presets.isNoAssign) {
        skipAiMatch = true; // 命中 no_assign 规则：跳过一切分类建议
      } else {
        if (presets.itemId) {
          update.item_id = presets.itemId;
        }
        if (presets.functionTagId) {
          update.tag_ids = [presets.functionTagId];
        }
        if (!presets.itemId) {
          const ruleItemId = matchByUserRules(trimmed, userRules);
          if (ruleItemId) {
            update.item_id = ruleItemId;
          }
        }
      }
    }

    if (!isQuickNote && !skipAiMatch && !update.item_id && !existingItemId) {
      const itemHint = typeof unit.item_hint === 'string' ? unit.item_hint.trim() : '';
      if (itemHint) {
        const matchResult = matchItemSmart(itemHint, items, trimmed);
        if (matchResult?.confidence === 'high') {
          update.item_id = matchResult.itemId;
          if (matchResult.subItemId) update.sub_item_id = matchResult.subItemId;
        } else if (matchResult?.confidence === 'medium') {
          // 中置信：写入 item_id 但保持 unchecked，触发记录卡片「可能是…」确认栏
          update.item_id = matchResult.itemId;
          if (matchResult.subItemId) update.sub_item_id = matchResult.subItemId;
        } else if (!matchResult && onNewItemSuggested) {
          // item_hint 有值但在现有事项中找不到匹配 → 建议用户创建新事项
          const actionText = typeof unit.action_text === 'string' ? unit.action_text.trim() || null : null;
          const categoryHint = typeof unit.category_hint === 'string' ? unit.category_hint.trim() || null : null;
          onNewItemSuggested({
            name: itemHint,
            categoryHint,
            functionTagHint: actionText,
            recordId,
          });
        }
      } else {
        const fallbackResult = matchItemSmart('', items, trimmed);
        if (fallbackResult?.confidence === 'high') {
          update.item_id = fallbackResult.itemId;
          if (fallbackResult.subItemId) update.sub_item_id = fallbackResult.subItemId;
        }
      }
    }

    // 有分类建议时保持 unchecked，等用户确认；纯字段增强不改动 review_status
    if (!isQuickNote && (update.item_id || update.tag_ids)) {
      update.review_status = 'unchecked';
    }

    if (!isQuickNote) {
      const aiSummary = generateContentSummary(unit as unknown as ParsedSemantic, trimmed);
      if (aiSummary && aiSummary !== trimmed) {
        update.content = aiSummary;
      }
    }

    if (!isQuickNote) {
      const timeText = typeof unit.time_text === 'string' ? unit.time_text : trimmed;
      const temporal = resolveTemporalFields(date, '发生', {
        ...unit,
        time_text: timeText,
      });
      if (temporal.anchorDate && !update.time_anchor_date) {
        update.time_anchor_date = temporal.anchorDate;
      }
      if (typeof unit.time_text === 'string' && unit.time_text) {
        update.time_text = unit.time_text;
      }
    }

    if (!isQuickNote && unit.time_anchor && typeof unit.time_anchor === 'object') {
      const anchor = unit.time_anchor as Record<string, unknown>;
      if (anchor.direction === 'future' || anchor.direction === 'past') {
        const rawAnchor = typeof anchor.raw === 'string' ? anchor.raw : '';
        const resolvedDate = resolveAnchorDate(rawAnchor, date);
        if (resolvedDate && resolvedDate !== date) {
          update.time_anchor_date = resolvedDate;
        }
      }
    }

    if (Object.keys(update).length === 0) return;

    const putRes = await fetch(`/api/v2/records/${recordId}`, {
      method: 'PUT',
      headers: aiHdr,
      body: JSON.stringify(update),
    });
    if (!putRes.ok) {
      onError?.(`AI 增强失败: ${putRes.status}`);
      return;
    }

    const putJson = await putRes.json();
    const updated = putJson.data as TetoRecord | undefined;
    onFieldsUpdated?.(update, updated);
  } catch (err) {
    onError?.(err instanceof Error ? err.message : 'AI 增强失败');
  }
}
