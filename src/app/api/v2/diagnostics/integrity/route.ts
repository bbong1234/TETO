import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { runDataIntegrityCheck } from '@/lib/diagnostics/data-integrity-check';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const supabase = await createClient();

    const report = await runDataIntegrityCheck(userId, supabase);

    return apiSuccess(report, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
