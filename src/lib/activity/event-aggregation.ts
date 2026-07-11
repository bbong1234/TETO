import type { ActivityEvent, Record as TetoRecord } from '@/types/teto';
import { collectStructuredFields, type StructuredField } from './structured-fields';

/** 从事件流聚合结构化字段（不覆盖，追加展示） */
export function collectStructuredFieldsFromEvents(
  record: TetoRecord,
  events: ActivityEvent[],
  items?: import('@/types/teto').Item[]
): StructuredField[] {
  const base = collectStructuredFields(record, items);
  const seen = new Set(base.map((f) => `${f.label}:${f.value}`));

  const append: StructuredField[] = [];

  for (const ev of events) {
    if (ev.event_type === 'progress' || ev.event_type === 'milestone') {
      const label = ev.event_type === 'milestone' ? '里程碑' : '进度';
      const key = `${label}:${ev.content}`;
      if (ev.content.trim() && !seen.has(key)) {
        seen.add(key);
        append.push({ label, value: ev.content.trim() });
      }
    } else if (ev.event_type === 'structured') {
      const payload = ev.payload as Record<string, string | undefined>;
      for (const [label, value] of Object.entries(payload)) {
        if (!value?.trim()) continue;
        const key = `${label}:${value}`;
        if (!seen.has(key)) {
          seen.add(key);
          append.push({ label, value: value.trim() });
        }
      }
    }
  }

  return [...base, ...append];
}

/** 检测 milestone 关键词 */
export function detectMilestone(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = ['完成', '搞定', '做完了', '实现了', '上线', '交付', 'finished', 'done'];
  return patterns.some((p) => lower.includes(p));
}

/** 从用户输入推断事件类型 */
export function inferEventTypeFromInput(
  text: string,
  typeHint?: string
): 'progress' | 'milestone' | 'idea' | 'plan' {
  if (typeHint === '想法') return 'idea';
  if (typeHint === '计划') return 'plan';
  if (detectMilestone(text)) return 'milestone';
  return 'progress';
}
