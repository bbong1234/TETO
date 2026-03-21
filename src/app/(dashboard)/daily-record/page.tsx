"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar, Save, Loader2, CheckCircle } from "lucide-react";
import type { DailyRecordFormValues } from "@/types/daily-record";
import { RECORD_ITEM_GROUPS } from "@/constants/record-items";
import {
  getDailyRecordByDate,
  saveDailyRecord,
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
    setSaveSuccess(false);
  };

  const handleItemChange = (key: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      items: {
        ...prev.items,
        [key]: value === "" ? undefined : value,
      },
    }));
    setSaveSuccess(false);
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      note: e.target.value,
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
      const result = await saveDailyRecord(currentUser.id, {
        ...formData,
        recordDate: selectedDate,
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
            <h1 className="text-2xl font-bold text-slate-900">每日记录</h1>
            <p className="mt-1 text-sm text-slate-500">
              填写每日核心行为数据
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
            {Object.entries(RECORD_ITEM_GROUPS).map(([groupKey, group]) => (
              <section
                key={groupKey}
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm"
              >
                <h2 className="mb-4 text-lg font-semibold text-slate-800">
                  {group.label}
                </h2>
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
                          value={
                            formData.items[item.key as keyof typeof formData.items] ||
                            ""
                          }
                          onChange={(e) =>
                            handleItemChange(item.key, e.target.value)
                          }
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                        />
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step={item.type === "number" ? "1" : "1"}
                          value={
                            formData.items[item.key as keyof typeof formData.items] ||
                            ""
                          }
                          onChange={(e) =>
                            handleItemChange(
                              item.key,
                              e.target.value === ""
                                ? ""
                                : parseFloat(e.target.value)
                            )
                          }
                          placeholder="0"
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">
                备注
              </h2>
              <textarea
                value={formData.note}
                onChange={handleNoteChange}
                placeholder="记录今天的想法、状态或其他备注..."
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
