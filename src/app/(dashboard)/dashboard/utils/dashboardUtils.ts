import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export function formatDateForDisplay(date: Date): string {
  return format(date, "yyyy年M月d日 EEEE", { locale: zhCN });
}

export function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
