import type { CreateRecordPayload } from '@/types/teto';
import type { SemanticMetric } from '@/types/semantic';
import { buildUnitFields } from '@/lib/utils/record-unit-mapper';

type Unit = Record<string, unknown>;

function toMetricArray(unit: Unit): SemanticMetric[] | undefined {
  if (Array.isArray(unit.metrics)) {
    const arr = unit.metrics
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .map((m) => ({
        name: typeof m.name === 'string' ? m.name : '',
        unit: typeof m.unit === 'string' ? m.unit : '',
        value: typeof m.value === 'number' ? m.value : Number(m.value ?? 0),
      }))
      .filter((m) => !!m.name && !!m.unit && Number.isFinite(m.value));
    if (arr.length > 0) return arr;
  }

  if (unit.metric && typeof unit.metric === 'object') {
    const m = unit.metric as Record<string, unknown>;
    if (typeof m.name === 'string' && typeof m.unit === 'string' && typeof m.value === 'number') {
      return [{ name: m.name, unit: m.unit, value: m.value }];
    }
  }

  return undefined;
}

function inferOccurredAtEnd(unit: Unit, occurredAt?: string | null): string | undefined {
  if (typeof unit.occurred_at_end === 'string' && unit.occurred_at_end) {
    return unit.occurred_at_end;
  }
  if (!occurredAt || typeof unit.duration_minutes !== 'number' || unit.duration_minutes <= 0) return undefined;
  const start = new Date(occurredAt);
  if (Number.isNaN(start.getTime())) return undefined;
  const end = new Date(start.getTime() + unit.duration_minutes * 60_000);
  return end.toISOString();
}

/**
 * unit -> CreateRecordPayload 映射（P1 修复字段流失）
 * - 保留现有 metric_value/metric_unit/metric_name
 * - 新增映射 metrics[]
 * - 新增映射 occurred_at_end
 */
export function mapUnitToRecordPayload(
  unit: Unit,
  base: Pick<CreateRecordPayload, 'content' | 'date' | 'type'> & Partial<CreateRecordPayload>
): CreateRecordPayload {
  const fields = buildUnitFields(unit) as Partial<CreateRecordPayload>;
  const metrics = toMetricArray(unit);
  const occurredAtEnd = inferOccurredAtEnd(unit, base.occurred_at ?? null);

  const payload: CreateRecordPayload = {
    ...base,
    ...fields,
  };

  // 修复字段流失：metrics
  if (metrics && metrics.length > 0) {
    payload.metrics = metrics;
  }

  // 修复字段流失：occurred_at_end
  if (occurredAtEnd) {
    payload.occurred_at_end = occurredAtEnd;
  }

  // 兼容 metric 三件套（如果 unit.metric 提供）
  if (metrics && metrics[0]) {
    payload.metric_name = payload.metric_name ?? metrics[0].name;
    payload.metric_unit = payload.metric_unit ?? metrics[0].unit;
    payload.metric_value = payload.metric_value ?? metrics[0].value;
  }

  return payload;
}

