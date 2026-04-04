"use client";

import React, { useEffect } from "react";
import { Plus } from "lucide-react";
import { useProjects } from "./hooks/useProjects";
import { ProjectFormModal } from "./components/ProjectFormModal";
import { ProjectList } from "./components/ProjectList";
import { ProjectDetail } from "./components/ProjectDetail";

export default function ProjectsPage() {
  const {
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
  } = useProjects();

  // 加载项目列表
  useEffect(() => {
    if (!authChecking && currentUser && view === "list") {
      loadProjects(currentUser);
    }
  }, [authChecking, currentUser, view, loadProjects]);

  // 处理项目表单变化
  const handleProjectFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProjectForm(prev => ({
      ...prev,
      [name]: name === "target_total" || name === "current_progress" ? parseFloat(value) || 0 : value
    }));
  };

  // 处理日志表单变化
  const handleLogFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setLogForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 处理保存项目
  const handleSaveProjectClick = () => {
    if (currentUser) {
      handleSaveProject(currentUser);
    }
  };

  // 处理保存日志
  const handleSaveLogClick = () => {
    if (currentUser && selectedProject) {
      handleSaveLog(currentUser, selectedProject.id);
    }
  };

  // 处理删除项目
  const handleDeleteProjectClick = (projectId: string) => {
    if (currentUser) {
      setDeletingProjectId(projectId);
      handleDeleteProject(currentUser, projectId);
    }
  };

  // 处理删除日志
  const handleDeleteLogClick = (logId: string) => {
    if (currentUser && selectedProject) {
      setDeletingLogId(logId);
      handleDeleteLog(currentUser, selectedProject.id, logId);
    }
  };

  // 处理查看项目
  const handleViewProjectClick = (projectId: string) => {
    if (currentUser) {
      handleViewProject(currentUser, projectId);
    }
  };

  if (authChecking) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">项目管理</h1>
        <button
          onClick={handleCreateProject}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          新建项目
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {view === "list" ? (
        <ProjectList
          projects={projects}
          isLoading={isLoading}
          collapsedProjects={collapsedProjects}
          onEditProject={handleEditProject}
          onDeleteProject={handleDeleteProjectClick}
          onViewProject={handleViewProjectClick}
          onToggleCollapse={toggleProjectCollapse}
          deletingProjectId={deletingProjectId}
        />
      ) : (
        <ProjectDetail
          project={selectedProject}
          isLoading={isLoading}
          logForm={logForm}
          isSavingLog={isSavingLog}
          saveSuccess={saveSuccess}
          editingLogId={editingLogId}
          deletingLogId={deletingLogId}
          collapsedDetailSections={collapsedDetailSections}
          onBackToList={handleBackToList}
          onAddLog={handleAddLog}
          onEditLog={handleEditLog}
          onDeleteLog={handleDeleteLogClick}
          onSaveLog={handleSaveLogClick}
          onCancelEdit={() => setEditingLogId(null)}
          onLogFormChange={handleLogFormChange}
          onToggleSectionCollapse={toggleDetailSectionCollapse}
        />
      )}

      <ProjectFormModal
        isOpen={isProjectModalOpen}
        isEditing={isEditing}
        isLoading={isSavingProject}
        formValues={projectForm}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={handleSaveProjectClick}
        onFormChange={handleProjectFormChange}
      />
    </div>
  );
}
