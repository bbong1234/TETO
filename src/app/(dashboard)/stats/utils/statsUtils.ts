import { format, subDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { ItemTrendData } from "../types";

export function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatDateForDisplay(date: Date): string {
  return format(date, "MM/dd", { locale: zhCN });
}

export function generateDateRange(days: number): Date[] {
  const endDate = new Date();
  const dates: Date[] = [];
  
  for (let i = days - 1; i >= 0; i--) {
    dates.push(subDays(endDate, i));
  }
  
  return dates;
}

export function createEmptyTrendData(dates: Date[]): ItemTrendData[] {
  return dates.map(date => ({
    date: formatDateForDisplay(date),
  }));
}

export function calculateCompletionRate(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}
