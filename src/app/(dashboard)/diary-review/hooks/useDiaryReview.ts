import { useState, useEffect, useCallback } from "react";
import type { DiaryReviewFormValues } from "@/types/diary-review";
import {
  getDiaryReviewByDate,
  saveDiaryReview,
  recordToFormValues,
} from "@/lib/db/diary-reviews";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user-id";
import { formatDateForInput, getEmptyFormValues } from "../utils/diaryReviewUtils";

export function useDiaryReview() {
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()));
  const [formData, setFormData] = useState<DiaryReviewFormValues>(getEmptyFormValues(selectedDate));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // 获取当前用户
  useEffect(() => {
    const getCurrentUserAsync = async () => {
      console.log("[useDiaryReview] 开始获取当前用户");
      
      try {
        const user = await getCurrentUser();
        console.log("[useDiaryReview] 获取用户成功:", {
          id: user.id,
          email: user.email,
          isDevMode: user.isDevMode,
        });
        setCurrentUser(user);
      } catch (err) {
        console.error("[useDiaryReview] 获取用户失败:", err);
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

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
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

  return {
    // 状态
    selectedDate,
    formData,
    isLoading,
    isSaving,
    saveSuccess,
    error,
    currentUser,
    authChecking,
    collapsedSections,
    
    // 方法
    handleDateChange,
    handleChange,
    toggleSection,
    handleSave,
  };
}
