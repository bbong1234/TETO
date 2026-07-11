import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { listProjectNotes, createProjectNote, deleteProjectNote } from '@/lib/db/project-notes';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { ProjectNoteType } from '@/types/teto';

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = request.nextUrl;
    const item_id = searchParams.get('item_id') ?? undefined;
    const note_type = (searchParams.get('note_type') as ProjectNoteType | null) ?? undefined;
    const limitRaw = searchParams.get('limit');
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;

    const notes = await listProjectNotes(userId, { item_id, note_type, limit });
    return apiSuccess(notes, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body = await request.json() as {
      item_id?: string;
      content?: string;
      note_type?: ProjectNoteType;
    };

    if (!body.item_id) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'item_id 必填', ctx.traceId);
    }
    if (!body.content?.trim()) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'content 必填', ctx.traceId);
    }

    const note = await createProjectNote(userId, {
      item_id: body.item_id,
      content: body.content.trim(),
      note_type: body.note_type,
    });
    return apiSuccess(note, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'id 必填', ctx.traceId);
    }
    await deleteProjectNote(userId, id);
    return apiSuccess({ id }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
