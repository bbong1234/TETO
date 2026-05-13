import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createRecordLink, getLinksForRecord, deleteRecordLink } from '@/lib/db/record-links';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import type { RecordLinkType } from '@/types/teto';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

const VALID_LINK_TYPES: RecordLinkType[] = ['completes', 'derived_from', 'postponed_from', 'related_to'];

/**
 * 同事项同天并发记录的允许关联类型
 * - completes: 计划完成（因果关系，允许）
 * - derived_from: 复合句拆分派生（程序生成，允许）
 * - postponed_from: 计划推迟（生命周期，允许）
 * - related_to: 并发事件关联（禁止——同事项同天的并发记录只是并行事件，不构成关联）
 */
const ALLOWED_SAME_ITEM_SAME_DAY_TYPES: RecordLinkType[] = ['completes', 'derived_from', 'postponed_from'];

/**
 * POST /api/v2/record-links
 * 创建记录关联
 * Body: { source_id: string; target_id: string; link_type: RecordLinkType }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body = await request.json();
    const { source_id, target_id, link_type } = body as {
      source_id?: string;
      target_id?: string;
      link_type?: string;
    };

    if (!source_id || !target_id || !link_type) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'source_id, target_id, link_type 均为必填', ctx.traceId, 400);
    }

    if (!VALID_LINK_TYPES.includes(link_type as RecordLinkType)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, `link_type 必须为: ${VALID_LINK_TYPES.join(', ')}`, ctx.traceId, 400);
    }

    if (source_id === target_id) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, '不能关联自身', ctx.traceId, 400);
    }

    // 服务端守卫：同一事项同一天的并发记录不得建立 related_to 关联
    // 即使 LLM 违反 prompt 约束错误返回 record_link_hint，这里也能拦截
    const supabase = await createClient();
    const { data: linkRecords } = await supabase
      .from('records')
      .select('id, item_id, record_day_id')
      .in('id', [source_id, target_id])
      .eq('user_id', userId);

    if (!linkRecords || linkRecords.length !== 2) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, '关联记录不存在或不属于当前用户', ctx.traceId, 404);
    }
    const [src, tgt] = linkRecords;
    const sameItem = !!(src.item_id && tgt.item_id && src.item_id === tgt.item_id);
    const sameDay = src.record_day_id === tgt.record_day_id;

    if (sameItem && sameDay && !ALLOWED_SAME_ITEM_SAME_DAY_TYPES.includes(link_type as RecordLinkType)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, '同一事项同一天的并发记录不应建立 related_to 关联，它们只是并行事件', ctx.traceId, 422);
    }

    const link = await createRecordLink(userId, {
      source_id,
      target_id,
      link_type: link_type as RecordLinkType,
    });

    return apiSuccess(link, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/v2/record-links?record_id=xxx
 * 获取某条记录的所有关联
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const record_id = searchParams.get('record_id');

    if (!record_id) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'record_id 查询参数为必填', ctx.traceId, 400);
    }

    const links = await getLinksForRecord(userId, record_id);
    return apiSuccess(links, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v2/record-links?id=xxx
 * 删除一条记录关联
 */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'id 查询参数为必填', ctx.traceId, 400);
    }

    await deleteRecordLink(userId, id);
    return apiSuccess({ id }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
