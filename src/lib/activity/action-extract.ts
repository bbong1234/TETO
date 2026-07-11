import type { Record as TetoRecord } from '@/types/teto';

/**
 * 从历史记录中提取唯一动作词（action_text），去重并按频次排序。
 * 用于在 /切换 选词面板中展示「最近动作」建议。
 */
export function extractActionWordsFromRecords(
  records: TetoRecord[],
  options?: {
    /** 只提取与指定 item_id 相关的动作 */
    itemId?: string | null;
    /** 最大返回数量，默认 10 */
    limit?: number;
  }
): string[] {
  const { itemId, limit = 10 } = options ?? {};
  const freq = new Map<string, number>();

  for (const r of records) {
    const word = r.action_text?.trim();
    if (!word) continue;
    if (itemId && r.item_id !== itemId) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}
