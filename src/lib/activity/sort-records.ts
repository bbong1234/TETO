import type { Record } from '@/types/teto';

/** 从 time_text 提取时间段排序权重（0-23） */
function getTimeTextWeight(timeText: string | null | undefined): number {
  if (!timeText) return 12;
  const lower = timeText.toLowerCase();
  if (lower.includes('凌晨') || lower.includes('深夜')) return 0;
  if (lower.includes('早上') || lower.includes('早晨') || lower.includes('清晨') || lower.includes('上午')) return 8;
  if (lower.includes('中午') || lower.includes('午饭') || lower.includes('午休')) return 12;
  if (lower.includes('下午')) return 15;
  if (lower.includes('傍晚') || lower.includes('黄昏')) return 18;
  if (lower.includes('晚上') || lower.includes('夜晚') || lower.includes('夜里') || lower.includes('晚饭')) return 20;
  const hourMatch = timeText.match(/(\d{1,2})\s*点/);
  if (hourMatch) {
    let h = parseInt(hourMatch[1]);
    if (h <= 12 && (lower.includes('下午') || lower.includes('晚上'))) h += 12;
    return h;
  }
  return 12;
}

function getPlanSortKey(record: Record): string {
  if (record.occurred_at) return record.occurred_at;
  const dateStr = record.time_anchor_date || record.created_at;
  const weight = getTimeTextWeight(record.time_text);
  return `${dateStr}T${String(weight).padStart(2, '0')}:00:00`;
}

/**
 * 客户端排序：发生/想法/总结从晚到早，计划从早到晚，同 batch 聚合。
 */
export function sortRecords(rawRecords: Record[]): Record[] {
  const batchMap = new Map<string, Record[]>();
  const standalone: Record[] = [];
  for (const r of rawRecords) {
    if (r.batch_id) {
      if (!batchMap.has(r.batch_id)) batchMap.set(r.batch_id, []);
      batchMap.get(r.batch_id)!.push(r);
    } else {
      standalone.push(r);
    }
  }

  const batchSortKey = new Map<
    string,
    {
      occurred_at: string | null;
      created_at: string;
      type: string;
      time_text: string | null;
      time_anchor_date: string | null;
    }
  >();

  for (const [batchId, group] of batchMap) {
    const isPlan = group[0]?.type === '计划';
    if (isPlan) {
      group.sort((a, b) => getPlanSortKey(a).localeCompare(getPlanSortKey(b)));
    } else {
      group.sort((a, b) => {
        const aTime = a.occurred_at || a.created_at;
        const bTime = b.occurred_at || b.created_at;
        return bTime.localeCompare(aTime);
      });
    }
    const keyRecord = group[0];
    const withTime = group.find((r) => r.occurred_at && r.time_precision !== 'inherited');
    batchSortKey.set(batchId, {
      occurred_at: withTime?.occurred_at || null,
      created_at: keyRecord.created_at,
      type: keyRecord.type,
      time_text: keyRecord.time_text ?? null,
      time_anchor_date: keyRecord.time_anchor_date ?? null,
    });
  }

  type SortUnit = {
    sortKey: {
      occurred_at: string | null;
      created_at: string;
      type: string;
      time_text: string | null;
      time_anchor_date: string | null;
    };
    records: Record[];
  };
  const units: SortUnit[] = [];

  for (const r of standalone) {
    units.push({
      sortKey: {
        occurred_at: r.occurred_at,
        created_at: r.created_at,
        type: r.type,
        time_text: r.time_text ?? null,
        time_anchor_date: r.time_anchor_date ?? null,
      },
      records: [r],
    });
  }
  for (const [batchId, group] of batchMap) {
    units.push({ sortKey: batchSortKey.get(batchId)!, records: group });
  }

  units.sort((a, b) => {
    const aIsPlan = a.sortKey.type === '计划';
    const bIsPlan = b.sortKey.type === '计划';
    if (aIsPlan !== bIsPlan) return aIsPlan ? -1 : 1;

    if (aIsPlan && bIsPlan) {
      const aKey = a.sortKey.occurred_at
        ? a.sortKey.occurred_at
        : `${a.sortKey.time_anchor_date || a.sortKey.created_at}T${String(getTimeTextWeight(a.sortKey.time_text)).padStart(2, '0')}:00:00`;
      const bKey = b.sortKey.occurred_at
        ? b.sortKey.occurred_at
        : `${b.sortKey.time_anchor_date || b.sortKey.created_at}T${String(getTimeTextWeight(b.sortKey.time_text)).padStart(2, '0')}:00:00`;
      return aKey.localeCompare(bKey);
    }

    const aTime = a.sortKey.occurred_at || a.sortKey.created_at;
    const bTime = b.sortKey.occurred_at || b.sortKey.created_at;
    return bTime.localeCompare(aTime);
  });

  return units.flatMap((u) => u.records);
}
