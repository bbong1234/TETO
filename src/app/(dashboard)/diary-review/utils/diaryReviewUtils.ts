import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DiaryReviewFormValues } from "@/types/diary-review";

export function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "yyyy年M月d日 EEEE", { locale: zhCN });
}

export function getEmptyFormValues(date: string): DiaryReviewFormValues {
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
