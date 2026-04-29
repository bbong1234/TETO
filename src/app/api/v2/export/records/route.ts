import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';

/**
 * GET /api/v2/export/records?date_from=...&date_to=...&format=csv
 * 导出记录为CSV
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const format = searchParams.get('format') || 'csv';

    const supabase = await createClient();

    // 获取范围内的 record_days
    let dayQuery = supabase
      .from('record_days')
      .select('id, date')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (dateFrom) dayQuery = dayQuery.gte('date', dateFrom);
    if (dateTo) dayQuery = dayQuery.lte('date', dateTo);

    const { data: days, error: daysError } = await dayQuery;
    if (daysError) throw new Error(`查询日期失败: ${daysError.message}`);
    if (!days || days.length === 0) {
      return NextResponse.json({ error: '所选范围内无数据' }, { status: 404 });
    }

    const dayIds = days.map(d => d.id);
    const dayMap = new Map(days.map(d => [d.id, d.date]));

    // 获取记录
    const { data: records, error: recError } = await supabase
      .from('records')
      .select('id, raw_input, type, status, item_id, sub_item_id, duration_minutes, cost, metric_name, metric_value, result, location, people, time_anchor_date, record_day_id, created_at')
      .eq('user_id', userId)
      .in('record_day_id', dayIds)
      .order('created_at', { ascending: true });

    if (recError) throw new Error(`查询记录失败: ${recError.message}`);

    // 获取事项名称映射
    const itemIds = [...new Set((records || []).map(r => r.item_id).filter(Boolean))] as string[];
    let itemNameMap: Record<string, string> = {};
    if (itemIds.length > 0) {
      const { data: items } = await supabase
        .from('items')
        .select('id, title')
        .in('id', itemIds);
      (items || []).forEach(i => { itemNameMap[i.id] = i.title; });
    }

    if (format === 'csv') {
      // 生成CSV
      const headers = ['日期', '原始输入', '类型', '状态', '事项', '时长(分钟)', '花费', '指标名', '指标值', '结果', '地点', '人物', '时间锚点', '创建时间'];
      const escapeCsv = (val: string | number | null | undefined) => {
        const s = val == null ? '' : String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const rows = (records || []).map(r => [
        escapeCsv(dayMap.get(r.record_day_id) || ''),
        escapeCsv(r.raw_input),
        escapeCsv(r.type),
        escapeCsv(r.status),
        escapeCsv(r.item_id ? itemNameMap[r.item_id] || '' : ''),
        escapeCsv(r.duration_minutes),
        escapeCsv(r.cost),
        escapeCsv(r.metric_name),
        escapeCsv(r.metric_value),
        escapeCsv(r.result),
        escapeCsv(r.location),
        escapeCsv(r.people),
        escapeCsv(r.time_anchor_date),
        escapeCsv(r.created_at),
      ].join(','));

      const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n'); // BOM for Excel

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="teto-records-${dateFrom || 'all'}-${dateTo || 'all'}.csv"`,
        },
      });
    }

    // JSON fallback
    return NextResponse.json({ data: records });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
