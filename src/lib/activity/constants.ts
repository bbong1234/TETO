/** 活动分类预置标签名（P0 引导用户选择，不强制） */
export const ACTIVITY_CATEGORY_PRESETS = [
  '工作',
  '吃饭',
  '出门',
  '学习',
  '休息',
  '运动',
  '家务',
  '娱乐',
  '睡觉',
  '其他',
] as const;

export type ActivityCategoryPreset = (typeof ACTIVITY_CATEGORY_PRESETS)[number];

/** 子类示例（仅 UI 提示，不存库） */
export const ACTIVITY_SUBCATEGORY_HINTS: Record<string, string[]> = {
  吃饭: ['早饭', '午饭', '晚饭', '零食'],
  工作: ['会议', '沟通', '写文档', '开发', '问题排查'],
  出门: ['通勤', '办事', '散步', '买东西'],
};
