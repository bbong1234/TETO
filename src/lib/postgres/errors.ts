export interface PgError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export function toPgError(err: unknown): PgError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message: string; code?: string; detail?: string; hint?: string };
    return {
      message: e.message,
      code: e.code,
      details: e.detail,
      hint: e.hint,
    };
  }
  return { message: String(err) };
}

export function isNoRowsError(message: string): boolean {
  return message.includes('0 rows') || message.includes('no rows');
}
