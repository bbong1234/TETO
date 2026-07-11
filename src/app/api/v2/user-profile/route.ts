import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getUserProfile, deriveAndUpsertUserProfile } from '@/lib/db/user-profile';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

/** 迁移 034 未执行时（user_profiles 表缺失）优雅降级返回 null */
function isMissingProfileTable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('user_profiles') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

    try {
      if (refresh) {
        const profile = await deriveAndUpsertUserProfile(userId);
        return apiSuccess(profile, ctx.traceId);
      }

      let profile = await getUserProfile(userId);
      if (!profile) {
        profile = await deriveAndUpsertUserProfile(userId);
      }
      return apiSuccess(profile, ctx.traceId);
    } catch (inner) {
      if (isMissingProfileTable(inner)) {
        return apiSuccess(null, ctx.traceId);
      }
      throw inner;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const profile = await deriveAndUpsertUserProfile(userId);
    return apiSuccess(profile, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
