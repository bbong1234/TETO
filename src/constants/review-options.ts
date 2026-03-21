export const STATUS_OPTIONS = ['高效', '一般', '疲惫', '分心', '拖延'] as const;
export const EMOTION_OPTIONS = ['平静', '焦虑', '烦躁', '低落', '兴奋'] as const;

export type StatusOption = typeof STATUS_OPTIONS[number];
export type EmotionOption = typeof EMOTION_OPTIONS[number];
