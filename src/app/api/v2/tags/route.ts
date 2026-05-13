import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { listTags } from '@/lib/db/tags';
import { createTagSafely } from '@/lib/domain/tag-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiDomainError } from '@/lib/api/handler-wrapper';
import type { CreateTagPayload } from '@/types/teto';

export async function GET(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const result = await listTags(userId);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body: CreateTagPayload = await request.json();

    const supabase = await createClient();
    const result = await createTagSafely({ userId, payload: body, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 201, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}
