import type { Item, Record as TetoRecord } from '@/types/teto';
import { resolveCategoryTitleForItem } from '@/lib/activity/item-tree';

export interface StructuredField {
  label: string;
  value: string;
}

export function collectStructuredFields(
  record: TetoRecord,
  items?: Item[]
): StructuredField[] {
  const fields: StructuredField[] = [];
  const categoryTitle = items
    ? resolveCategoryTitleForItem(items, record.item_id)
    : null;

  const isRedundantWithCategory = (value: string, label: string) => {
    if (!categoryTitle || value !== categoryTitle) return false;
    return label === '动作' || label === '事件' || label === '对象';
  };

  const push = (label: string, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || isRedundantWithCategory(trimmed, label)) return;
    if (fields.some((field) => field.label === label && field.value === trimmed)) return;
    fields.push({ label, value: trimmed });
  };

  push('动作', record.action_text);
  push('事件', record.event_text);
  push('对象', record.object_text);
  push('地点', record.location);
  push('原因', record.cause_text);
  push('结果', record.result);
  push('心情', record.mood);
  push('能量', record.energy);
  push('身体', record.body_state);

  if (record.cost != null && record.cost > 0) {
    fields.push({ label: '金额', value: `¥${record.cost}` });
  }

  if (record.metric_value != null && !Number.isNaN(record.metric_value)) {
    const unit = record.metric_unit?.trim() ?? '';
    const name = record.metric_name?.trim();
    fields.push({
      label: name || '进度',
      value: `${record.metric_value}${unit ? ` ${unit}` : ''}`,
    });
  }

  if (record.people && record.people.length > 0) {
    fields.push({ label: '人物', value: record.people.join('、') });
  }

  const fnTags =
    record.tags?.filter((t) => t.type === 'function').map((t) => t.name) ?? [];
  if (fnTags.length > 0) {
    push('动作', fnTags.join('、'));
  }

  return fields;
}
