import type { Record as TetoRecord, Item } from '@/types/teto';
import { buildQuickSwitchLabel } from '@/lib/activity/item-tree';

export interface QuickSwitchEntry {
  key: string;
  item_id: string;
  sub_item_id: string | null;
  label: string;
  /** 同一 item+sub_item 下历史用过的 tool_label（去重，按最近优先） */
  contextToolLabels: string[];
}

function contextKey(r: Pick<TetoRecord, 'item_id' | 'sub_item_id'>) {
  return `${r.item_id}|${r.sub_item_id ?? ''}`;
}

/**
 * 从记录列表提取最近使用的标签路径（去重，最多 limit 条）。
 * 只要有过「发生」且挂了 item_id 即纳入；有 sub_item 时展示末两段（事项·子项）。
 */
export function buildRecentSwitchEntries(
  records: TetoRecord[],
  items: Item[] = [],
  limit = 10,
  subItemTitles?: ReadonlyMap<string, string>
): QuickSwitchEntry[] {
  const seen = new Set<string>();
  const contextTools = new Map<string, string[]>();
  const entries: QuickSwitchEntry[] = [];

  const sorted = [...records]
    .filter((r) => r.type === '发生' && r.item_id)
    .sort((a, b) => {
      const ta = a.occurred_at || a.created_at;
      const tb = b.occurred_at || b.created_at;
      return tb.localeCompare(ta);
    });

  for (const r of sorted) {
    const ck = contextKey(r);
    const tool = r.tool_label?.trim();
    if (tool) {
      const list = contextTools.get(ck) ?? [];
      if (!list.includes(tool)) list.push(tool);
      contextTools.set(ck, list);
    }
  }

  for (const r of sorted) {
    const key = contextKey(r);
    if (seen.has(key)) continue;

    const label = buildQuickSwitchLabel(items, {
      itemId: r.item_id,
      subItemId: r.sub_item_id,
      subItemTitles,
    });
    if (!label) continue;

    seen.add(key);
    entries.push({
      key,
      item_id: r.item_id!,
      sub_item_id: r.sub_item_id ?? null,
      label,
      contextToolLabels: contextTools.get(key) ?? [],
    });
    if (entries.length >= limit) break;
  }

  return entries;
}
