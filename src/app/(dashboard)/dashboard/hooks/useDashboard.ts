import { useState, useEffect } from "react";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user-id";
import { getDailyRecordByDate } from "@/lib/db/daily-record";
import { getDiaryReviewByDate } from "@/lib/db/diary-reviews";
import { getProjects } from "@/lib/db/projects";
import type { Project } from "@/types/projects";
import { formatDateForInput } from "../utils/dashboardUtils";

export function useDashboard() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [todayRecord, setTodayRecord] = useState(false);
  const [todayReview, setTodayReview] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectsCount, setActiveProjectsCount] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const getCurrentUserAsync = async () => {
      console.log("[useDashboard] 开始获取当前用户");
      
      try {
        const user = await getCurrentUser();
        console.log("[useDashboard] 获取用户成功:", {
          id: user.id,
          email: user.email,
          isDevMode: user.isDevMode,
        });
        setCurrentUser(user);
      } catch (err) {
        console.error("[useDashboard] 获取用户失败:", err);
        setError(err instanceof Error ? err.message : "获取用户信息失败");
      } finally {
        setAuthChecking(false);
      }
    };
    
    getCurrentUserAsync();
  }, []);

  useEffect(() => {
    if (!authChecking && currentUser) {
      loadDashboardData(currentUser);
    }
  }, [authChecking, currentUser]);

  const loadDashboardData = async (user: CurrentUser) => {
    console.log("[loadDashboardData] 开始加载仪表盘数据");
    setIsLoading(true);
    setError(null);

    try {
      const today = formatDateForInput(new Date());

      const [record, review, projectsData] = await Promise.all([
        getDailyRecordByDate(user.id, today),
        getDiaryReviewByDate(user.id, today),
        getProjects(user.id),
      ]);

      console.log("[loadDashboardData] 加载结果:", {
        hasRecord: !!record,
        hasReview: !!review,
        projectsCount: projectsData.length,
      });

      setTodayRecord(!!record);
      setTodayReview(!!review);
      setProjects(projectsData);
      setActiveProjectsCount(projectsData.filter(p => p.status === 'active').length);
    } catch (err) {
      console.error("[loadDashboardData] 加载失败:", err);
      setError("加载仪表盘数据失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  return {
    // 状态
    currentUser,
    authChecking,
    isLoading,
    error,
    todayRecord,
    todayReview,
    projects,
    activeProjectsCount,
    collapsedSections,
    
    // 方法
    loadDashboardData,
    toggleSection,
  };
}
