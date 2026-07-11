/** 记录详情页 slot ↔ 表单字段映射（供录入规则 / AI / 详情 UI 共用） */

export const RECORD_DETAIL_SLOTS = {
  source: {
    rawInput: 'rawInput',
    content: 'content',
    events: 'activity_events',
  },
  meta: {
    type: 'type',
    recordDate: 'recordDate',
    occurredAt: 'occurredAt',
    occurredAtEnd: 'occurredAtEnd',
    durationMinutes: 'durationMinutes',
    timeText: 'timeText',
    timePrecision: 'timePrecision',
    lifecycleStatus: 'lifecycle_status',
  },
  attribution: {
    activityContext: 'activityContext',
    functionTagIds: 'tagIds',
  },
  goal: {
    goalId: 'goalId',
  },
  finance: {
    moneyDirection: 'moneyDirection',
    cost: 'cost',
    moneyCurrency: 'moneyCurrency',
    account: 'financeAccount',
  },
  attributes: {
    bodyMind: { mood: 'mood', energy: 'energy', bodyState: 'bodyState' },
    status: { status: 'status' },
    place: { location: 'location', placeType: 'placeType' },
    people: { peopleStr: 'peopleStr', relationRolesStr: 'relationRolesStr' },
    causality: {
      causeText: 'causeText',
      outcomeType: 'outcomeType',
      outcomeDirection: 'outcomeDirection',
      resultText: 'resultText',
    },
    object: { objectText: 'objectText', relatedObjectsStr: 'relatedObjectsStr' },
    tool: { toolLabel: 'toolLabel' },
    metrics: { metricName: 'metricName', metricValue: 'metricValue', metricUnit: 'metricUnit' },
  },
  note: {
    notes: 'notes',
  },
} as const;

export type RecordDetailSlotGroup = keyof typeof RECORD_DETAIL_SLOTS;
