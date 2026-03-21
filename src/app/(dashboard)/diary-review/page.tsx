"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar, Save, Loader2, CheckCircle } from "lucide-react";
import type { DiaryReviewFormValues } from "@/types/diary-review";
import { STATUS_OPTIONS, EMOTION_OPTIONS } from "@/constants/review-options";
import {
  getDiaryReviewByDate,
  saveDiaryReview,
  recordToFormValues,
} from "@/lib/db/diary-reviews";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user-id";

function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "yyyy年M月d日 EEEE", { locale: zhCN });
}

function getEmptyFormValues(date: string): DiaryReviewFormValues {
  return {
    reviewDate: date,
    did_what: "",
    planned_what: "",
    completion_rate: null,
    status_label: "",
    emotion_label: "",
    biggest_progress: "",
    biggest_problem: "",
    tomorrow_plan: "",
  };
}

export default function DiaryReviewPage() {
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()));
  const [formData, setFormData] = useState<DiaryReviewFormValues>(getEmptyFormValues(selectedDate));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // 获取当前用户
  useEffect(() => {
    const getCurrentUserAsync = async () => {
      console.log("[DiaryReviewPage] 开始获取当前用户");
      
      try {
        const user = await getCurrentUser();
        console.log("[DiaryReviewPage] 获取用户成功:", {
          id: user.id,
          email: user.email,
          isDevMode: user.isDevMode,
        });
        setCurrentUser(user);
      } catch (err) {
        console.error("[DiaryReviewPage] 获取用户失败:", err);
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
      const record = await getDiaryReviewByDate(user.id, date);
      console.log("[loadRecord] 查询结果:", record);
      if (record) {
        const formValues = recordToFormValues(record, date);
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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
    setSaveSuccess(false);
  };

  const handleChange = (
    field: keyof DiaryReviewFormValues,
    value: string | number | null
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!currentUser) {
      console.error("[handleSave] 用户未初始化");
      setError("用户信息未加载，请刷新页面");
      return;
    }

    console.log("[handleSave] 开始保存");
    console.log("[handleSave] selectedDate:", selectedDate);
    console.log("[handleSave] formData:", JSON.stringify(formData, null, 2));
    console.log("[handleSave] 当前用户:", {
      id: currentUser.id,
      isDevMode: currentUser.isDevMode,
    });

    setIsSaving(true);
    setError(null);
    try {
      const result = await saveDiaryReview(currentUser.id, {
        ...formData,
        reviewDate: selectedDate,
      });
      console.log("[handleSave] 保存成功, 返回结果:", result);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadRecord(selectedDate, currentUser);
    } catch (err) {
      console.error("[handleSave] 保存失败:", err);
      setError(`保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setIsSaving(false);
    }
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
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">今日记录</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    今天做了什么
                  </label>
                  <textarea
                    rows={5}
                    value={formData.did_what}
                    onChange={(e) => handleChange("did_what", e.target.value)}
                    placeholder="用自然语言写今天实际做了什么"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    原本想做什么
                  </label>
                  <textarea
                    rows={4}
                    value={formData.planned_what}
                    onChange={(e) => handleChange("planned_what", e.target.value)}
                    placeholder="写原本计划完成的内容"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">状态评估</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    完成度（0-100）
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.completion_rate ?? ""}
                    onChange={(e) =>
                      handleChange(
                        "completion_rate",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                    placeholder="0-100"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    今日状态
                  </label>
                  <select
                    value={formData.status_label}
                    onChange={(e) => handleChange("status_label", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  >
                    <option value="">请选择</option>
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    今日情绪
                  </label>
                  <select
                    value={formData.emotion_label}
                    onChange={(e) => handleChange("emotion_label", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  >
                    <option value="">请选择</option>
                    {EMOTION_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">总结与计划</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    今天最重要的推进
                  </label>
                  <input
                    type="text"
                    value={formData.biggest_progress}
                    onChange={(e) => handleChange("biggest_progress", e.target.value)}
                    placeholder="一句话写今天最重要推进"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    今天最大的问题
                  </label>
                  <input
                    type="text"
                    value={formData.biggest_problem}
                    onChange={(e) => handleChange("biggest_problem", e.target.value)}
                    placeholder="一句话写今天最大问题"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    明日计划
                  </label>
                  <textarea
                    rows={4}
                    value={formData.tomorrow_plan}
                    onChange={(e) => handleChange("tomorrow_plan", e.target.value)}
                    placeholder="写明天想做什么"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
