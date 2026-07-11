import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { performSessionAction, type SessionAction } from '@/lib/domain/activity-service';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiDomainError, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { persistTraceSummary } from '@/lib/observability/trace';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACTIONS: SessionAction[] = ['pause', 'resume', 'enter-nested', 'exit-nested'];

interface SessionActionBody {
  action: SessionAction;
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  phase_id?: string | null;
  tool_label?: string | null;
  tag_ids?: string[];
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body: SessionActionBody = await request.json();
    const supabase = await createClient();

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'action 无效', ctx.traceId);
    }

    if (body.item_id && !UUID_REGEX.test(body.item_id)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'item_id 格式无效', ctx.traceId);
    }

    const result = await performSessionAction({
      userId,
      action: body.action,
      content: body.content,
      item_id: body.item_id,
      sub_item_id: body.sub_item_id,
      phase_id: body.phase_id,
      tool_label: body.tool_label,
      tag_ids: body.tag_ids,
      supabase,
      traceId: ctx.traceId,
    });

    if (!result.ok) {
      return apiDomainError(result.errors, ctx.traceId);
    }

    persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: `activity_session_${body.action}`,
      status: 'ok',
    });

    return apiSuccess(result.data, ctx.traceId, 200, result.warnings?.length ? result.warnings : undefined);
  } catch (error) {
    return handleApiError(error);
  }
}
