"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { useStats } from "./hooks/useStats";
import { GlobalTimeRange } from "./components/GlobalTimeRange";
import { RecordTrendSection } from "./components/RecordTrendSection";
import { ReviewTrendSection } from "./components/ReviewTrendSection";
import { FixedBehaviorSection } from "./components/FixedBehaviorSection";
import { ProjectStatsSection } from "./components/ProjectStatsSection";
import { ProjectsOverviewSection } from "./components/ProjectsOverviewSection";
import { NavigationLinks } from "./components/NavigationLinks";

export default function StatsPage() {
  const {
    currentUser,
    authChecking,
    isLoading,
    error,
    globalRange,
    dailyRecordRange,
    diaryRange,
    fixedBehaviorRange,
    itemRanges,
    recordTrend,
    reviewTrend,
    itemTrends,
    projects,
    totalProjects,
    activeProjects,
    completedProjects,
    collapsedSections,
    itemFilterText,
    selectedItems,
    selectedItemKeys,
    setGlobalRange,
    setDailyRecordRange,
    setDiaryRange,
    selectAllItems,
    deselectAllItems,
    toggleItemSelection,
    toggleItemCollapse,
    toggleSection,
    toggleItemRange,
    toggleFixedBehaviorRange,
    setItemFilterText,
    getFilteredItemKeys,
  } = useStats();

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
    <main className="min-h-screen bg-slate-100 p-8">
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
            <h1 className="text-2xl font-bold text-slate-900">统计分析</h1>
            <p className="mt-1 text-sm text-slate-500">
              全局时间范围控制
            </p>
          </div>
        </section>

        <GlobalTimeRange 
          globalRange={globalRange} 
          onGlobalRangeChange={setGlobalRange} 
        />

        <RecordTrendSection
          isLoading={isLoading}
          dailyRecordRange={dailyRecordRange}
          recordTrend={recordTrend}
          collapsed={collapsedSections['record_trend'] || false}
          onToggle={() => toggleSection('record_trend')}
          onRangeChange={setDailyRecordRange}
        />

        <ReviewTrendSection
          isLoading={isLoading}
          diaryRange={diaryRange}
          reviewTrend={reviewTrend}
          collapsed={collapsedSections['review_trend'] || false}
          onToggle={() => toggleSection('review_trend')}
          onRangeChange={setDiaryRange}
        />

        <FixedBehaviorSection
          isLoading={isLoading}
          fixedBehaviorRange={fixedBehaviorRange}
          itemRanges={itemRanges}
          itemTrends={itemTrends}
          itemFilterText={itemFilterText}
          selectedItems={selectedItems}
          selectedItemKeys={selectedItemKeys}
          collapsed={collapsedSections['item_trends'] || false}
          collapsedSections={collapsedSections}
          onToggle={() => toggleSection('item_trends')}
          onFixedBehaviorRangeChange={toggleFixedBehaviorRange}
          onItemRangeChange={toggleItemRange}
          onItemFilterChange={setItemFilterText}
          onSelectAll={selectAllItems}
          onDeselectAll={deselectAllItems}
          onToggleItemSelection={toggleItemSelection}
          onToggleItemCollapse={toggleItemCollapse}
          getFilteredItemKeys={getFilteredItemKeys}
        />

        <ProjectStatsSection
          isLoading={isLoading}
          projects={projects}
          totalProjects={totalProjects}
          activeProjects={activeProjects}
          completedProjects={completedProjects}
          collapsed={collapsedSections['stats_summary'] || false}
          onToggle={() => toggleSection('stats_summary')}
        />

        <ProjectsOverviewSection
          isLoading={isLoading}
          projects={projects}
          totalProjects={totalProjects}
          collapsed={collapsedSections['projects_overview'] || false}
          onToggle={() => toggleSection('projects_overview')}
        />

        <NavigationLinks />
      </div>
    </main>
  );
}
