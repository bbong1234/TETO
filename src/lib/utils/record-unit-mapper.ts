import type { CreateRecordPayload } from '@/types/teto';

/**
 * record-unit-mapper.ts — TETO 1.6
 * 从 AI 解析的 unit 对象提取 DB 字段（共享于客户端和服务端）
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function shiftDate(baseDate: string, days: number): string {
  const d = new Date(`${baseDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inferTimeFromText(timeText: string): { hour: number; minute: number } | null {
  const m = timeText.match(/(\d{1,2})(?:\s*[:：点时]\s*(\d{1,2}))?/);
  if (m) {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      const lower = timeText.toLowerCase();
      if ((lower.includes('下午') || lower.includes('晚上') || lower.includes('夜里')) && hour < 12) {
        hour += 12;
      }
      if (lower.includes('中午') && hour < 11) {
        hour += 12;
      }
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { hour, minute };
      }
    }
  }
  if (timeText.includes('早上') || timeText.includes('上午')) return { hour: 9, minute: 0 };
  if (timeText.includes('中午')) return { hour: 12, minute: 0 };
  if (timeText.includes('下午')) return { hour: 15, minute: 0 };
  if (timeText.includes('傍晚')) return { hour: 18, minute: 0 };
  if (timeText.includes('晚上') || timeText.includes('夜里') || timeText.includes('今晚')) return { hour: 20, minute: 0 };
  return null;
}

export function inferAnchorDateFromTimeText(baseDate: string, timeText: string | null | undefined): string | null {
  if (!timeText) return null;
  const t = timeText.trim();
  if (!t) return null;
  if (t.includes('大后天')) return shiftDate(baseDate, 3);
  if (t.includes('后天')) return shiftDate(baseDate, 2);
  if (t.includes('明天') || t.includes('明早') || t.includes('明晚')) return shiftDate(baseDate, 1);
  if (t.includes('今天') || t.includes('今晚') || t.includes('今日')) return baseDate;
  if (t.includes('昨天') || t.includes('昨晚') || t.includes('昨日')) return shiftDate(baseDate, -1);
  if (t.includes('前天')) return shiftDate(baseDate, -2);
  return null;
}

/**
 * 时间归属优先级（唯一主逻辑源，inputs POST/answer 与 skip 均经此函数）：
 * 1) 已明确的 occurred_at
 * 2) time_anchor_date（显式）
 * 3) time_text 经 inferAnchorDateFromTimeText 相对 fallbackDate 推断的锚点日期
 * 4) 同句多 unit 的锚点继承在 classify-input 写入 proposed 后再进此函数
 * 5) duration_minutes + occurred_at → 推导 occurred_at_end
 */
export function resolveTemporalFields(
  fallbackDate: string,
  normalizedType: CreateRecordPayload['type'],
  proposed: Record<string, unknown>
): {
  recordDate: string;
  anchorDate: string | null;
  occurredAt: string | null;
  occurredAtEnd: string | null;
} {
  const occurredAtRaw = typeof proposed.occurred_at === 'string' ? proposed.occurred_at : null;
  const occurredAt =
    occurredAtRaw && !Number.isNaN(new Date(occurredAtRaw).getTime())
      ? occurredAtRaw
      : null;

  const occurredDate = occurredAt && occurredAt.includes('T') ? occurredAt.slice(0, 10) : null;
  const anchorDateRaw =
    typeof proposed.time_anchor_date === 'string' ? proposed.time_anchor_date : null;
  const inferredAnchorDate = inferAnchorDateFromTimeText(
    fallbackDate,
    typeof proposed.time_text === 'string' ? proposed.time_text : null
  );
  const anchorDate = anchorDateRaw ?? inferredAnchorDate;

  let occurredAtComputed: string | null = occurredAt;
  if (!occurredAtComputed && normalizedType === '发生' && anchorDate) {
    const hm = inferTimeFromText(typeof proposed.time_text === 'string' ? proposed.time_text : '');
    if (hm) {
      occurredAtComputed = `${anchorDate}T${pad2(hm.hour)}:${pad2(hm.minute)}:00+08:00`;
    }
  }

  const occurredAtEndRaw = typeof proposed.occurred_at_end === 'string' ? proposed.occurred_at_end : null;
  let occurredAtEnd =
    occurredAtEndRaw && !Number.isNaN(new Date(occurredAtEndRaw).getTime())
      ? occurredAtEndRaw
      : null;

  if (!occurredAtEnd && occurredAtComputed) {
    const duration = Number(proposed.duration_minutes);
    if (Number.isFinite(duration) && duration > 0) {
      const start = new Date(occurredAtComputed);
      if (!Number.isNaN(start.getTime())) {
        occurredAtEnd = new Date(start.getTime() + duration * 60_000).toISOString();
      }
    }
  }

  const recordDate =
    occurredDate ??
    (occurredAtComputed?.includes('T') ? occurredAtComputed.slice(0, 10) : null) ??
    (normalizedType === '发生' && anchorDate ? anchorDate : fallbackDate);

  return { recordDate, anchorDate, occurredAt: occurredAtComputed, occurredAtEnd };
}

export function buildUnitFields(unit: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  // time anchor -> date fields（用于“昨天/明天”这类回填）
  const timeAnchor = unit.time_anchor as { resolved_date?: string } | null | undefined;
  if (typeof timeAnchor?.resolved_date === 'string' && timeAnchor.resolved_date) {
    fields.time_anchor_date = timeAnchor.resolved_date;
  }

  // time_text + time_anchor_date -> occurred_at（事件记录可落到准确日期）
  const timeTextForOccurred =
    typeof unit.time_text === 'string' && unit.time_text
      ? unit.time_text
      : null;
  if (timeTextForOccurred && typeof fields.time_anchor_date === 'string') {
    const hm = inferTimeFromText(timeTextForOccurred);
    if (hm) {
      fields.occurred_at = `${fields.time_anchor_date}T${pad2(hm.hour)}:${pad2(hm.minute)}:00+08:00`;
    }
  }

  // occurred_at / occurred_at_end（若 AI 返回了计算后的 datetime，按原样保留）
  if (typeof unit.occurred_at === 'string' && unit.occurred_at) {
    const d = new Date(unit.occurred_at);
    if (!Number.isNaN(d.getTime())) fields.occurred_at = unit.occurred_at;
  }
  if (typeof unit.occurred_at_end === 'string' && unit.occurred_at_end) {
    const d = new Date(unit.occurred_at_end);
    if (!Number.isNaN(d.getTime())) fields.occurred_at_end = unit.occurred_at_end;
  }

  // location
  if (typeof unit.location === 'string' && unit.location) fields.location = unit.location;
  else if (typeof unit.place_text === 'string' && unit.place_text) fields.location = unit.place_text;

  // people
  if (Array.isArray(unit.people) && unit.people.length > 0) fields.people = unit.people;

  // mood / energy
  if (typeof unit.mood === 'string' && unit.mood) fields.mood = unit.mood;
  if (typeof unit.energy === 'string' && unit.energy) fields.energy = unit.energy;

  // cost
  if (typeof unit.cost === 'number' && unit.cost > 0) fields.cost = unit.cost;
  else if (typeof unit.money_amount === 'number' && unit.money_amount > 0) fields.cost = unit.money_amount;

  // duration
  if (typeof unit.duration_minutes === 'number' && unit.duration_minutes > 0) fields.duration_minutes = unit.duration_minutes;

  // metric
  if (typeof unit.metric === 'object' && unit.metric !== null) {
    const m = unit.metric as Record<string, unknown>;
    if (m.value != null && typeof m.value === 'number') fields.metric_value = m.value;
    if (typeof m.unit === 'string' && m.unit) fields.metric_unit = m.unit;
    if (typeof m.name === 'string' && m.name) fields.metric_name = m.name;
  }

  // time fields
  if (typeof unit.time_text === 'string' && unit.time_text) fields.time_text = unit.time_text;
  if (typeof unit.time_precision === 'string' && ['exact', 'approx', 'fuzzy', 'unknown'].includes(unit.time_precision as string))
    fields.time_precision = unit.time_precision;

  // action/event/object
  if (typeof unit.action_text === 'string' && unit.action_text) fields.action_text = unit.action_text;
  if (typeof unit.event_text === 'string' && unit.event_text) fields.event_text = unit.event_text;
  if (typeof unit.object_text === 'string' && unit.object_text) fields.object_text = unit.object_text;

  // cause
  if (typeof unit.cause_text === 'string' && unit.cause_text) fields.cause_text = unit.cause_text;

  // result
  if (typeof unit.result_text === 'string' && unit.result_text) fields.result = unit.result_text;
  if (typeof unit.outcome_type === 'string' && ['done', 'progress', 'recovered', 'maintained', 'interrupted', 'stagnant', 'consumed', 'deviated', 'no_change'].includes(unit.outcome_type as string))
    fields.outcome_type = unit.outcome_type;
  if (typeof unit.outcome_direction === 'string' && ['positive', 'neutral', 'negative'].includes(unit.outcome_direction as string))
    fields.outcome_direction = unit.outcome_direction;

  // place
  if (typeof unit.place_type === 'string' && ['home', 'office', 'commuting', 'transport', 'shop', 'hospital', 'school', 'outdoor', 'online', 'other'].includes(unit.place_type as string))
    fields.place_type = unit.place_type;

  // money
  if (typeof unit.money_direction === 'string' && ['expense', 'income', 'none'].includes(unit.money_direction as string))
    fields.money_direction = unit.money_direction;

  // relation roles
  if (Array.isArray(unit.relation_roles) && unit.relation_roles.length > 0) fields.relation_roles = unit.relation_roles;

  // body state / money currency / status
  if (typeof unit.body_state === 'string' && unit.body_state) fields.body_state = unit.body_state;
  if (typeof unit.money_currency === 'string' && unit.money_currency) fields.money_currency = unit.money_currency;
  if (typeof unit.state === 'string' && unit.state) fields.status = unit.state;

  return fields;
}

/** 从 unit 生成标准化内容摘要（分段 · 分隔，避免无空格粘连） */
export function generateContentSummary(unit: Record<string, unknown>, fallback: string): string {
  const action = typeof unit.action_text === 'string' ? unit.action_text.trim() : '';
  const event = typeof unit.event_text === 'string' ? unit.event_text.trim() : '';
  const object = typeof unit.object_text === 'string' ? unit.object_text.trim() : '';
  const place = typeof unit.place_text === 'string' ? unit.place_text.trim() : (typeof unit.location === 'string' ? unit.location.trim() : '');
  const metric = typeof unit.metric === 'object' && unit.metric ? (unit.metric as Record<string, unknown>) : null;
  const metricStr =
    metric && metric.value != null && typeof metric.value === 'number'
      ? `${metric.value}${metric.unit || ''}${metric.name || ''}`
      : '';

  const parts: string[] = [];
  const pushPart = (s: string) => {
    const t = s.trim();
    if (!t) return;
    if (!parts.some((p) => p === t || p.includes(t) || t.includes(p))) parts.push(t);
  };

  if (action) pushPart(action);
  if (event && event !== action) pushPart(event);
  if (object) {
    const trivialMeet = (object === '会议' || object === '会') && /会|开会|会议/.test(action);
    if (!trivialMeet) pushPart(object);
  }
  if (place) pushPart(place);
  if (metricStr) pushPart(metricStr);

  return parts.length > 0 ? parts.join(' · ') : fallback;
}

/** 合并 parsed_semantic 与 proposed_fields 后生成入库 content，与列表摘要算法一致 */
export function resolveRecordContentSummary(
  proposedFields: Record<string, unknown>,
  parsedSemantic: unknown,
  fallbackChain: Array<string | null | undefined>
): string {
  const ps =
    parsedSemantic && typeof parsedSemantic === 'object'
      ? (parsedSemantic as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...ps, ...proposedFields };
  const fb =
    fallbackChain.map((s) => (typeof s === 'string' ? s.trim() : '')).find(Boolean) ?? '';
  return generateContentSummary(merged, fb);
}
