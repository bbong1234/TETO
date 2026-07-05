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
    mood: 'mood',
    energy: 'energy',
    bodyState: 'bodyState',
    status: 'status',
    location: 'location',
    peopleStr: 'peopleStr',
    toolLabel: 'toolLabel',
  },
  attributesMore: {
    actionText: 'actionText',
    eventText: 'eventText',
    objectText: 'objectText',
    metricName: 'metricName',
    metricValue: 'metricValue',
    metricUnit: 'metricUnit',
    placeType: 'placeType',
    timeText: 'timeText',
    timePrecision: 'timePrecision',
    outcomeType: 'outcomeType',
    outcomeDirection: 'outcomeDirection',
    relationRolesStr: 'relationRolesStr',
    relatedObjectsStr: 'relatedObjectsStr',
  },
  context: {
    eventText: 'eventText',
    causeText: 'causeText',
    resultText: 'resultText',
  },
  note: {
    note: 'note',
  },
} as const;

export type RecordDetailSlotGroup = keyof typeof RECORD_DETAIL_SLOTS;
