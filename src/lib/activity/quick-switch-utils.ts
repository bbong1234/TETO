import type { Record } from '@/types/teto';

export interface QuickSwitchEntry {
  key: string;
  category?: string;
  subcategory?: string;
  item_id?: string | null;
  content?: string;
  label: string;
}

/**
 * 从记录列表提取最近使用的分类/项目组合（去重，最多 limit 条）
 */
export function buildRecentSwitchEntries(records: Record[], limit = 10): QuickSwitchEntry[] {
  const seen = new Set<string>();
  const entries: QuickSwitchEntry[] = [];

  const sorted = [...records]
    .filter((r) => r.type === '发生' && (r.category || r.item_id || r.content))
    .sort((a, b) => {
      const ta = a.occurred_at || a.created_at;
      const tb = b.occurred_at || b.created_at;
      return tb.localeCompare(ta);
    });

  for (const r of sorted) {
    const key = `${r.category ?? ''}|${r.subcategory ?? ''}|${r.item_id ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const parts = [r.category, r.subcategory, r.item?.title, r.content].filter(Boolean);
    entries.push({
      key,
      category: r.category ?? undefined,
      subcategory: r.subcategory ?? undefined,
      item_id: r.item_id,
      content: r.content,
      label: parts.join(' / ') || r.content,
    });
    if (entries.length >= limit) break;
  }

  return entries;
}
