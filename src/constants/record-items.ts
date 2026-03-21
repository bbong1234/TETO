import type { RecordItemConfig } from '@/types/daily-record';

export const RECORD_ITEMS: RecordItemConfig[] = [
  {
    key: 'vocab_new',
    name: '新学单词',
    type: 'number',
    unit: '个',
    group: 'learning',
  },
  {
    key: 'vocab_review',
    name: '复习单词',
    type: 'number',
    unit: '个',
    group: 'learning',
  },
  {
    key: 'study_practice',
    name: '学习练习',
    type: 'duration',
    unit: '分钟',
    group: 'learning',
  },
  {
    key: 'reading',
    name: '读书',
    type: 'duration',
    unit: '分钟',
    group: 'learning',
  },
  {
    key: 'listening',
    name: '听读',
    type: 'duration',
    unit: '分钟',
    group: 'learning',
  },
  {
    key: 'speaking',
    name: '口播',
    type: 'duration',
    unit: '分钟',
    group: 'learning',
  },
  {
    key: 'exercise',
    name: '运动',
    type: 'duration',
    unit: '分钟',
    group: 'life',
  },
  {
    key: 'meditation',
    name: '冥想',
    type: 'duration',
    unit: '分钟',
    group: 'life',
  },
  {
    key: 'entertainment',
    name: '娱乐',
    type: 'duration',
    unit: '分钟',
    group: 'life',
  },
  {
    key: 'method_task',
    name: '方法任务',
    type: 'duration',
    unit: '分钟',
    group: 'life',
  },
  {
    key: 'wake_time',
    name: '起床时间',
    type: 'time',
    group: 'time',
  },
  {
    key: 'sleep_time',
    name: '睡觉时间',
    type: 'time',
    group: 'time',
  },
];

export const RECORD_ITEM_GROUPS = {
  learning: {
    label: '学习成长',
    items: RECORD_ITEMS.filter((item) => item.group === 'learning'),
  },
  life: {
    label: '生活作息',
    items: RECORD_ITEMS.filter((item) => item.group === 'life'),
  },
  time: {
    label: '时间记录',
    items: RECORD_ITEMS.filter((item) => item.group === 'time'),
  },
};

export const RECORD_ITEM_KEYS = RECORD_ITEMS.map((item) => item.key);

export function getRecordItemConfig(key: string): RecordItemConfig | undefined {
  return RECORD_ITEMS.find((item) => item.key === key);
}
