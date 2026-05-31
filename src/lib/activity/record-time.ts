/** 记录编辑/补记共用的时间序列化工具 */

export function isoToTimeHHMM(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isoToDateYYYYMMDD(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateAndTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

export function todayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function resolveRecordAnchorDate(record: {
  date?: string | null;
  time_anchor_date?: string | null;
  occurred_at?: string | null;
  created_at?: string;
}): string {
  if (record.date) return record.date;
  if (record.time_anchor_date) return record.time_anchor_date;
  if (record.occurred_at) return isoToDateYYYYMMDD(record.occurred_at);
  if (record.created_at) return isoToDateYYYYMMDD(record.created_at);
  return todayDateStr();
}
