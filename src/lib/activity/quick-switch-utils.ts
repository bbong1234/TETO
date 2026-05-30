import type { Record as TetoRecord, Item } from '@/types/teto';
import { buildQuickSwitchLabel } from '@/lib/activity/item-tree';

export interface QuickSwitchEntry {
  key: string;
  item_id: string;
  sub_item_id: string;
  content?: string;
  label: string;
  /** 同一 item+sub_item 下历史用过的 tool_label（去重，按最近优先） */
  contextToolLabels: string[];
}

function contextKey(r: Pick<TetoRecord, 'item_id' | 'sub_item_id'>) {
  return `${r.item_id}|${r.sub_item_id}`;
}

/**
 * 从记录列表提取最近使用的「事项+子项」组合（去重，最多 limit 条）。
 * 无 sub_item_id 或子项名称未加载完成的记录会被跳过。
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
    .filter((r) => r.type === '发生' && r.item_id && r.sub_item_id)
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
      sub_item_id: r.sub_item_id!,
      content: r.content,
      label,
      contextToolLabels: contextTools.get(key) ?? [],
    });
    if (entries.length >= limit) break;
  }

  return entries;
}
