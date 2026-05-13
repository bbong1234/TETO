import { createClient } from '@/lib/supabase/server';
import type {
  Input,
  InputStatus,
  InputUnit,
  InputUnitStatus,
  PendingQuestion,
  ClassifierDecision,
  FieldOwner,
  AnsweredQuestion,
} from '@/types/inputs';

type Json = Record<string, unknown>;

export interface CreateInputRow {
  raw_input: string;
  source?: Input['source'];
  status?: InputStatus;
  trace_id?: string | null;
  batch_id?: string | null;
  total_units?: number;
  promoted_record_count?: number;
  metadata?: Json;
}

export interface CreateInputUnitRow {
  input_id: string;
  unit_index: number;
  unit_text?: string | null;
  parsed_semantic?: Json;
  classifier_decision?: ClassifierDecision | Json;
  field_ownership?: { [field: string]: FieldOwner };
  confidence_overall?: number | null;
  pending_question?: PendingQuestion | null;
  answered_questions?: AnsweredQuestion[];
  clarify_round?: number;
  clarify_max?: number;
  status?: InputUnitStatus;
  promoted_record_id?: string | null;
  trace_id?: string | null;
}

export async function createInput(userId: string, row: CreateInputRow): Promise<Input> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inputs')
    .insert({
      user_id: userId,
      raw_input: row.raw_input,
      source: row.source ?? 'quick',
      status: row.status ?? 'pending',
      trace_id: row.trace_id ?? null,
      batch_id: row.batch_id ?? null,
      total_units: row.total_units ?? 0,
      promoted_record_count: row.promoted_record_count ?? 0,
      metadata: row.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`创建 input 失败: ${error.message}`);
  }
  return data as Input;
}

export async function updateInput(
  userId: string,
  inputId: string,
  patch: Partial<Pick<Input, 'status' | 'promoted_record_count' | 'total_units' | 'metadata' | 'trace_id' | 'batch_id'>>
): Promise<Input> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inputs')
    .update(patch)
    .eq('id', inputId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`更新 input 失败: ${error.message}`);
  }
  return data as Input;
}

export async function getInputById(userId: string, inputId: string): Promise<Input | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inputs')
    .select('*')
    .eq('id', inputId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`查询 input 失败: ${error.message}`);
  }
  return (data as Input | null) ?? null;
}

export async function getInputUnitById(userId: string, unitId: string): Promise<InputUnit | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('input_units')
    .select('*')
    .eq('id', unitId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`查询 input_unit 失败: ${error.message}`);
  }
  return (data as InputUnit | null) ?? null;
}

export async function createInputUnits(userId: string, rows: CreateInputUnitRow[]): Promise<InputUnit[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const payload = rows.map((row) => ({
    input_id: row.input_id,
    user_id: userId,
    unit_index: row.unit_index,
    unit_text: row.unit_text ?? null,
    parsed_semantic: row.parsed_semantic ?? {},
    classifier_decision: row.classifier_decision ?? {},
    field_ownership: row.field_ownership ?? {},
    confidence_overall: row.confidence_overall ?? null,
    pending_question: row.pending_question ?? null,
    answered_questions: row.answered_questions ?? [],
    clarify_round: row.clarify_round ?? 0,
    clarify_max: row.clarify_max ?? 3,
    status: row.status ?? 'pending_clarify',
    promoted_record_id: row.promoted_record_id ?? null,
    trace_id: row.trace_id ?? null,
  }));

  const { data, error } = await supabase
    .from('input_units')
    .insert(payload)
    .select('*')
    .order('unit_index', { ascending: true });

  if (error) {
    throw new Error(`创建 input_units 失败: ${error.message}`);
  }
  return (data ?? []) as InputUnit[];
}

export async function listInputUnits(userId: string, inputId: string): Promise<InputUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('input_units')
    .select('*')
    .eq('input_id', inputId)
    .eq('user_id', userId)
    .order('unit_index', { ascending: true });

  if (error) {
    throw new Error(`查询 input_units 失败: ${error.message}`);
  }
  return (data ?? []) as InputUnit[];
}

export async function updateInputUnit(
  userId: string,
  unitId: string,
  patch: Partial<
    Pick<
      InputUnit,
      | 'pending_question'
      | 'answered_questions'
      | 'clarify_round'
      | 'status'
      | 'promoted_record_id'
      | 'parsed_semantic'
      | 'classifier_decision'
      | 'field_ownership'
      | 'confidence_overall'
      | 'trace_id'
    >
  >
): Promise<InputUnit> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('input_units')
    .update(patch)
    .eq('id', unitId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`更新 input_unit 失败: ${error.message}`);
  }
  return data as InputUnit;
}

