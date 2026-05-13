import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getPhases } from '@/lib/db/phases';
import { createPhaseSafely } from '@/lib/domain/phase-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiDomainError } from '@/lib/api/handler-wrapper';
import type { PhasesQuery, CreatePhasePayload } from '@/types/teto';

export async function GET(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: PhasesQuery = {};
    const item_id = searchParams.get('item_id');
    const status = searchParams.get('status');
    const is_historical = searchParams.get('is_historical');

    if (item_id) query.item_id = item_id;
    if (status) query.status = status as PhasesQuery['status'];
    if (is_historical !== null) query.is_historical = is_historical === 'true';

    const result = await getPhases(userId, query);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body: CreatePhasePayload = await request.json();

    const supabase = await createClient();
    const result = await createPhaseSafely({ userId, payload: body, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 201, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}
