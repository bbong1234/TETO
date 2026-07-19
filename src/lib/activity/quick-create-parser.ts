import { inferTimeFromText } from '@/lib/utils/record-unit-mapper';

export interface QuickCreateHints {
  cost?: number;
  moneyDirection?: 'expense' | 'income';
  durationMinutes?: number;
  bodyState?: string;
  timePrecision?: 'exact' | 'fuzzy';
}

const BODY_STATE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:有点|有些|很|特别)?(?:疲惫|疲劳|疲)/, '累'],
  [/(?:有点|有些|很|特别)?累/, '累'],
  [/(?:有点|有些|很|特别)?困/, '困'],
  [/(?:有点|有些|很|特别)?饿/, '饿'],
  [/(?:头疼|头痛)/, '头疼'],
  [/(?:没精神|无精打采)/, '没精神'],
];

/**
 * 随手记的本地确定性解析。
 * 仅处理不需要模型理解、可由明确文字稳定判断的字段。
 */
export function parseQuickCreateHints(text: string): QuickCreateHints {
  const hints: QuickCreateHints = {};

  const costMatch =
    text.match(/¥\s*(\d+(?:\.\d+)?)/) ??
    text.match(/(\d+(?:\.\d+)?)\s*元/) ??
    text.match(/(\d+(?:\.\d+)?)\s*块/);
  if (costMatch) hints.cost = parseFloat(costMatch[1]);
  if (costMatch) {
    hints.moneyDirection = /(收入|收到|赚(?:了)?|报销|退款|返现|到账)/.test(text)
      ? 'income'
      : 'expense';
  }

  const hrMatch = text.match(/(\d+(?:\.\d+)?)\s*小时/);
  const minMatch = text.match(/(\d+)\s*分钟/) ?? text.match(/(\d+)\s*min/i);
  if (hrMatch) hints.durationMinutes = Math.round(parseFloat(hrMatch[1]) * 60);
  else if (minMatch) hints.durationMinutes = parseInt(minMatch[1], 10);

  for (const [pattern, state] of BODY_STATE_PATTERNS) {
    if (pattern.test(text)) {
      hints.bodyState = state;
      break;
    }
  }

  if (inferTimeFromText(text)) {
    hints.timePrecision = /(\d{1,2})(?:\s*[:：点时]|\s*(?:am|pm)\b)/i.test(text)
      ? 'exact'
      : 'fuzzy';
  }

  return hints;
}
