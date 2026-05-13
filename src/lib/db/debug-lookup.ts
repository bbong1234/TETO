import { createClient } from '@/lib/supabase/server';
import { getRecordById } from '@/lib/db/records';
import { getInputById } from '@/lib/db/inputs';
import type { Input } from '@/types/inputs';

export interface DebugLookupResult {
  query: string;
  record: { id: string; content: string; date?: string; type: string } | null;
  input: Pick<Input, 'id' | 'raw_input' | 'status' | 'created_at'> | null;
  trace: {
    trace_id: string;
    operation: string;
    status: string | null;
    created_at: string;
  } | null;
}

export async function debugLookup(userId: string, q: string): Promise<DebugLookupResult> {
  const qTrim = q.trim();
  const empty: DebugLookupResult = {
    query: qTrim,
    record: null,
    input: null,
    trace: null,
  };
  if (!qTrim) return empty;

  const supabase = await createClient();

  const [recordFull, inputRow, traceRow] = await Promise.all([
    getRecordById(userId, qTrim).catch(() => null),
    getInputById(userId, qTrim).catch(() => null),
    supabase
      .from('trace_summaries')
      .select('trace_id, operation, status, created_at')
      .eq('user_id', userId)
      .eq('trace_id', qTrim)
      .maybeSingle(),
  ]);

  let record: DebugLookupResult['record'] = null;
  if (recordFull) {
    record = {
      id: recordFull.id,
      content: recordFull.content?.slice(0, 200) ?? '',
      date: recordFull.date,
      type: recordFull.type,
    };
  }

  let input: DebugLookupResult['input'] = null;
  if (inputRow) {
    input = {
      id: inputRow.id,
      raw_input: inputRow.raw_input?.slice(0, 200) ?? '',
      status: inputRow.status,
      created_at: inputRow.created_at,
    };
  }

  let trace: DebugLookupResult['trace'] = null;
  if (!traceRow.error && traceRow.data) {
    const t = traceRow.data as Record<string, unknown>;
    trace = {
      trace_id: String(t.trace_id ?? qTrim),
      operation: String(t.operation ?? ''),
      status: t.status != null ? String(t.status) : null,
      created_at: String(t.created_at ?? ''),
    };
  }

  return { query: qTrim, record, input, trace };
}
