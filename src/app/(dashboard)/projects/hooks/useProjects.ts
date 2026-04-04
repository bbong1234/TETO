import { useState, useEffect, useCallback } from "react";
import type { Project, ProjectLog, ProjectWithLogs, ProjectFormValues, ProjectLogFormValues } from "@/types/projects";
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  addProjectLog,
  updateProjectLog,
  deleteProjectLog,
  deleteProject,
} from "@/lib/db/projects";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user-id";
import { formatDateForInput, formatDateTimeForInput } from "../utils/projectUtils";

export function getEmptyProjectFormValues(): ProjectFormValues {
  return {
    name: "",
    category: "学习",
    description: "",
    unit: "",
    target_total: 0,
    current_progress: 0,
    start_date: formatDateForInput(new Date()),
    target_date: formatDateForInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    status: "active",
  };
}

export function getEmptyLogFormValues(): ProjectLogFormValues {
  return {
    log_date: formatDateTimeForInput(new Date()),
    progress_added: "",
    note: "",
  };
}

export function useProjects() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "detail">('list');
  const [selectedProject, setSelectedProject] = useState<ProjectWithLogs | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormValues>(getEmptyProjectFormValues());
  const [isSavingProject, setIsSavingProject] = useState(false);

  const [logForm, setLogForm] = useState<ProjectLogFormValues>(getEmptyLogFormValues());
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedDetailSections, setCollapsedDetailSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const getCurrentUserAsync = async () => {
      console.log("[useProjects] 开始获取当前用户");
      
      try {
        const user = await getCurrentUser();
        console.log("[useProjects] 获取用户成功:", {
          id: user.id,
          email: user.email,
          isDevMode: user.isDevMode,
        });
        setCurrentUser(user);
      } catch (err) {
        console.error("[useProjects] 获取用户失败:", err);
        setError(err instanceof Error ? err.message : "获取用户信息失败");
      } finally {
        setAuthChecking(false);
      }
    };
    
    getCurrentUserAsync();
  }, []);

  const loadProjects = useCallback(async (user: CurrentUser) => {
    console.log("[loadProjects] 开始加载项目");
    setIsLoading(true);
    setError(null);
    try {
      const data = await getProjects(user.id);
      console.log("[loadProjects] 加载成功:", data);
      setProjects(data);
    } catch (err) {
      console.error("[loadProjects] 加载失败:", err);
      setError("加载项目失败，请重试");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadProjectDetail = useCallback(async (user: CurrentUser, projectId: string) => {
    console.log("[loadProjectDetail] 开始加载项目详情, projectId:", projectId);
    setIsLoading(true);
    setError(null);
    try {
      const data = await getProjectById(user.id, projectId);
      console.log("[loadProjectDetail] 加载成功:", data);
      setSelectedProject(data);
    } catch (err) {
      console.error("[loadProjectDetail] 加载失败:", err);
      setError("加载项目详情失败，请重试");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCreateProject = useCallback(() => {
    setIsEditing(false);
    setProjectForm(getEmptyProjectFormValues());
    setIsProjectModalOpen(true);
  }, []);

  const handleEditProject = useCallback((project: Project) => {
    setIsEditing(true);
    setProjectForm({
      name: project.name,
      category: project.category,
      description: project.description || "",
      unit: project.unit,
      target_total: project.target_total,
      current_progress: project.current_progress,
      start_date: formatDateForInput(new Date(project.start_date)),
      target_date: formatDateForInput(new Date(project.target_date)),
      status: project.status,
    });
    setIsProjectModalOpen(true);
  }, []);

  const handleSaveProject = useCallback(async (user: CurrentUser) => {
    if (!user) return;
    
    setIsSavingProject(true);
    setError(null);
    
    try {
      if (isEditing && selectedProject) {
        console.log("[handleSaveProject] 更新项目:", projectForm);
        await updateProject(user.id, selectedProject.id, projectForm);
        await loadProjects(user);
      } else {
        console.log("[handleSaveProject] 创建项目:", projectForm);
        await createProject(user.id, projectForm);
        await loadProjects(user);
      }
      
      setIsProjectModalOpen(false);
    } catch (err) {
      console.error("[handleSaveProject] 保存失败:", err);
      setError("保存项目失败，请重试");
    } finally {
      setIsSavingProject(false);
    }
  }, [isEditing, selectedProject, projectForm, loadProjects]);

  const handleAddLog = useCallback(() => {
    setEditingLogId(null);
    setLogForm(getEmptyLogFormValues());
  }, []);

  const handleEditLog = useCallback((log: ProjectLog) => {
    setEditingLogId(log.id);
    setLogForm({
      log_date: formatDateTimeForInput(new Date(log.log_date)),
      progress_added: log.progress_added.toString(),
      note: log.note || "",
    });
  }, []);

  const handleSaveLog = useCallback(async (user: CurrentUser, projectId: string) => {
    if (!user || !projectId) return;
    
    setIsSavingLog(true);
    setError(null);
    
    try {
      const logData = {
        progress_added: parseFloat(logForm.progress_added?.toString() || "0"),
        note: logForm.note,
        log_date: logForm.log_date,
      };
      
      if (editingLogId) {
        console.log("[handleSaveLog] 更新日志:", logData);
        await updateProjectLog(user.id, projectId, editingLogId, logData);
      } else {
        console.log("[handleSaveLog] 添加日志:", logData);
        await addProjectLog(user.id, projectId, logData);
      }
      
      await loadProjectDetail(user, projectId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      setEditingLogId(null);
      setLogForm(getEmptyLogFormValues());
    } catch (err) {
      console.error("[handleSaveLog] 保存失败:", err);
      setError("保存日志失败，请重试");
    } finally {
      setIsSavingLog(false);
    }
  }, [logForm, editingLogId, loadProjectDetail]);

  const handleDeleteLog = useCallback(async (user: CurrentUser, projectId: string, logId: string) => {
    if (!user || !projectId || !logId) return;
    
    try {
      console.log("[handleDeleteLog] 删除日志:", logId);
      await deleteProjectLog(user.id, projectId, logId);
      await loadProjectDetail(user, projectId);
      setDeletingLogId(null);
    } catch (err) {
      console.error("[handleDeleteLog] 删除失败:", err);
      setError("删除日志失败，请重试");
    }
  }, [loadProjectDetail]);

  const handleDeleteProject = useCallback(async (user: CurrentUser, projectId: string) => {
    if (!user || !projectId) return;
    
    try {
      console.log("[handleDeleteProject] 删除项目:", projectId);
      await deleteProject(user.id, projectId);
      await loadProjects(user);
      setDeletingProjectId(null);
      setView('list');
      setSelectedProject(null);
    } catch (err) {
      console.error("[handleDeleteProject] 删除失败:", err);
      setError("删除项目失败，请重试");
    }
  }, [loadProjects]);

  const handleViewProject = useCallback((user: CurrentUser, projectId: string) => {
    setView('detail');
    loadProjectDetail(user, projectId);
  }, [loadProjectDetail]);

  const handleBackToList = useCallback(() => {
    setView('list');
    setSelectedProject(null);
  }, []);

  const toggleProjectCollapse = useCallback((projectId: string) => {
    setCollapsedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  }, []);

  const toggleDetailSectionCollapse = useCallback((section: string) => {
    setCollapsedDetailSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  return {
    // 状态
    currentUser,
    authChecking,
    projects,
    isLoading,
    error,
    view,
    selectedProject,
    isProjectModalOpen,
    isEditing,
    projectForm,
    isSavingProject,
    logForm,
    isSavingLog,
    saveSuccess,
    editingLogId,
    deletingLogId,
    deletingProjectId,
    collapsedProjects,
    collapsedDetailSections,
    
    // 方法
    loadProjects,
    loadProjectDetail,
    handleCreateProject,
    handleEditProject,
    handleSaveProject,
    handleAddLog,
    handleEditLog,
    handleSaveLog,
    handleDeleteLog,
    handleDeleteProject,
    handleViewProject,
    handleBackToList,
    toggleProjectCollapse,
    toggleDetailSectionCollapse,
    
    // 状态更新方法
    setProjectForm,
    setLogForm,
    setIsProjectModalOpen,
    setEditingLogId,
    setDeletingLogId,
    setDeletingProjectId,
  };
}
