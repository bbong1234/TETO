import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { ProjectWithLogs } from "@/types/projects";

export function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatDateTimeForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "yyyy年M月d日", { locale: zhCN });
}

export function formatDateTimeForDisplay(dateStr: string): string {
  console.log("[formatDateTimeForDisplay] 输入原始值:", dateStr);
  const date = new Date(dateStr);
  console.log("[formatDateTimeForDisplay] new Date后:", date.toISOString());
  const result = format(date, "yyyy-MM-dd HH:mm:ss");
  console.log("[formatDateTimeForDisplay] 格式化输出:", result);
  return result;
}

export function formatDateTimeForDisplayDate(date: Date): string {
  return format(date, "yyyy-MM-dd HH:mm:ss");
}

export function calculateProjectPrediction(project: ProjectWithLogs) {
  const remaining = project.target_total - project.current_progress;
  
  if (remaining <= 0) {
    return {
      remaining: 0,
      predictedFinishDate: null,
      predictedRemainingDays: 0,
      avgProgressPerDay: 0,
    };
  }

  const today = new Date();
  const startDate = new Date(project.start_date);
  const elapsedDays = Math.max(1, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  const avgProgressPerDay = project.current_progress / elapsedDays;

  if (avgProgressPerDay <= 0) {
    return {
      remaining,
      predictedFinishDate: null,
      predictedRemainingDays: null,
      avgProgressPerDay: 0,
    };
  }

  const predictedRemainingDays = Math.ceil(remaining / avgProgressPerDay);
  const predictedFinishDate = new Date();
  predictedFinishDate.setDate(predictedFinishDate.getDate() + predictedRemainingDays);

  return {
    remaining,
    predictedFinishDate,
    predictedRemainingDays,
    avgProgressPerDay,
  };
}
