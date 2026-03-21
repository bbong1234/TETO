"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Plus, Edit, Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import type { Project, ProjectLog, ProjectWithLogs, ProjectFormValues, ProjectLogFormValues } from "@/types/projects";
import { PROJECT_CATEGORIES, PROJECT_STATUS_OPTIONS } from "@/types/projects";
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  addProjectLog,
} from "@/lib/db/projects";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user-id";

function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "yyyy年M月d日", { locale: zhCN });
}

function getEmptyProjectFormValues(): ProjectFormValues {
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

function getEmptyLogFormValues(): ProjectLogFormValues {
  return {
    log_date: formatDateForInput(new Date()),
    progress_added: 0,
    note: "",
  };
}

export default function ProjectsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedProject, setSelectedProject] = useState<ProjectWithLogs | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormValues>(getEmptyProjectFormValues());
  const [isSavingProject, setIsSavingProject] = useState(false);

  const [logForm, setLogForm] = useState<ProjectLogFormValues>(getEmptyLogFormValues());
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const getCurrentUserAsync = async () => {
      console.log("[ProjectsPage] 开始获取当前用户");
      
      try {
        const user = await getCurrentUser();
        console.log("[ProjectsPage] 获取用户成功:", {
          id: user.id,
          email: user.email,
          isDevMode: user.isDevMode,
        });
        setCurrentUser(user);
      } catch (err) {
        console.error("[ProjectsPage] 获取用户失败:", err);
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

  useEffect(() => {
    if (!authChecking && currentUser && view === "list") {
      loadProjects(currentUser);
    }
  }, [authChecking, currentUser, view, loadProjects]);

  const handleCreateProject = () => {
    setIsEditing(false);
    setProjectForm(getEmptyProjectFormValues());
    setIsProjectModalOpen(true);
  };

  const handleEditProject = (project: Project) => {
    setIsEditing(true);
    setProjectForm({
      name: project.name,
      category: project.category,
      description: project.description || "",
      unit: project.unit,
      target_total: project.target_total,
      current_progress: project.current_progress,
      start_date: project.start_date,
      target_date: project.target_date,
      status: project.status,
    });
    setIsProjectModalOpen(true);
  };

  const handleSaveProject = async () => {
    if (!currentUser) {
      console.error("[handleSaveProject] 用户未初始化");
      setError("用户信息未加载，请刷新页面");
      return;
    }

    console.log("[handleSaveProject] 开始保存项目");
    console.log("[handleSaveProject] projectForm:", projectForm);

    setIsSavingProject(true);
    setError(null);
    try {
      if (isEditing && selectedProject) {
        await updateProject(currentUser.id, selectedProject.id, projectForm);
        console.log("[handleSaveProject] 更新成功");
      } else {
        await createProject(currentUser.id, projectForm);
        console.log("[handleSaveProject] 创建成功");
      }
      setIsProjectModalOpen(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadProjects(currentUser);
    } catch (err) {
      console.error("[handleSaveProject] 保存失败:", err);
      setError(`保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleViewProject = async (projectId: string) => {
    if (!currentUser) return;
    await loadProjectDetail(currentUser, projectId);
    setView("detail");
  };

  const handleAddLog = async () => {
    if (!currentUser || !selectedProject) {
      console.error("[handleAddLog] 用户或项目未初始化");
      setError("用户信息未加载，请刷新页面");
      return;
    }

    console.log("[handleAddLog] 开始添加日志");
    console.log("[handleAddLog] logForm:", logForm);

    setIsSavingLog(true);
    setError(null);
    try {
      await addProjectLog(currentUser.id, selectedProject.id, logForm);
      console.log("[handleAddLog] 添加成功");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setLogForm(getEmptyLogFormValues());
      await loadProjectDetail(currentUser, selectedProject.id);
    } catch (err) {
      console.error("[handleAddLog] 添加失败:", err);
      setError(`添加失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setIsSavingLog(false);
    }
  };

  if (authChecking) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-3 text-slate-600">加载中...</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {currentUser && currentUser.isDevMode && (
          <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-700">
            开发模式：使用测试用户 ID ({currentUser.id})
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {view === "list" ? (
          <>
            <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">项目管理</h1>
                <p className="mt-1 text-sm text-slate-500">
                  管理长期项目、更新进度
                </p>
              </div>
              <button
                onClick={handleCreateProject}
                className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                新建项目
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
                <p className="text-slate-600">暂无项目，点击"新建项目"开始创建</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => {
                  const percent = project.target_total > 0 ? ((project.current_progress / project.target_total) * 100).toFixed(0) : '0';
                  const statusLabel = PROJECT_STATUS_OPTIONS.find(s => s.value === project.status)?.label;

                  return (
                    <div
                      key={project.id}
                      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
                      onClick={() => handleViewProject(project.id)}
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <h3 className="font-semibold text-slate-900 truncate">{project.name}</h3>
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mb-3 text-sm text-slate-600">{project.category}</p>
                      <p className="mb-3 text-sm text-slate-700">
                        {project.current_progress} / {project.target_total} {project.unit}
                      </p>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>完成度 {percent}%</span>
                        <span>目标 {formatDateForDisplay(project.target_date)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => setView("list")}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 whitespace-nowrap"
                >
                  <ArrowLeft className="h-4 w-4" />
                  返回列表
                </button>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold text-slate-900 truncate">{selectedProject?.name}</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedProject?.category}
                  </p>
                </div>
              </div>
              <button
                onClick={() => selectedProject && handleEditProject(selectedProject)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <Edit className="h-4 w-4" />
                编辑项目
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : selectedProject ? (
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold text-slate-800">项目信息</h2>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-slate-500">项目描述</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {selectedProject.description || "暂无描述"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-500">开始日期</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">
                          {formatDateForDisplay(selectedProject.start_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">目标日期</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">
                          {formatDateForDisplay(selectedProject.target_date)}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">当前进度</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">
                        {selectedProject.current_progress} / {selectedProject.target_total} {selectedProject.unit}
                      </p>
                      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{
                            width: `${selectedProject.target_total > 0 ? ((selectedProject.current_progress / selectedProject.target_total) * 100).toFixed(0) : '0'}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold text-slate-800">更新进度</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">
                        更新日期
                      </label>
                      <input
                        type="date"
                        value={logForm.log_date}
                        onChange={(e) => setLogForm({ ...logForm, log_date: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">
                        本次新增进度
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={logForm.progress_added}
                        onChange={(e) => setLogForm({ ...logForm, progress_added: parseInt(e.target.value) || 0 })}
                        placeholder="例如 3"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">
                        备注
                      </label>
                      <textarea
                        rows={3}
                        value={logForm.note}
                        onChange={(e) => setLogForm({ ...logForm, note: e.target.value })}
                        placeholder="写本次推进说明"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      />
                    </div>
                    <button
                      onClick={handleAddLog}
                      disabled={isSavingLog}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSavingLog ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : saveSuccess ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : null}
                      {isSavingLog ? "保存中..." : saveSuccess ? "已保存" : "保存进度更新"}
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold text-slate-800">项目日志</h2>
                  {selectedProject.logs.length === 0 ? (
                    <p className="text-sm text-slate-600">暂无日志</p>
                  ) : (
                    <div className="space-y-4">
                      {selectedProject.logs.map((log: ProjectLog) => (
                        <div key={log.id} className="rounded-xl bg-slate-50 p-4">
                          <p className="text-sm font-medium text-slate-900">
                            {formatDateForDisplay(log.log_date)}
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            新增 {log.progress_added}，更新后进度 {log.progress_after}
                          </p>
                          {log.note && (
                            <p className="mt-1 text-sm text-slate-500">{log.note}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : null}
          </>
        )}

        {isProjectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
              <h2 className="mb-6 text-xl font-semibold text-slate-900">
                {isEditing ? "编辑项目" : "新建项目"}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    项目名称
                  </label>
                  <input
                    type="text"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                    placeholder="例如：英语单词计划"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    项目分类
                  </label>
                  <select
                    value={projectForm.category}
                    onChange={(e) => setProjectForm({ ...projectForm, category: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  >
                    {PROJECT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    项目描述
                  </label>
                  <textarea
                    rows={3}
                    value={projectForm.description}
                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                    placeholder="描述项目的目标和内容"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">
                      单位
                    </label>
                    <input
                      type="text"
                      value={projectForm.unit}
                      onChange={(e) => setProjectForm({ ...projectForm, unit: e.target.value })}
                      placeholder="例如：个、小时、功能点"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">
                      目标总量
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={projectForm.target_total}
                      onChange={(e) => setProjectForm({ ...projectForm, target_total: parseInt(e.target.value) || 0 })}
                      placeholder="例如 1000"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    当前进度
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={projectForm.current_progress}
                    onChange={(e) => setProjectForm({ ...projectForm, current_progress: parseInt(e.target.value) || 0 })}
                    placeholder="例如 0"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">
                      开始日期
                    </label>
                    <input
                      type="date"
                      value={projectForm.start_date}
                      onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">
                      目标日期
                    </label>
                    <input
                      type="date"
                      value={projectForm.target_date}
                      onChange={(e) => setProjectForm({ ...projectForm, target_date: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    状态
                  </label>
                  <select
                    value={projectForm.status}
                    onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  >
                    {PROJECT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    onClick={() => setIsProjectModalOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap sm:w-auto w-full"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveProject}
                    disabled={isSavingProject}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap sm:w-auto w-full"
                  >
                    {isSavingProject ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {isSavingProject ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
