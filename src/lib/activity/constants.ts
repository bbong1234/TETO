/**
 * 相邻两条「发生」记录之间间隔达到该值（分钟）才显示为「空白时间」。
 * 短于该值的空档视为切换/记录误差，避免时间线噪音。
 */
export const GAP_THRESHOLD_MINUTES = 5;

/** 块时间 / 活动切换后撤销窗口时长（毫秒） */
export const CANCEL_WINDOW_MS = 5000;

export const GAP_THRESHOLD_HINT =
  `相邻活动间隔不足 ${GAP_THRESHOLD_MINUTES} 分钟不会标为空白；仅提示可补记，不要求填满 24 小时。`;

/**
 * 活动大类预置名：用具体领域词，不用「工作/学习」等模糊大词。
 * 已存在同名顶层 item 不会被覆盖；旧数据中的「工作」「学习」仍可作为大类使用。
 */
export const ACTIVITY_CATEGORY_PRESETS = [
  '英语',
  '保险',
  '股票',
  '科学',
  '编程',
  '运动',
  '阅读',
  '吃饭',
  '出门',
  '休息',
  '家务',
  '娱乐',
  '睡觉',
  '其他',
] as const;

export type ActivityCategoryPreset = (typeof ACTIVITY_CATEGORY_PRESETS)[number];

/** 快速开始气泡兜底标签（历史不足时补齐，最多展示 6 个） */
export const DEFAULT_QUICK_START_LABELS = [
  '吃饭',
  '睡觉',
  '工作',
  '学习',
  '编程',
  '运动',
] as const;

export type DefaultQuickStartLabel = (typeof DEFAULT_QUICK_START_LABELS)[number];

/** 技能型大类：须建默认事项，记录挂在事项上 */
export const SKILL_CATEGORY_PRESETS = [
  '英语',
  '科学',
  '编程',
  '运动',
  '阅读',
] as const;

export type SkillCategoryPreset = (typeof SKILL_CATEGORY_PRESETS)[number];

/** 技能型大类下的默认事项名 */
export const SKILL_DEFAULT_ITEM_TITLES: Record<SkillCategoryPreset, string> = {
  英语: '英语学习',
  科学: '科学学习',
  编程: '编程练习',
  运动: '日常运动',
  阅读: '日常阅读',
};

/** 英语默认事项下的子项（技能维度） */
export const ENGLISH_SUB_ITEM_PRESETS = [
  '词汇',
  '听力',
  '阅读',
  '口语',
  '写作',
] as const;
