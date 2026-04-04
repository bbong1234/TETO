"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { useDashboard } from "./hooks/useDashboard";
import { formatDateForDisplay } from "./utils/dashboardUtils";
import { StatsCards } from "./components/StatsCards";
import { ProjectsOverview } from "./components/ProjectsOverview";
import { QuickLinks } from "./components/QuickLinks";

export default function DashboardPage() {
  const {
    currentUser,
    authChecking,
    isLoading,
    error,
    todayRecord,
    todayReview,
    projects,
    activeProjectsCount,
    collapsedSections,
    toggleSection,
  } = useDashboard();

  if (authChecking) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-6xl">
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
      <div className="mx-auto max-w-6xl space-y-6">
        {currentUser && currentUser.isDevMode && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-700">
            开发模式：使用测试用户 ID ({currentUser.id})
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <section className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">仪表盘</h1>
            <p className="mt-1 text-sm text-slate-500">
              查看工作台概览和今日状态
            </p>
          </div>
          <div className="text-lg font-medium text-slate-700">
            {formatDateForDisplay(new Date())}
          </div>
        </section>

        <StatsCards
          todayRecord={todayRecord}
          todayReview={todayReview}
          activeProjectsCount={activeProjectsCount}
          collapsed={collapsedSections['stats_cards'] || false}
          onToggle={() => toggleSection('stats_cards')}
        />

        <ProjectsOverview
          projects={projects}
          isLoading={isLoading}
          collapsed={collapsedSections['projects'] || false}
          onToggle={() => toggleSection('projects')}
        />

        <QuickLinks />
      </div>
    </main>
  );
}
