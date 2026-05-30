import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createUserTool, listUserTools } from '@/lib/db/user-tools';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import type { CreateUserToolPayload } from '@/types/teto';

/** GET /api/v2/tools — 用户自定义工具/载体选项 */
export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const tools = await listUserTools(userId);
    return apiSuccess(tools, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/v2/tools — 新建工具选项 */
export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body: CreateUserToolPayload = await request.json();
    if (!body.title?.trim()) {
      return apiError('VALIDATION_ERROR', '工具名称不能为空', ctx.traceId, 400);
    }
    const tool = await createUserTool(userId, body);
    return apiSuccess(tool, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
