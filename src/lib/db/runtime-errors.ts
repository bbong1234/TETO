import { createClient } from '@/lib/supabase/server';

export interface RuntimeErrorInsert {
  user_id: string;
  error_code: string;
  message: string;
  stack?: string | null;
  source: 'server' | 'client';
  severity: 'warn' | 'error' | 'fatal';
  trace_id?: string | null;
  record_id?: string | null;
  input_id?: string | null;
  url?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertRuntimeError(row: RuntimeErrorInsert): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('errors')
    .insert({
      user_id: row.user_id,
      error_code: row.error_code,
      message: row.message,
      stack: row.stack ?? null,
      source: row.source,
      severity: row.severity,
      trace_id: row.trace_id ?? null,
      record_id: row.record_id ?? null,
      input_id: row.input_id ?? null,
      url: row.url ?? null,
      user_agent: row.user_agent ?? null,
      metadata: row.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) throw new Error(`errors 写入失败: ${error.message}`);
  return { id: data.id as string };
}

export async function listRuntimeErrors(userId: string, limit: number = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('errors')
    .select(
      'id, error_code, message, source, severity, trace_id, record_id, input_id, url, occurred_at'
    )
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(Math.min(limit, 500));

  if (error) throw new Error(`errors 列表失败: ${error.message}`);
  return data ?? [];
}
