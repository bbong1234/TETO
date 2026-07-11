import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

export interface FunctionTagStat {
  tag_id: string;
  tag_name: string;
  tag_color: string | null;
  total_minutes: number;
  record_count: number;
}

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    if (!dateFrom || !dateTo) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'date_from 和 date_to 为必填', ctx.traceId, 400);
    }

    const supabase = await createClient();

    // 查询指定日期范围内带职能标签的记录
    const { data: records, error: recordsError } = await supabase
      .from('records')
      .select('id, duration_minutes')
      .eq('user_id', userId)
      .gte('date', dateFrom)
      .lte('date', dateTo);

    if (recordsError) throw new Error(`查询记录失败: ${recordsError.message}`);

    const recordList = (records ?? []) as { id: string; duration_minutes: number | null }[];
    const recordIds = recordList.map((r) => r.id);
    const durationById = new Map(recordList.map((r) => [r.id, r.duration_minutes ?? 0]));

    if (recordIds.length === 0) {
      return apiSuccess([], ctx.traceId);
    }

    // 查询这些记录的职能标签
    const { data: links, error: linksError } = await supabase
      .from('record_tags')
      .select('record_id, tag_id, tags(id, name, color, type)')
      .eq('user_id', userId)
      .in('record_id', recordIds);

    if (linksError) throw new Error(`查询标签失败: ${linksError.message}`);

    const statsMap = new Map<string, { name: string; color: string | null; totalMinutes: number; count: number }>();
    for (const row of links ?? []) {
      const rawRow = row as unknown as { record_id: string; tag_id: string; tags: { id: string; name: string; color: string | null; type: string | null } | { id: string; name: string; color: string | null; type: string | null }[] | null };
      const tagObj = Array.isArray(rawRow.tags) ? rawRow.tags[0] : rawRow.tags;
      const r = { record_id: rawRow.record_id, tag_id: rawRow.tag_id, tags: tagObj ?? null };
      if (!r.tags || r.tags.type !== 'function') continue;
      const mins = durationById.get(r.record_id) ?? 0;
      const prev = statsMap.get(r.tag_id);
      if (prev) {
        prev.totalMinutes += mins;
        prev.count += 1;
      } else {
        statsMap.set(r.tag_id, { name: r.tags.name, color: r.tags.color, totalMinutes: mins, count: 1 });
      }
    }

    const result: FunctionTagStat[] = [...statsMap.entries()]
      .map(([tag_id, v]) => ({
        tag_id,
        tag_name: v.name,
        tag_color: v.color,
        total_minutes: v.totalMinutes,
        record_count: v.count,
      }))
      .filter((x) => x.record_count > 0)
      .sort((a, b) => b.total_minutes - a.total_minutes);

    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
