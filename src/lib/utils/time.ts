/**
 * 将分钟数转换为 HH:MM 格式字符串
 * @param minutes 分钟数（如 90）
 * @returns HH:MM 格式字符串（如 "01:30"）
 */
export function formatMinutesToTime(minutes: number): string {
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * 将 HH:MM 格式字符串转换为分钟数
 * @param timeStr HH:MM 格式字符串（如 "01:30"）
 * @returns 分钟数（如 90）
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}
