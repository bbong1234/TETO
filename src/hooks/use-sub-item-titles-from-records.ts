'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Record as TetoRecord } from '@/types/teto';

/** 从当日记录中提取 sub_item_id，批量拉取子项标题供时间线/快速切换展示 */
export function useSubItemTitlesFromRecords(records: TetoRecord[]): Map<string, string> {
  const itemIdsForSubItems = useMemo(() => {
    const ids = new Set<string>();
    for (const r of records) {
      if (r.item_id && r.sub_item_id) ids.add(r.item_id);
    }
    return [...ids];
  }, [records]);

  const [subItemTitles, setSubItemTitles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (itemIdsForSubItems.length === 0) {
      setSubItemTitles(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const next = new Map<string, string>();
      await Promise.all(
        itemIdsForSubItems.map(async (itemId) => {
          try {
            const res = await fetch(`/api/v2/sub-items?item_id=${itemId}`);
            const data = await res.json();
            if (!res.ok) return;
            for (const sub of data.data ?? []) {
              if (sub?.id && sub?.title) next.set(sub.id, sub.title);
            }
          } catch {
            /* ignore */
          }
        })
      );
      if (!cancelled) setSubItemTitles(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemIdsForSubItems.join('|')]);

  return subItemTitles;
}
