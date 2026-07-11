/**
 * 从 AI 解析 unit 构建记录更新载荷
 */
export function buildUnitUpdate(
  unit: Record<string, unknown>,
  typeHint: string | undefined,
  batchId?: string
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (typeof unit.location === 'string' && unit.location) update.location = unit.location;
  else if (typeof unit.place_text === 'string' && unit.place_text) update.location = unit.place_text;
  if (Array.isArray(unit.people) && unit.people.length > 0) update.people = unit.people;
  if (typeof unit.mood === 'string' && unit.mood) update.mood = unit.mood;
  if (typeof unit.energy === 'string' && unit.energy) update.energy = unit.energy;
  if (typeof unit.cost === 'number' && unit.cost > 0) update.cost = unit.cost;
  else if (typeof unit.money_amount === 'number' && unit.money_amount > 0) update.cost = unit.money_amount;
  if (typeof unit.duration_minutes === 'number' && unit.duration_minutes > 0) {
    update.duration_minutes = unit.duration_minutes;
  }
  if (typeHint && ['发生', '计划', '想法', '总结'].includes(typeHint)) {
    update.type = typeHint;
  }
  if (batchId) update.batch_id = batchId;

  if (typeof unit.time_text === 'string' && unit.time_text) update.time_text = unit.time_text;
  if (
    typeof unit.time_precision === 'string' &&
    ['exact', 'approx', 'fuzzy', 'unknown'].includes(unit.time_precision)
  ) {
    update.time_precision = unit.time_precision;
  }
  if (typeof unit.action_text === 'string' && unit.action_text) update.action_text = unit.action_text;
  if (typeof unit.event_text === 'string' && unit.event_text) update.event_text = unit.event_text;
  if (typeof unit.object_text === 'string' && unit.object_text) update.object_text = unit.object_text;
  if (typeof unit.cause_text === 'string' && unit.cause_text) update.cause_text = unit.cause_text;
  if (typeof unit.result_text === 'string' && unit.result_text) update.result = unit.result_text;
  if (
    typeof unit.outcome_type === 'string' &&
    ['done', 'progress', 'recovered', 'maintained', 'interrupted', 'stagnant', 'consumed', 'deviated', 'no_change'].includes(
      unit.outcome_type
    )
  ) {
    update.outcome_type = unit.outcome_type;
  }
  if (
    typeof unit.outcome_direction === 'string' &&
    ['positive', 'neutral', 'negative'].includes(unit.outcome_direction)
  ) {
    update.outcome_direction = unit.outcome_direction;
  }
  if (
    typeof unit.place_type === 'string' &&
    ['home', 'office', 'commuting', 'transport', 'shop', 'hospital', 'school', 'outdoor', 'online', 'other'].includes(
      unit.place_type
    )
  ) {
    update.place_type = unit.place_type;
  }
  if (
    typeof unit.money_direction === 'string' &&
    ['expense', 'income', 'none'].includes(unit.money_direction)
  ) {
    update.money_direction = unit.money_direction;
  }
  if (typeof unit.metric === 'object' && unit.metric !== null) {
    const m = unit.metric as Record<string, unknown>;
    if (m.value != null && typeof m.value === 'number') update.metric_value = m.value;
    if (typeof m.unit === 'string' && m.unit) update.metric_unit = m.unit;
    if (typeof m.name === 'string' && m.name) update.metric_name = m.name;
  }
  if (Array.isArray(unit.relation_roles) && unit.relation_roles.length > 0) {
    update.relation_roles = unit.relation_roles;
  }
  if (typeof unit.body_state === 'string' && unit.body_state) update.body_state = unit.body_state;
  if (typeof unit.money_currency === 'string' && unit.money_currency) {
    update.money_currency = unit.money_currency;
  }
  if (typeof unit.state === 'string' && unit.state) update.status = unit.state;

  return update;
}
