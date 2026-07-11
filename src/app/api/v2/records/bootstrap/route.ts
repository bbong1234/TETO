import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { listItemsLite } from '@/lib/db/items';
import { listRecords } from '@/lib/db/records';
import { getCurrentActivity } from '@/lib/db/activities';
import { listUserTools } from '@/lib/db/user-tools';
import { listTags } from '@/lib/db/tags';
import { getUserRules } from '@/lib/db/user-rules';
import type { RecordsQuery } from '@/types/teto';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v2/records/bootstrap
 * 记录页首屏：一次请求返回 items + records + 当前活动 + 工具，避免并发打爆 Supabase。
 */
export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: RecordsQuery = {};
    const date = searchParams.get('date');
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');
    const item_id = searchParams.get('item_id');
    const type = searchParams.get('type');
    const tag_id = searchParams.get('tag_id');
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');

    if (date && !DATE_REGEX.test(date)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'date 格式无效', ctx.traceId, 400);
    }
    if (date) query.date = date;
    if (date_from && DATE_REGEX.test(date_from)) query.date_from = date_from;
    if (date_to && DATE_REGEX.test(date_to)) query.date_to = date_to;
    if (item_id) query.item_id = item_id;
    if (type) query.type = type as RecordsQuery['type'];
    if (tag_id) query.tag_id = tag_id;
    if (search?.trim()) query.search = search.trim();
    if (limit) {
      const n = parseInt(limit, 10);
      if (!Number.isNaN(n) && n > 0) query.limit = n;
    }

    const [items, records, current_activity, tools, tags, user_rules] = await Promise.all([
      listItemsLite(userId, {}),
      listRecords(userId, query),
      getCurrentActivity(userId),
      listUserTools(userId),
      listTags(userId),
      getUserRules(userId, { is_active: true }),
    ]);

    return apiSuccess(
      {
        items,
        records,
        current_activity,
        tools,
        tags,
        user_rules,
      },
      ctx.traceId
    );
  } catch (error) {
    return handleApiError(error);
  }
}
