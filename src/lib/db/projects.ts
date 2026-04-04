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

// 重试函数
async function retry<T>(fn: () => Promise<T>, maxRetries: number = 3, delay: number = 500): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`[retry] 尝试 ${i + 1} 失败，${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // 指数退避
    }
  }
  throw lastError;
}

export async function updateProjectLog(
  userId: string,
  projectId: string,
  logId: string,
  values: Partial<ProjectLogFormValues>
): Promise<ProjectLog> {
  console.log("[updateProjectLog] ===== 开始更新日志 =====");
  console.log("[updateProjectLog] 参数:", { userId, projectId, logId, values });
  const supabase = createClient();

  try {
    console.log("[updateProjectLog] 步骤1: 查询项目信息...");
    const projectResult = await retry(async () => {
      const result = await supabase
        .from('projects')
        .select('current_progress, target_total, start_date')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    console.log("[updateProjectLog] 步骤1成功, 项目:", projectResult.data);

    console.log("[updateProjectLog] 步骤2: 查询所有日志(按日期排序)...");
    const allLogsResult = await retry(async () => {
      const result = await supabase
        .from('project_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('log_date', { ascending: true });
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    const allLogs = allLogsResult.data || [];
    console.log("[updateProjectLog] 步骤2成功, 共", allLogs.length, "条日志");

    const logIndex = allLogs.findIndex((l: any) => l.id === logId);
    if (logIndex === -1) {
      throw new Error("找不到要编辑的日志");
    }

    console.log("[updateProjectLog] 要编辑的日志索引:", logIndex);

    const updatedLog = { ...allLogs[logIndex] };
    if (values.log_date !== undefined) {
      updatedLog.log_date = values.log_date;
      updatedLog.log_time = values.log_date;
    }
    if (values.progress_added !== undefined) updatedLog.progress_added = values.progress_added;
    if (values.note !== undefined) updatedLog.note = values.note;

    allLogs[logIndex] = updatedLog;

    console.log("[updateProjectLog] 步骤3: 重新计算所有日志的进度...");
    let currentProgress = 0;
    for (let i = 0; i < allLogs.length; i++) {
      const log = allLogs[i];
      log.progress_before = currentProgress;
      log.progress_after = currentProgress + log.progress_added;
      currentProgress = log.progress_after;
      console.log(`[updateProjectLog] 日志 ${i}: date=${log.log_date}, added=${log.progress_added}, before=${log.progress_before}, after=${log.progress_after}`);
    }

    const finalProgress = currentProgress;
    console.log("[updateProjectLog] 最终进度:", finalProgress);

    console.log("[updateProjectLog] 步骤4: 更新被编辑的日志到数据库...");
    const updateResult = await retry(async () => {
      const result = await supabase
        .from('project_logs')
        .update({
          log_date: updatedLog.log_date,
          log_time: updatedLog.log_time,
          progress_added: updatedLog.progress_added,
          progress_before: updatedLog.progress_before,
          progress_after: updatedLog.progress_after,
          note: updatedLog.note,
        })
        .eq('id', logId)
        .eq('project_id', projectId)
        .select()
        .single();
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    console.log("[updateProjectLog] 步骤4成功");

    console.log("[updateProjectLog] 步骤5: 更新后续日志的进度...");
    for (let i = logIndex + 1; i < allLogs.length; i++) {
      const log = allLogs[i];
      try {
        const updateNextResult = await retry(async () => {
          const result = await supabase
            .from('project_logs')
            .update({
              progress_before: log.progress_before,
              progress_after: log.progress_after,
            })
            .eq('id', log.id)
            .eq('project_id', projectId);
          if (result.error) {
            throw result.error;
          }
          return result;
        });
        console.log(`[updateProjectLog] 更新后续日志 ${i} 成功`);
      } catch (error) {
        console.error(`[updateProjectLog] 更新后续日志 ${i} 失败:`, error);
        // 继续执行，不中断整个流程
      }
    }

    console.log("[updateProjectLog] 步骤6: 计算预测信息...");
    const project = projectResult.data;
    const remaining = (project?.target_total || 0) - finalProgress;
    let predictedRemainingDays = null;
    let predictedFinishDate = null;

    if (remaining > 0 && project?.start_date) {
      const today = new Date();
      const startDate = new Date(project.start_date);
      const daysSinceStart = Math.max(1, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const avgProgressPerDay = finalProgress / daysSinceStart;

      if (avgProgressPerDay > 0) {
        predictedRemainingDays = Math.ceil(remaining / avgProgressPerDay);
        const finishDate = new Date();
        finishDate.setDate(finishDate.getDate() + predictedRemainingDays);
        predictedFinishDate = finishDate.toISOString().split('T')[0];
      }
    }

    const updateData: any = {
      current_progress: finalProgress,
      updated_at: new Date().toISOString(),
    };

    console.log("[updateProjectLog] 步骤7: 更新项目表...", updateData);

    const projectUpdateResult = await retry(async () => {
      const result = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('user_id', userId);
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    console.log("[updateProjectLog] ===== 更新成功 =====");
    return updateResult.data;
  } catch (error) {
    console.error("[updateProjectLog] 整体执行失败:", error);
    throw error;
  }
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

  try {
    const { data: project, error: projectError } = await retry(async () => {
      const result = await supabase
        .from('projects')
        .select('current_progress')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    // 错误已在retry函数中处理

    const progressBefore = project?.current_progress || 0;
    const progressAfter = progressBefore + values.progress_added;

    console.log("[addProjectLog] 步骤3: 准备插入日志，log_date原始值:", values.log_date);
    console.log("[addProjectLog] 步骤3: 准备插入日志，log_time原始值:", values.log_date);

    const { data: log, error: logError } = await retry(async () => {
      const result = await supabase
        .from('project_logs')
        .insert({
          project_id: projectId,
          log_date: values.log_date,
          log_time: values.log_date,
          progress_added: values.progress_added,
          progress_before: progressBefore,
          progress_after: progressAfter,
          note: values.note || null,
        })
        .select()
        .single();
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    console.log("[addProjectLog] 步骤4: 插入后返回的log:", log);
    console.log("[addProjectLog] 步骤4: 返回的log_date:", log?.log_date);

    // 错误已在retry函数中处理

    const { data: projectData, error: projectDataError } = await retry(async () => {
      const result = await supabase
        .from('projects')
        .select('target_total, start_date')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    // 错误已在retry函数中处理

    const remaining = (projectData?.target_total || 0) - progressAfter;
    let predictedRemainingDays = null;
    let predictedFinishDate = null;

    if (remaining > 0 && projectData?.start_date) {
      const today = new Date();
      const startDate = new Date(projectData.start_date);
      const daysSinceStart = Math.max(1, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const avgProgressPerDay = progressAfter / daysSinceStart;

      if (avgProgressPerDay > 0) {
        predictedRemainingDays = Math.ceil(remaining / avgProgressPerDay);
        const finishDate = new Date();
        finishDate.setDate(finishDate.getDate() + predictedRemainingDays);
        predictedFinishDate = finishDate.toISOString().split('T')[0];
      }
    }

    const updateData: any = {
      current_progress: progressAfter,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await retry(async () => {
      const result = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('user_id', userId);
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    // 错误已在retry函数中处理

    console.log("[addProjectLog] 添加成功:", log);
    return log;
  } catch (error) {
    console.error("[addProjectLog] 整体执行失败:", error);
    throw error;
  }
}

export async function deleteProjectLog(
  userId: string,
  projectId: string,
  logId: string
): Promise<void> {
  console.log("[deleteProjectLog] ===== 开始删除日志 =====");
  console.log("[deleteProjectLog] 参数:", { userId, projectId, logId });
  const supabase = createClient();

  console.log("[deleteProjectLog] 步骤1: 查询项目信息...");
  const projectResult = await supabase
    .from('projects')
    .select('target_total, start_date')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (projectResult.error) {
    console.error("[deleteProjectLog] 步骤1失败 - 查询项目失败:", projectResult.error);
    throw projectResult.error;
  }
  console.log("[deleteProjectLog] 步骤1成功");

  console.log("[deleteProjectLog] 步骤2: 删除日志...");
  const deleteResult = await supabase
    .from('project_logs')
    .delete()
    .eq('id', logId)
    .eq('project_id', projectId);

  if (deleteResult.error) {
    console.error("[deleteProjectLog] 步骤2失败 - 删除日志失败:", deleteResult.error);
    throw deleteResult.error;
  }
  console.log("[deleteProjectLog] 步骤2成功");

  console.log("[deleteProjectLog] 步骤3: 查询剩余日志...");
  const remainingLogsResult = await supabase
    .from('project_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('log_time', { ascending: true, nullsFirst: false });

  if (remainingLogsResult.error) {
    console.error("[deleteProjectLog] 步骤3失败 - 查询剩余日志失败:", remainingLogsResult.error);
    throw remainingLogsResult.error;
  }

  const remainingLogs = remainingLogsResult.data || [];
  console.log("[deleteProjectLog] 剩余日志数量:", remainingLogs.length);

  console.log("[deleteProjectLog] 步骤4: 重新计算日志链...");
  let currentProgress = 0;
  for (let i = 0; i < remainingLogs.length; i++) {
    const log = remainingLogs[i];
    const newBefore = currentProgress;
    const newAfter = currentProgress + log.progress_added;
    
    if (log.progress_before !== newBefore || log.progress_after !== newAfter) {
      const updateResult = await supabase
        .from('project_logs')
        .update({
          progress_before: newBefore,
          progress_after: newAfter,
        })
        .eq('id', log.id)
        .eq('project_id', projectId);
      
      if (updateResult.error) {
        console.error(`[deleteProjectLog] 更新日志 ${i} 失败:`, updateResult.error);
      }
    }
    
    currentProgress = newAfter;
    console.log(`[deleteProjectLog] 日志 ${i}: added=${log.progress_added}, before=${newBefore}, after=${newAfter}`);
  }

  const finalProgress = currentProgress;
  console.log("[deleteProjectLog] 最终进度:", finalProgress);

  console.log("[deleteProjectLog] 步骤5: 更新项目进度...");
  const project = projectResult.data;
  const remaining = (project?.target_total || 0) - finalProgress;
  let predictedRemainingDays = null;
  let predictedFinishDate = null;

  if (remaining > 0 && project?.start_date && finalProgress > 0) {
    const today = new Date();
    const startDate = new Date(project.start_date);
    const daysSinceStart = Math.max(1, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const avgProgressPerDay = finalProgress / daysSinceStart;

    if (avgProgressPerDay > 0) {
      predictedRemainingDays = Math.ceil(remaining / avgProgressPerDay);
      const finishDate = new Date();
      finishDate.setDate(finishDate.getDate() + predictedRemainingDays);
      predictedFinishDate = finishDate.toISOString().split('T')[0];
    }
  }

  const updateData: any = {
    current_progress: finalProgress,
    updated_at: new Date().toISOString(),
  };

  const projectUpdateResult = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', projectId)
    .eq('user_id', userId);

  if (projectUpdateResult.error) {
    console.error("[deleteProjectLog] 步骤5失败 - 更新项目失败:", projectUpdateResult.error);
    throw projectUpdateResult.error;
  }

  console.log("[deleteProjectLog] ===== 删除成功 =====");
}

export async function deleteProject(
  userId: string,
  projectId: string
): Promise<void> {
  console.log("[deleteProject] ===== 开始删除项目 =====");
  console.log("[deleteProject] 参数:", { userId, projectId });
  const supabase = createClient();

  console.log("[deleteProject] 步骤1: 删除项目所有日志...");
  const deleteLogsResult = await supabase
    .from('project_logs')
    .delete()
    .eq('project_id', projectId);

  if (deleteLogsResult.error) {
    console.error("[deleteProject] 步骤1失败 - 删除日志失败:", deleteLogsResult.error);
    throw deleteLogsResult.error;
  }
  console.log("[deleteProject] 步骤1成功");

  console.log("[deleteProject] 步骤2: 删除项目...");
  const deleteProjectResult = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (deleteProjectResult.error) {
    console.error("[deleteProject] 步骤2失败 - 删除项目失败:", deleteProjectResult.error);
    throw deleteProjectResult.error;
  }
  console.log("[deleteProject] ===== 删除成功 =====");
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
    .order('log_time', { ascending: false, nullsFirst: false });

  console.log("[getProjectLogs] 查询结果:", { data, error });
  if (data && data.length > 0) {
    console.log("[getProjectLogs] 第一条日志原始log_time:", data[0].log_time);
  }

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
