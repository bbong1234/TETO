import { useState, useEffect, useCallback } from "react";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user-id";
import { getDailyRecordByDate } from "@/lib/db/daily-record";
import { getDiaryReviewByDate } from "@/lib/db/diary-reviews";
import { getProjects } from "@/lib/db/projects";
import type { Project } from "@/types/projects";
import { RECORD_ITEMS } from "@/constants/record-items";
import type { TimeRange, ItemTrendData, RecordTrendData, ReviewTrendData } from "../types";
import { formatDateForInput, formatDateForDisplay, generateDateRange } from "../utils/statsUtils";

export function useStats() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 时间状态拆分：全局、各区块、单项完全独立
  const [globalRange, setGlobalRange] = useState<TimeRange>("7days");
  const [dailyRecordRange, setDailyRecordRange] = useState<TimeRange>("7days");
  const [diaryRange, setDiaryRange] = useState<TimeRange>("7days");
  const [fixedBehaviorRange, setFixedBehaviorRange] = useState<TimeRange>("7days");
  const [itemRanges, setItemRanges] = useState<Record<string, TimeRange>>({});

  const [recordTrend, setRecordTrend] = useState<Record<TimeRange, RecordTrendData[]>>({
    "7days": [],
    "30days": []
  });
  const [reviewTrend, setReviewTrend] = useState<Record<TimeRange, ReviewTrendData[]>>({
    "7days": [],
    "30days": []
  });
  const [itemTrends, setItemTrends] = useState<Record<string, Record<TimeRange, ItemTrendData[]>>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [activeProjects, setActiveProjects] = useState(0);
  const [completedProjects, setCompletedProjects] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [itemFilterText, setItemFilterText] = useState<string>("");

  const selectedItemKeys = [
    'vocab_new',
    'vocab_review',
    'study_practice',
    'reading',
    'listening',
    'speaking',
    'exercise',
    'meditation',
    'entertainment',
    'method_task',
  ];

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set(selectedItemKeys));

  const selectAllItems = () => {
    setSelectedItems(new Set(selectedItemKeys));
  };

  const deselectAllItems = () => {
    setSelectedItems(new Set());
  };

  const toggleItemSelection = (itemKey: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  };

  const toggleItemCollapse = (itemKey: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey],
    }));
  };

  useEffect(() => {
    const getCurrentUserAsync = async () => {
      console.log("[useStats] 开始获取当前用户");
      
      try {
        const user = await getCurrentUser();
        console.log("[useStats] 获取用户成功:", {
          id: user.id,
          email: user.email,
          isDevMode: user.isDevMode,
        });
        setCurrentUser(user);
      } catch (err) {
        console.error("[useStats] 获取用户失败:", err);
        setError(err instanceof Error ? err.message : "获取用户信息失败");
      } finally {
        setAuthChecking(false);
      }
    };
    
    getCurrentUserAsync();
  }, []);

  useEffect(() => {
    if (!authChecking && currentUser) {
      // 只加载默认时间范围的数据，减少初始加载时间
      loadInitialStatsData(currentUser);
    }
  }, [authChecking, currentUser]);

  const loadInitialStatsData = async (user: CurrentUser) => {
    console.log("[loadInitialStatsData] 开始加载初始统计数据");
    setIsLoading(true);
    setError(null);

    try {
      // 只加载7天范围的数据
      const data7Days = await loadRangeData(user, "7days");
      
      // 只加载前5个项目的7天数据
      const itemTrendsData: Record<string, Record<TimeRange, ItemTrendData[]>> = {};
      const initialItemKeys = selectedItemKeys.slice(0, 5);
      
      await Promise.all(initialItemKeys.map(async (itemKey) => {
        const itemConfig = RECORD_ITEMS.find(item => item.key === itemKey);
        if (!itemConfig) return;

        itemTrendsData[itemKey] = {
          "7days": await loadItemTrendData(user, itemKey, "7days"),
          "30days": []
        };
      }));

      const projectsData = await getProjects(user.id);

      console.log("[loadInitialStatsData] 加载结果:", {
        itemTrendsCount: Object.keys(itemTrendsData).length,
        projectsCount: projectsData.length
      });

      setRecordTrend({ "7days": data7Days.recordTrend, "30days": [] });
      setReviewTrend({ "7days": data7Days.reviewTrend, "30days": [] });
      setItemTrends(itemTrendsData);
      setProjects(projectsData);
      setTotalProjects(projectsData.length);
      setActiveProjects(projectsData.filter(p => p.status === 'active').length);
      setCompletedProjects(projectsData.filter(p => p.status === 'completed').length);
    } catch (err) {
      console.error("[loadInitialStatsData] 加载失败:", err);
      setError("加载统计数据失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };
  
  // 全局时间改变时，同步所有区块时间
  useEffect(() => {
    if (!authChecking && currentUser) {
      setDailyRecordRange(globalRange);
      setDiaryRange(globalRange);
      setFixedBehaviorRange(globalRange);
      // 重置所有单项时间，让它们跟随区块默认时间
      setItemRanges({});
    }
  }, [globalRange, authChecking, currentUser]);

  const loadItemTrendData = useCallback(async (user: CurrentUser, itemKey: string, range: TimeRange) => {
    const days = range === "7days" ? 7 : 30;
    const dates = generateDateRange(days);
    const recordPromises = [];
    
    for (const date of dates) {
      const dateStr = formatDateForInput(date);
      recordPromises.push(
        getDailyRecordByDate(user.id, dateStr)
          .then(record => ({ date: formatDateForDisplay(date), record }))
      );
    }
    
    const recordResults = await Promise.all(recordPromises);
    const itemConfig = RECORD_ITEMS.find(item => item.key === itemKey);
    if (!itemConfig) return [];

    const trendData: ItemTrendData[] = recordResults.map(r => {
      const value = r.record?.items?.find((item: any) => item.item_key === itemKey);
      let numericValue = 0;
      
      if (itemConfig.type === 'number' && value?.value_number !== null && value?.value_number !== undefined) {
        numericValue = value.value_number;
      } else if (itemConfig.type === 'duration' && value?.value_duration !== null && value?.value_duration !== undefined) {
        numericValue = value.value_duration;
      }
      
      return {
        date: r.date,
        [itemKey]: numericValue,
      };
    });
    
    return trendData;
  }, []);

  const loadRangeData = useCallback(async (user: CurrentUser, range: TimeRange) => {
    const days = range === "7days" ? 7 : 30;
    const dates = generateDateRange(days);
    
    const recordPromises = [];
    const reviewPromises = [];
    
    for (const date of dates) {
      const dateStr = formatDateForInput(date);
      
      recordPromises.push(
        getDailyRecordByDate(user.id, dateStr)
          .then(record => ({ date: formatDateForDisplay(date), hasRecord: record ? 1 : 0, record }))
      );
      
      reviewPromises.push(
        getDiaryReviewByDate(user.id, dateStr)
          .then(review => ({ date: formatDateForDisplay(date), hasReview: review ? 1 : 0 }))
      );
    }
    
    const [recordResults, reviewResults] = await Promise.all([
      Promise.all(recordPromises),
      Promise.all(reviewPromises)
    ]);
    
    return {
      recordTrend: recordResults.map(r => ({ date: r.date, hasRecord: r.hasRecord })),
      reviewTrend: reviewResults.map(r => ({ date: r.date, hasReview: r.hasReview }))
    };
  }, []);

  const loadAllStatsData = async (user: CurrentUser) => {
    console.log("[loadAllStatsData] 开始加载所有时间范围的统计数据");
    setIsLoading(true);
    setError(null);

    try {
      // 加载两种时间范围的 Daily Record 和 Diary 数据
      const [data7Days, data30Days] = await Promise.all([
        loadRangeData(user, "7days"),
        loadRangeData(user, "30days")
      ]);

      // 为每个项目加载两种时间范围的数据
      const itemTrendsData: Record<string, Record<TimeRange, ItemTrendData[]>> = {};
      
      await Promise.all(selectedItemKeys.map(async (itemKey) => {
        const itemConfig = RECORD_ITEMS.find(item => item.key === itemKey);
        if (!itemConfig) return;

        itemTrendsData[itemKey] = {
          "7days": await loadItemTrendData(user, itemKey, "7days"),
          "30days": await loadItemTrendData(user, itemKey, "30days")
        };
      }));

      const projectsData = await getProjects(user.id);

      console.log("[loadAllStatsData] 加载结果:", {
        itemTrendsCount: Object.keys(itemTrendsData).length,
        projectsCount: projectsData.length
      });

      setRecordTrend({ "7days": data7Days.recordTrend, "30days": data30Days.recordTrend });
      setReviewTrend({ "7days": data7Days.reviewTrend, "30days": data30Days.reviewTrend });
      setItemTrends(itemTrendsData);
      setProjects(projectsData);
      setTotalProjects(projectsData.length);
      setActiveProjects(projectsData.filter(p => p.status === 'active').length);
      setCompletedProjects(projectsData.filter(p => p.status === 'completed').length);
    } catch (err) {
      console.error("[loadAllStatsData] 加载失败:", err);
      setError("加载统计数据失败，请重试");
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

  // 切换单个固定行为项目的时间范围
  const toggleItemRange = (itemKey: string, range: TimeRange) => {
    setItemRanges(prev => ({
      ...prev,
      [itemKey]: range
    }));
  };

  // 切换固定行为项区块的时间范围
  const toggleFixedBehaviorRange = (range: TimeRange) => {
    setFixedBehaviorRange(range);
    // 同步更新所有小项目的时间状态，让它们跟随区块默认时间
    setItemRanges({});
  };

  const getFilteredItemKeys = () => {
    return selectedItemKeys.filter(itemKey => {
      const itemConfig = RECORD_ITEMS.find(item => item.key === itemKey);
      if (!itemConfig) return false;
      if (!itemFilterText) return true;
      return itemConfig.name.toLowerCase().includes(itemFilterText.toLowerCase());
    });
  };

  return {
    // 状态
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
    
    // 方法
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
  };
}
