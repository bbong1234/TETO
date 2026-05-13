/**
 * RLS 错误解析工具
 *
 * 当 Supabase Postgres 因 RLS 策略拒绝写入时，
 * 从错误消息中提取表名，以便记录到日志/审计中。
 */

export interface RlsErrorInfo {
  /** 受影响的表名 */
  table: string | null;
  /** 原始 Postgres 错误码（如 '42501'） */
  pgCode: string | null;
  /** 原始错误消息 */
  message: string;
  /** 是否为 RLS 拒绝 */
  isRls: boolean;
}

/**
 * 解析 Supabase PostgrestError 中的 RLS 信息。
 *
 * 典型的 RLS 错误消息格式：
 *   "new row violates row-level security policy for table \"records\""
 *
 * @param error — Supabase 返回的 error 对象（有 code/message 字段）
 */
export function parseRlsError(error: { code?: string; message?: string }): RlsErrorInfo {
  const msg = error.message ?? '';
  const code = error.code ?? null;

  // Postgres RLS 错误码: 42501 = insufficient_privilege
  const isRls = code === '42501' || msg.includes('row-level security');

  // 从消息中提取表名
  let table: string | null = null;
  const tableMatch = msg.match(/for table "(\w+)"/);
  if (tableMatch) {
    table = tableMatch[1];
  }

  return { table, pgCode: code, message: msg, isRls };
}
