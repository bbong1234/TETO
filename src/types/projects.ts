export type Project = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  description: string | null;
  unit: string;
  target_total: number;
  current_progress: number;
  start_date: string;
  target_date: string;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
};

export type ProjectLog = {
  id: string;
  project_id: string;
  log_date: string;
  log_time: string | null;
  progress_added: number;
  progress_before: number;
  progress_after: number;
  note: string | null;
  created_at: string;
};

export type ProjectWithLogs = Project & {
  logs: ProjectLog[];
};

export type ProjectFormValues = {
  name: string;
  category: string;
  description: string;
  unit: string;
  target_total: number;
  current_progress: number;
  start_date: string;
  target_date: string;
  status: 'active' | 'paused' | 'completed';
};

export type ProjectLogFormValues = {
  log_date: string;
  progress_added: number | string | null | undefined;
  note: string;
};

export type ProjectCategory = '学习' | '产品' | '健康' | '财务' | '其他';

export const PROJECT_CATEGORIES: ProjectCategory[] = [
  '学习',
  '产品',
  '健康',
  '财务',
  '其他',
];

export const PROJECT_STATUS_OPTIONS = [
  { value: 'active', label: '进行中' },
  { value: 'paused', label: '暂停' },
  { value: 'completed', label: '已完成' },
] as const;
