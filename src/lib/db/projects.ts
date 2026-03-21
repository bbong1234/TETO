import type { Project, ProjectLog, ProjectWithLogs, ProjectFormValues, ProjectLogFormValues } from '@/types/projects';
import { createClient } from '@/lib/supabase/client';

export async function getProjects(userId: string): Promise<Project[]> {
  console.log("[getProjects] 查询参数:", { userId });
  const supabase = createClient();

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  console.log("[getProjects] 查询结果:", { data, error });

  if (error) {
    console.error("[getProjects] 查询错误:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return data || [];
}

export async function getProjectById(
  userId: string,
  projectId: string
): Promise<ProjectWithLogs | null> {
  console.log("[getProjectById] 查询参数:", { userId, projectId });
  const supabase = createClient();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('id', projectId)
    .single();

  console.log("[getProjectById] 项目查询结果:", { project, projectError });

  if (projectError) {
    console.error("[getProjectById] 项目查询错误:", {
      message: projectError.message,
      code: projectError.code,
      details: projectError.details,
      hint: projectError.hint,
    });
    throw projectError;
  }

  if (!project) {
    console.log("[getProjectById] 无项目记录, 返回 null");
    return null;
  }

  const { data: logs, error: logsError } = await supabase
    .from('project_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('log_date', { ascending: false });

  console.log("[getProjectById] 日志查询结果:", { logs, logsError });

  if (logsError) {
    console.error("[getProjectById] 日志查询错误:", {
      message: logsError.message,
      code: logsError.code,
      details: logsError.details,
      hint: logsError.hint,
    });
    throw logsError;
  }

  return {
    ...project,
    logs: logs || [],
  };
}

export async function createProject(
  userId: string,
  values: ProjectFormValues
): Promise<Project> {
  console.log("[createProject] 开始创建, userId:", userId, "values:", values);
  const supabase = createClient();

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name: values.name,
      category: values.category,
      description: values.description || null,
      unit: values.unit,
      target_total: values.target_total,
      current_progress: values.current_progress || 0,
      start_date: values.start_date,
      target_date: values.target_date,
      status: values.status,
    })
    .select()
    .single();

  if (error) {
    console.error("[createProject] 创建失败:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  console.log("[createProject] 创建成功:", data);
  return data;
}

export async function updateProject(
  userId: string,
  projectId: string,
  values: Partial<ProjectFormValues>
): Promise<Project> {
  console.log("[updateProject] 开始更新, userId:", userId, "projectId:", projectId, "values:", values);
  const supabase = createClient();

  const { data, error } = await supabase
    .from('projects')
    .update({
      name: values.name,
      category: values.category,
      description: values.description,
      unit: values.unit,
      target_total: values.target_total,
      current_progress: values.current_progress,
      start_date: values.start_date,
      target_date: values.target_date,
      status: values.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error("[updateProject] 更新失败:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  console.log("[updateProject] 更新成功:", data);
  return data;
}

export async function addProjectLog(
  userId: string,
  projectId: string,
  values: ProjectLogFormValues
): Promise<ProjectLog> {
  console.log("[addProjectLog] 开始添加日志, userId:", userId, "projectId:", projectId, "values:", values);
  const supabase = createClient();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('current_progress')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (projectError) {
    console.error("[addProjectLog] 查询项目失败:", {
      message: projectError.message,
      code: projectError.code,
      details: projectError.details,
      hint: projectError.hint,
    });
    throw projectError;
  }

  const progressBefore = project?.current_progress || 0;
  const progressAfter = progressBefore + values.progress_added;

  const { data: log, error: logError } = await supabase
    .from('project_logs')
    .insert({
      project_id: projectId,
      log_date: values.log_date,
      progress_added: values.progress_added,
      progress_before: progressBefore,
      progress_after: progressAfter,
      note: values.note || null,
    })
    .select()
    .single();

  if (logError) {
    console.error("[addProjectLog] 添加日志失败:", {
      message: logError.message,
      code: logError.code,
      details: logError.details,
      hint: logError.hint,
    });
    throw logError;
  }

  const { error: updateError } = await supabase
    .from('projects')
    .update({
      current_progress: progressAfter,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', userId);

  if (updateError) {
    console.error("[addProjectLog] 更新项目进度失败:", {
      message: updateError.message,
      code: updateError.code,
      details: updateError.details,
      hint: updateError.hint,
    });
    throw updateError;
  }

  console.log("[addProjectLog] 添加成功:", log);
  return log;
}

export async function getProjectLogs(
  userId: string,
  projectId: string
): Promise<ProjectLog[]> {
  console.log("[getProjectLogs] 查询参数:", { userId, projectId });
  const supabase = createClient();

  const { data, error } = await supabase
    .from('project_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('log_date', { ascending: false });

  console.log("[getProjectLogs] 查询结果:", { data, error });

  if (error) {
    console.error("[getProjectLogs] 查询错误:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return data || [];
}
