import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { listActivityEvents, createActivityEvent } from '@/lib/db/activity-events';
import { sinkEventToKnowledge } from '@/lib/db/project-notes';
import { getRecordById } from '@/lib/db/records';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { ActivityEventType } from '@/types/teto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'session_id 无效', ctx.traceId);
    }
    const events = await listActivityEvents(userId, sessionId);
    return apiSuccess(events, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body = await request.json() as {
      session_id?: string;
      event_type?: ActivityEventType;
      content?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.session_id || !UUID_REGEX.test(body.session_id)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'session_id 无效', ctx.traceId);
    }
    if (!body.event_type) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'event_type 必填', ctx.traceId);
    }

    const event = await createActivityEvent(userId, {
      session_id: body.session_id,
      event_type: body.event_type,
      content: body.content,
      payload: body.payload,
    });

    // idea / milestone 沉淀到知识库（需有归属事项）
    if ((body.event_type === 'idea' || body.event_type === 'milestone') && body.content?.trim()) {
      try {
        const session = await getRecordById(userId, body.session_id);
        if (session?.item_id) {
          await sinkEventToKnowledge(userId, {
            item_id: session.item_id,
            content: body.content.trim(),
            note_type: body.event_type === 'milestone' ? 'milestone' : 'knowledge',
            source_event_id: event.id,
            record_id: session.id,
          });
        }
      } catch {
        /* 知识库沉淀失败不阻断事件写入 */
      }
    }

    return apiSuccess(event, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
