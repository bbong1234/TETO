/** 将数据库/JSON 各类时间值统一为可排序字符串。 */
export function toSortableTimeString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'object') {
    const candidate = value as { toISOString?: () => string };
    if (typeof candidate.toISOString === 'function') {
      try {
        return candidate.toISOString();
      } catch {
        /* fall through */
      }
    }
  }
  return String(value);
}

export function compareTimesDesc(a: unknown, b: unknown): number {
  return toSortableTimeString(b).localeCompare(toSortableTimeString(a));
}
