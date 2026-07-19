import { createClient } from '@/lib/supabase/server';
import { deleteOneOwnedRow } from '@/lib/postgres/write-helpers';
import type { ProjectNote, CreateProjectNotePayload, ProjectNoteType } from '@/types/teto';

export async function listProjectNotes(
  userId: string,
  options?: { item_id?: string; note_type?: ProjectNoteType; limit?: number }
): Promise<ProjectNote[]> {
  const supabase = await createClient();
  let q = supabase
    .from('project_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.item_id) q = q.eq('item_id', options.item_id);
  if (options?.note_type) q = q.eq('note_type', options.note_type);
  if (options?.limit) q = q.limit(options.limit);

  const { data, error } = await q;
  if (error) throw new Error(`查询项目笔记失败: ${error.message}`);
  return (data ?? []) as ProjectNote[];
}

export async function createProjectNote(
  userId: string,
  payload: CreateProjectNotePayload
): Promise<ProjectNote> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_notes')
    .insert({
      user_id: userId,
      item_id: payload.item_id,
      content: payload.content,
      note_type: payload.note_type ?? 'knowledge',
      source_event_id: payload.source_event_id ?? null,
      record_id: payload.record_id ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`创建项目笔记失败: ${error.message}`);
  return data as ProjectNote;
}

export async function deleteProjectNote(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  await deleteOneOwnedRow(
    supabase,
    'project_notes',
    [
      { column: 'id', value: id },
      { column: 'user_id', value: userId },
    ],
    '删除项目笔记失败'
  );
}

/** 从 milestone/idea 事件沉淀到知识库 */
export async function sinkEventToKnowledge(
  userId: string,
  params: {
    item_id: string;
    content: string;
    note_type: ProjectNoteType;
    source_event_id?: string;
    record_id?: string;
  }
): Promise<ProjectNote | null> {
  if (!params.content.trim() || !params.item_id) return null;
  return createProjectNote(userId, {
    item_id: params.item_id,
    content: params.content.trim(),
    note_type: params.note_type,
    source_event_id: params.source_event_id,
    record_id: params.record_id,
  });
}
