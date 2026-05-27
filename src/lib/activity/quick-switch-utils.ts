import type { Record as TetoRecord, Item } from '@/types/teto';
import { buildRecordDisplayLabel } from '@/lib/activity/item-tree';

export interface QuickSwitchEntry {
  key: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  content?: string;
  label: string;
}

/**
 * 从记录列表提取最近使用的 item 组合（去重，最多 limit 条）
 */
export function buildRecentSwitchEntries(
  records: TetoRecord[],
  items: Item[] = [],
  limit = 10
): QuickSwitchEntry[] {
  const seen = new Set<string>();
  const entries: QuickSwitchEntry[] = [];

  const sorted = [...records]
    .filter((r) => r.type === '发生' && (r.item_id || r.content))
    .sort((a, b) => {
      const ta = a.occurred_at || a.created_at;
      const tb = b.occurred_at || b.created_at;
      return tb.localeCompare(ta);
    });

  for (const r of sorted) {
    const key = `${r.item_id ?? ''}|${r.sub_item_id ?? ''}|${r.content ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      key,
      item_id: r.item_id,
      sub_item_id: r.sub_item_id,
      content: r.content,
      label: buildRecordDisplayLabel(r, items) || r.content,
    });
    if (entries.length >= limit) break;
  }

  return entries;
}
