import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { switchActivity } from '@/lib/domain/activity-service';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { persistTraceSummary } from '@/lib/observability/trace';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SwitchActivityBody {
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  phase_id?: string | null;
  tool_label?: string | null;
  tag_ids?: string[];
  start_paused?: boolean;
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body: SwitchActivityBody = await request.json();
    const supabase = await createClient();

    if (body.item_id && !UUID_REGEX.test(body.item_id)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'item_id 格式无效', ctx.traceId);
    }
    if (body.sub_item_id && !UUID_REGEX.test(body.sub_item_id)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'sub_item_id 格式无效', ctx.traceId);
    }
    if (body.phase_id && !UUID_REGEX.test(body.phase_id)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'phase_id 格式无效', ctx.traceId);
    }
    if (body.tag_ids) {
      if (!Array.isArray(body.tag_ids)) {
        return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'tag_ids 必须为数组', ctx.traceId);
      }
      for (const tagId of body.tag_ids) {
        if (typeof tagId !== 'string' || !UUID_REGEX.test(tagId)) {
          return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, `无效的 tag_id: ${tagId}`, ctx.traceId);
        }
      }
    }

    const result = await switchActivity({
      userId,
      content: body.content,
      item_id: body.item_id,
      sub_item_id: body.sub_item_id,
      phase_id: body.phase_id,
      tool_label: body.tool_label,
      tag_ids: body.tag_ids,
      start_paused: body.start_paused,
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
      operation: 'activity_switch',
      status: 'ok',
    });

    return apiSuccess(result.data, ctx.traceId, 200, result.warnings?.length ? result.warnings : undefined);
  } catch (error) {
    return handleApiError(error);
  }
}
