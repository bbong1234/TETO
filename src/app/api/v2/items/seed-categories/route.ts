import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { seedCategoryItems } from '@/lib/db/seed-categories';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

/** POST /api/v2/items/seed-categories — 一次性补齐预设大类 */
export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const result = await seedCategoryItems(userId);
    return apiSuccess(
      {
        created_count: result.created.length,
        created: result.created,
        items: result.items,
        english_sub_items_created: result.english_sub_items_created,
        default_items_created: result.default_items_created,
        english_migration: result.english_migration,
      },
      ctx.traceId
    );
  } catch (error) {
    return handleApiError(error);
  }
}
