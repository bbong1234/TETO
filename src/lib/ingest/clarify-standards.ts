/**
 * 录入澄清准入标准（纯函数，供 classify-input 与单测使用）
 */
import { RULES } from '@/lib/rules';
import type { ClarificationIssue } from '@/types/semantic';
import type { RecordType } from '@/types/teto';

const VAGUE_VERBS = RULES.classification.vague_action_verbs;
const SUMMARY_CUES = RULES.classification.summary_discourse_cues;
const CONCRETE_ACTION_PATTERN = RULES.classification.concrete_action_pattern;

export function normalizeActionToken(text: string): string {
  return text.trim().replace(/(了|过|着|完)$/u, '');
}

export function isVagueActionText(actionText: string | null | undefined): boolean {
  if (!actionText?.trim()) return false;
  const core = normalizeActionToken(actionText);
  return VAGUE_VERBS.includes(core);
}

function isSubstantiveText(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const t = value.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return false;
  if (/^(上午|下午|晚上|中午|早上|傍晚|夜里|今天|昨天|明天)/.test(t) && t.length <= 8) return false;
  return t.length >= 2;
}

export function hasDistinctSemanticBeyondVagueAction(unit: Record<string, unknown>): boolean {
  const objectText = typeof unit.object_text === 'string' ? unit.object_text : '';
  const eventText = typeof unit.event_text === 'string' ? unit.event_text : '';
  if (isSubstantiveText(objectText) && !isVagueActionText(objectText)) return true;
  if (isSubstantiveText(eventText) && !isVagueActionText(eventText)) return true;

  const metric = unit.metric as Record<string, unknown> | null | undefined;
  if (metric && typeof metric.name === 'string' && metric.name.trim()) return true;

  const actionText = typeof unit.action_text === 'string' ? unit.action_text : '';
  if (actionText && CONCRETE_ACTION_PATTERN.test(actionText)) return true;
  if (objectText && CONCRETE_ACTION_PATTERN.test(objectText)) return true;
  if (eventText && CONCRETE_ACTION_PATTERN.test(eventText)) return true;

  return false;
}

export function shouldRaiseActionVague(unit: Record<string, unknown>): boolean {
  const actionText = typeof unit.action_text === 'string' ? unit.action_text : '';
  const legacyAction = typeof unit.action === 'string' ? unit.action : '';
  if (!actionText && !legacyAction) return false;
  if (!isVagueActionText(actionText || legacyAction)) return false;
  return !hasDistinctSemanticBeyondVagueAction(unit);
}

export function hasSummaryDiscourse(rawContent: string): boolean {
  return SUMMARY_CUES.some((cue) => rawContent.includes(cue));
}

export function hasConcreteActionInText(text: string): boolean {
  return CONCRETE_ACTION_PATTERN.test(text);
}

/** 想法/总结类记录不要求「核心动作」字段 */
export function recordTypeNeedsActionClarify(type: unknown): boolean {
  return type === '发生' || type === '计划';
}

/** 话语标记优先于 AI 默认「发生」：如「我觉得…」→ 想法 */
export function applyDiscourseTypeOverride(text: string, current: RecordType): RecordType {
  const t = text.trim();
  if (!t) return current;

  for (const kw of RULES.parsing.type_keywords.idea) {
    if (t.includes(kw)) return '想法';
  }
  for (const cue of SUMMARY_CUES) {
    if (t.includes(cue)) return '总结';
  }
  for (const kw of RULES.parsing.type_keywords.plan) {
    if (t.includes(kw)) return '计划';
  }
  return current;
}

export function resolveRecordTypeForUnit(params: {
  seedType?: string;
  typeHint?: string;
  fieldsType?: string;
  rawContent: string;
  unitText?: string;
}): RecordType {
  if (
    params.seedType &&
    (params.seedType === '发生' ||
      params.seedType === '计划' ||
      params.seedType === '想法' ||
      params.seedType === '总结')
  ) {
    return params.seedType;
  }
  const guard = guardRecordType({
    typeHint: params.typeHint,
    fieldsType: params.fieldsType,
    rawContent: params.rawContent,
    unitText: params.unitText,
  });
  const slice = params.unitText ?? params.rawContent;
  return applyDiscourseTypeOverride(slice, guard.type);
}

/** 规则纠正：具体动作 + 非总结性表述 → 发生 */
export function guardRecordType(params: {
  typeHint?: string;
  fieldsType?: string;
  rawContent: string;
  unitText?: string;
}): { type: RecordType; corrected: boolean; reason?: string } {
  const raw = params.rawContent;
  const unitSlice = params.unitText ?? raw;
  const hinted = params.typeHint ?? params.fieldsType ?? '发生';
  const normalized =
    hinted === '发生' || hinted === '计划' || hinted === '想法' || hinted === '总结'
      ? (hinted as RecordType)
      : '发生';

  if (normalized !== '总结') {
    return { type: normalized, corrected: false };
  }

  if (hasSummaryDiscourse(raw) || hasSummaryDiscourse(unitSlice)) {
    return {
      type: '想法',
      corrected: true,
      reason: '回顾性文本归为用户想法类型，建议归属日记或子项复盘',
    };
  }

  if (hasConcreteActionInText(unitSlice) || hasConcreteActionInText(raw)) {
    return {
      type: '发生',
      corrected: true,
      reason: '含具体动作且无明显总结性表述，规则纠正为发生',
    };
  }

  return { type: normalized, corrected: false };
}

export function buildItemMissingIssue(
  unitIndex: number,
  items: Array<{ id: string; title: string }>
): ClarificationIssue | null {
  if (items.length === 0) return null;
  return {
    type: 'item_missing',
    unitIndex,
    message: '这条记录要归到哪个事项？',
    reason: '未匹配到事项，请选择或跳过',
    options: items.slice(0, 12).map((it) => ({ label: it.title, value: it.id })),
  };
}

/** 复合句：阶段 A 仅全局拆分题；阶段 B 为各 unit 字段澄清 */
export function mergeClarificationIssues(
  allIssues: ClarificationIssue[],
  compoundConfirmIssue: ClarificationIssue | null
): ClarificationIssue[] {
  if (!compoundConfirmIssue) return allIssues;
  const phaseB = allIssues.filter(
    (i) => !(i.type === 'compound_uncertain' && i.unitIndex === -1)
  );
  return [compoundConfirmIssue, ...phaseB];
}

export function unitHasOpenClarification(
  issues: ClarificationIssue[],
  unitIndex: number
): boolean {
  return issues.some(
    (i) =>
      i.unitIndex === unitIndex ||
      (i.unitIndex === -1 && unitIndex === 0 && i.type === 'compound_uncertain')
  );
}
