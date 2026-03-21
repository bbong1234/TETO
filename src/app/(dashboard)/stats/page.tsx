"use client";

import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Loader2, CheckCircle, Clock, ArrowRight, BarChart3, FileText, BookOpen, Target, Calendar } from "lucide-react";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/get-current-user-id";
import { getDailyRecordByDate } from "@/lib/db/daily-record";
import { getDiaryReviewByDate } from "@/lib/db/diary-reviews";
import { getProjects } from "@/lib/db/projects";
import type { Project } from "@/types/projects";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatDateForDisplay(date: Date): string {
  return format(date, "MM/dd", { locale: zhCN });
}

type TimeRange = "7days" | "30days";

export default function StatsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("7days");

  const [recordTrend, setRecordTrend] = useState<Array<{ date: string; hasRecord: number }>>([]);
  const [reviewTrend, setReviewTrend] = useState<Array<{ date: string; hasReview: number }>>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [activeProjects, setActiveProjects] = useState(0);
  const [completedProjects, setCompletedProjects] = useState(0);

  useEffect(() => {
    const getCurrentUserAsync = async () => {
      console.log("[StatsPage] 开始获取当前用户");
      
      try {
        const user = await getCurrentUser();
        console.log("[StatsPage] 获取用户成功:", {
          id: user.id,
          email: user.email,
          isDevMode: user.isDevMode,
        });
        setCurrentUser(user);
      } catch (err) {
        console.error("[StatsPage] 获取用户失败:", err);
        setError(err instanceof Error ? err.message : "获取用户信息失败");
      } finally {
        setAuthChecking(false);
      }
    };
    
    getCurrentUserAsync();
  }, []);

  useEffect(() => {
    if (!authChecking && currentUser) {
      loadStatsData(currentUser);
    }
  }, [authChecking, currentUser, timeRange]);

  const loadStatsData = async (user: CurrentUser) => {
    console.log("[loadStatsData] 开始加载统计数据, 时间范围:", timeRange);
    setIsLoading(true);
    setError(null);

    try {
      const days = timeRange === "7days" ? 7 : 30;
      const endDate = new Date();
      
      // 加载记录和复盘趋势
      const recordPromises = [];
      const reviewPromises = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(endDate, i);
        const dateStr = formatDateForInput(date);
        
        recordPromises.push(
          getDailyRecordByDate(user.id, dateStr)
            .then(record => ({ date: formatDateForDisplay(date), hasRecord: record ? 1 : 0 }))
        );
        
        reviewPromises.push(
          getDiaryReviewByDate(user.id, dateStr)
            .then(review => ({ date: formatDateForDisplay(date), hasReview: review ? 1 : 0 }))
        );
      }

      // 加载项目数据
      const projectsPromise = getProjects(user.id);

      // 并行执行所有请求
      const [recordResults, reviewResults, projectsData] = await Promise.all([
        Promise.all(recordPromises),
        Promise.all(reviewPromises),
        projectsPromise
      ]);

      console.log("[loadStatsData] 加载结果:", {
        recordResults: recordResults.length,
        reviewResults: reviewResults.length,
        projectsCount: projectsData.length
      });

      setRecordTrend(recordResults);
      setReviewTrend(reviewResults);
      setProjects(projectsData);
      setTotalProjects(projectsData.length);
      setActiveProjects(projectsData.filter(p => p.status === 'active').length);
      setCompletedProjects(projectsData.filter(p => p.status === 'completed').length);
    } catch (err) {
      console.error("[loadStatsData] 加载失败:", err);
      setError("加载统计数据失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

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
              查看最近 {timeRange === "7days" ? "7" : "30"} 天的趋势和统计
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setTimeRange("7days")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all ${
                timeRange === "7days"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              最近 7 天
            </button>
            <button
              onClick={() => setTimeRange("30days")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all ${
                timeRange === "30days"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              最近 30 天
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Daily Record 填写趋势</h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : recordTrend.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-600">暂无数据</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recordTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis domain={[0, 1]} tickFormatter={(value) => value === 1 ? '已填写' : '未填写'} stroke="#64748b" />
                  <Tooltip 
                    formatter={(value) => [value === 1 ? '已填写' : '未填写', '状态']}
                    labelFormatter={(label) => `日期: ${label}`}
                  />
                  <Bar dataKey="hasRecord" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Diary Review 填写趋势</h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : reviewTrend.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-600">暂无数据</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reviewTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis domain={[0, 1]} tickFormatter={(value) => value === 1 ? '已填写' : '未填写'} stroke="#64748b" />
                  <Tooltip 
                    formatter={(value) => [value === 1 ? '已填写' : '未填写', '状态']}
                    labelFormatter={(label) => `日期: ${label}`}
                  />
                  <Line dataKey="hasReview" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 mb-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">总项目数</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {totalProjects}
                </p>
              </div>
              <Target className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">进行中项目</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {activeProjects}
                </p>
              </div>
              <Clock className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">已完成项目</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {completedProjects}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-purple-500" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">项目概览</h2>
            <span className="text-sm text-slate-500">
              共 {totalProjects} 个项目
            </span>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-600">暂无项目</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map((project) => {
                const percent = project.target_total > 0 ? ((project.current_progress / project.target_total) * 100).toFixed(0) : '0';
                return (
                  <div key={project.id} className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-slate-900">{project.name}</p>
                        <span className="text-sm text-slate-500">{percent}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {project.current_progress} / {project.target_total} {project.unit}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <a
            href="/daily-record"
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">每日记录</p>
                <p className="text-sm text-slate-500">填写今日行为数据</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-400" />
          </a>

          <a
            href="/diary-review"
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-100 p-3">
                <BookOpen className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">日记复盘</p>
                <p className="text-sm text-slate-500">结构化复盘输入</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-400" />
          </a>

          <a
            href="/projects"
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-100 p-3">
                <Target className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">项目管理</p>
                <p className="text-sm text-slate-500">管理长期项目和进度</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-400" />
          </a>

          <a
            href="/dashboard"
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-100 p-3">
                <BarChart3 className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">仪表盘</p>
                <p className="text-sm text-slate-500">查看工作台概览</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-400" />
          </a>
        </section>
      </div>
    </main>
  );
}
