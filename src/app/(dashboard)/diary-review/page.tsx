"use client";

import React from "react";
import { Calendar, Save, Loader2, CheckCircle } from "lucide-react";
import { useDiaryReview } from "./hooks/useDiaryReview";
import { formatDateForDisplay } from "./utils/diaryReviewUtils";
import { TodayRecordSection } from "./components/TodayRecordSection";
import { StatusSection } from "./components/StatusSection";
import { SummarySection } from "./components/SummarySection";

export default function DiaryReviewPage() {
  const {
    selectedDate,
    formData,
    isLoading,
    isSaving,
    saveSuccess,
    error,
    currentUser,
    authChecking,
    collapsedSections,
    handleDateChange,
    handleChange,
    toggleSection,
    handleSave,
  } = useDiaryReview();

  if (authChecking) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-4xl">
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
      <div className="mx-auto max-w-4xl">
        {currentUser && currentUser.isDevMode && (
          <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-700">
            开发模式：使用测试用户 ID ({currentUser.id})
          </div>
        )}

        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">日记 / 复盘</h1>
            <p className="mt-1 text-sm text-slate-500">
              结构化复盘输入页
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 flex-1 sm:flex-none">
              <Calendar className="h-5 w-5 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="border-none bg-transparent text-sm text-slate-700 outline-none w-full"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saveSuccess ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? "保存中..." : saveSuccess ? "已保存" : "保存"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mb-6 text-lg font-medium text-slate-700">
          {formatDateForDisplay(selectedDate)}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {!formData.did_what && !formData.planned_what && !formData.biggest_progress && !formData.biggest_problem && !formData.tomorrow_plan && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5 sm:p-6">
                <h3 className="text-base font-semibold text-purple-900 mb-2">开始今日复盘</h3>
                <p className="text-sm text-purple-700">
                  记录今天做了什么、计划完成什么、最重要的推进和问题。结构化复盘帮助你持续改进。
                </p>
              </div>
            )}

            <TodayRecordSection
              formData={formData}
              collapsed={collapsedSections['today_record'] || false}
              onToggle={() => toggleSection('today_record')}
              onFieldChange={(field, value) => handleChange(field, value)}
            />

            <StatusSection
              formData={formData}
              collapsed={collapsedSections['status'] || false}
              onToggle={() => toggleSection('status')}
              onFieldChange={handleChange}
            />

            <SummarySection
              formData={formData}
              collapsed={collapsedSections['summary'] || false}
              onToggle={() => toggleSection('summary')}
              onFieldChange={(field, value) => handleChange(field, value)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
