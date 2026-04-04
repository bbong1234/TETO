// ============================================================================
// 📁 主系统模块
// 功能：每日记录页面
// 描述：用户填写每日核心行为数据的主界面
// 模块类型：前端页面
// ============================================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar, Save, Loader2, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { DailyRecordFormValues } from "@/types/daily-record";
import { RECORD_ITEM_GROUPS } from "@/constants/record-items";
import {
  getDailyRecordByDate,
  formValuesToFormData,
} from "@/lib/db/daily-record";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user-id";

function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "yyyy年M月d日 EEEE", { locale: zhCN });
}

function getEmptyFormValues(date: string): DailyRecordFormValues {
  return {
    recordDate: date,
    note: "",
    items: {},
  };
}

export default function DailyRecordPage() {
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()));
  const [formData, setFormData] = useState<DailyRecordFormValues>(getEmptyFormValues(selectedDate));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // 获取当前用户
  useEffect(() => {
    const getCurrentUserAsync = async () => {
      console.log("[DailyRecordPage] 开始获取当前用户");
      
      try {
        const user = await getCurrentUser();
        console.log("[DailyRecordPage] 获取用户成功:", {
          id: user.id,
          email: user.email,
          isDevMode: user.isDevMode,
        });
        setCurrentUser(user);
      } catch (err) {
        console.error("[DailyRecordPage] 获取用户失败:", err);
        setError(err instanceof Error ? err.message : "获取用户信息失败");
      } finally {
        setAuthChecking(false);
      }
    };
    
    getCurrentUserAsync();
  }, []);

  const loadRecord = useCallback(async (date: string, user: CurrentUser) => {
    console.log("[loadRecord] 开始加载, date:", date, "userId:", user.id);
    setIsLoading(true);
    setError(null);
    setFormData(getEmptyFormValues(date));
    try {
      const record = await getDailyRecordByDate(user.id, date);
      console.log("[loadRecord] 查询结果:", record);
      if (record) {
        const formValues = formValuesToFormData(record, date);
        console.log("[loadRecord] 回填表单:", formValues);
        setFormData(formValues);
      }
    } catch (err) {
      console.error("[loadRecord] 加载失败:", err);
      setError("加载记录失败，请重试");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecking && currentUser) {
      loadRecord(selectedDate, currentUser);
    }
  }, [selectedDate, authChecking, currentUser, loadRecord]);

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

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

        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>历史功能对照页面（只读）</strong> - 这是 TETO 1.0 的每日记录功能，仅用于查看历史数据对比。当前页面已禁用编辑功能，建议使用新的任务管理模块进行日常操作。
        </div>

        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">每日记录（历史查看）</h1>
            <p className="mt-1 text-sm text-slate-500">
              查看每日核心行为数据（只读模式）
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 flex-1 sm:flex-none">
              <Calendar className="h-5 w-5 text-slate-400" />
              <input
                type="date"
                disabled
                value={selectedDate}
                className="border-none bg-transparent text-sm text-slate-700 outline-none w-full disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
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
            {!Object.values(formData.items).some(v => v !== undefined && v !== null && v !== '') && !formData.note && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
                <h3 className="text-base font-semibold text-blue-900 mb-2">开始记录今日数据</h3>
                <p className="text-sm text-blue-700">
                  填写下方各项数据，记录你今天的学习、生活与成长。数据将用于统计分析，帮助你追踪长期趋势。
                </p>
              </div>
            )}

            {Object.entries(RECORD_ITEM_GROUPS).map(([groupKey, group]) => (
              <section
                key={groupKey}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(groupKey)}
                  className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
                >
                  <h2 className="text-lg font-semibold text-slate-800">
                    {group.label}
                  </h2>
                  {collapsedSections[groupKey] ? (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  )}
                </button>
                {!collapsedSections[groupKey] && (
                  <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((item) => (
                        <div key={item.key} className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium text-slate-600">
                            {item.name}
                            {item.unit && (
                              <span className="ml-1 text-slate-400">
                                ({item.unit})
                              </span>
                            )}
                          </label>
                          {item.type === "time" ? (
                            <input
                              type="time"
                              disabled
                              value={
                                formData.items[item.key as keyof typeof formData.items] ||
                                ""
                              }
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          ) : (
                            <input
                              type="number"
                              disabled
                              min="0"
                              step={item.type === "number" ? "1" : "1"}
                              value={
                                formData.items[item.key as keyof typeof formData.items] ||
                                ""
                              }
                              placeholder=""
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ))}

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('note')}
                className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
              >
                <h2 className="text-lg font-semibold text-slate-800">
                  备注
                </h2>
                {collapsedSections['note'] ? (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                )}
              </button>
              {!collapsedSections['note'] && (
                <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                  <textarea
                    disabled
                    value={formData.note}
                    placeholder="记录今天的想法、状态或其他备注..."
                    rows={4}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
