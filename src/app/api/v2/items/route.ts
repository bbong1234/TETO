import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { listItems } from '@/lib/db/items';
import { createItemSafely } from '@/lib/domain/item-service';
import { createClient } from '@/lib/supabase/server';
import type { ItemsQuery, CreateItemPayload } from '@/types/teto';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { startSpan, endSpan } from '@/lib/observability/trace';
import { PipelineStage } from '@/lib/ai/agent-pipeline';

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: ItemsQuery = {};
    const status = searchParams.get('status');
    const is_pinned = searchParams.get('is_pinned');
    const folder_id = searchParams.get('folder_id');
    if (status) query.status = status as ItemsQuery['status'];
    if (is_pinned !== null) query.is_pinned = is_pinned === 'true';
    if (folder_id !== null) query.folder_id = folder_id || null;

    const result = await listItems(userId, query);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  const spanCtx = startSpan(ctx.traceId, PipelineStage.EXECUTE, '创建事项');
  try {
    const userId = await getCurrentUserId();
    const body: CreateItemPayload = await request.json();

    if (!body.title) {
      endSpan(spanCtx, 'failed', 'title 为必填字段', ERROR_CODES.ITEM_TITLE_REQUIRED);
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, 'title 为必填字段', ctx.traceId, 400);
    }

    // 统一 trim 标题，确保存储与去重检查一致
    body.title = body.title.trim();
    if (!body.title) {
      endSpan(spanCtx, 'failed', 'title 不能为空白', ERROR_CODES.ITEM_TITLE_REQUIRED);
      return apiError(ERROR_CODES.ITEM_MATCH_FAILED, 'title 不能为空白', ctx.traceId, 400);
    }

    // 检查是否有同名的事项（活跃/推进中/放缓/停滞状态，避免重复创建）
    const supabase = await createClient();
    const { data: existingActiveItems } = await supabase
      .from('items')
      .select('id, title, status')
      .eq('user_id', userId)
      .eq('title', body.title.trim())
      .in('status', ['活跃', '推进中', '放缓', '停滞']);

    if (existingActiveItems && existingActiveItems.length > 0) {
      const existing = existingActiveItems[0];
      endSpan(spanCtx, 'partial', `同名冲突: ${existing.title}(${existing.status})`, ERROR_CODES.ITEM_DUPLICATE_NAME);
      return NextResponse.json({
        data: null,
        conflict: {
          type: 'duplicate_name',
          existing_item_id: existing.id,
          existing_item_title: existing.title,
          existing_item_status: existing.status,
          message: `已存在同名事项「${existing.title}」（${existing.status}）`,
        },
      }, { status: 409 });
    }

    // 检查是否有同名的已完成/已搁置事项（提示可重启）
    const { data: existingArchivedItems } = await supabase
      .from('items')
      .select('id, title, status')
      .eq('user_id', userId)
      .eq('title', body.title.trim())
      .in('status', ['已完成', '已搁置']);

    if (existingArchivedItems && existingArchivedItems.length > 0) {
      const existing = existingArchivedItems[0];
      endSpan(spanCtx, 'partial', `已归档同名: ${existing.title}(${existing.status})`, ERROR_CODES.ITEM_DUPLICATE_NAME);
      return NextResponse.json({
        data: null,
        conflict: {
          type: 'duplicate_name',
          existing_item_id: existing.id,
          existing_item_title: existing.title,
          existing_item_status: existing.status,
          message: `已存在同名事项「${existing.title}」（${existing.status}），是否在原事项下新建阶段重启？`,
        },
      }, { status: 409 });
    }

    const result = await createItemSafely({ userId, payload: body, supabase });
    if (!result.ok) {
      endSpan(spanCtx, 'failed', '域校验失败', result.errors[0]?.code, result.errors[0]?.message);
      return apiDomainError(result.errors, ctx.traceId);
    }
    endSpan(spanCtx, 'ok', `事项 ${result.data?.id} 创建成功`);
    return apiSuccess(result.data, ctx.traceId, 201, result.warnings);
  } catch (error) {
    endSpan(spanCtx, 'failed', '创建事项异常', undefined, error instanceof Error ? error.message : String(error));
    return handleApiError(error);
  }
}
