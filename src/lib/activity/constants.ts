/** 活动分类预置标签名（P0 引导用户选择，不强制） */
export const ACTIVITY_CATEGORY_PRESETS = [
  '工作',
  '吃饭',
  '出门',
  '学习',
  '英语',
  '休息',
  '运动',
  '家务',
  '娱乐',
  '睡觉',
  '其他',
] as const;

export type ActivityCategoryPreset = (typeof ACTIVITY_CATEGORY_PRESETS)[number];
