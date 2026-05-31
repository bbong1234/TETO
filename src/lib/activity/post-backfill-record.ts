interface BackfillSubmitPayload {
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  phase_id?: string | null;
  tool_label?: string | null;
  occurred_at?: string;
  occurred_at_end?: string;
}

function backfillDurationMinutes(startIso: string, endIso: string): number | undefined {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (ms <= 0) return undefined;
  return Math.max(1, Math.round(ms / 60000));
}

/**
 * 补记写入：走 enhance=client 直连入库，保留 occurred_at / item_id 等字段，不经 AI 清分
 */
export async function postBackfillRecord(
  payload: BackfillSubmitPayload,
  recordDate: string
): Promise<{ id: string }> {
  if (!payload.occurred_at || !payload.occurred_at_end) {
    throw new Error('补记缺少开始或结束时间');
  }

  const res = await fetch('/api/v2/records?enhance=client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: recordDate,
      content: payload.content?.trim() || '补记',
      type: '发生',
      lifecycle_status: 'completed',
      occurred_at: payload.occurred_at,
      occurred_at_end: payload.occurred_at_end,
      duration_minutes: backfillDurationMinutes(payload.occurred_at, payload.occurred_at_end),
      item_id: payload.item_id ?? null,
      sub_item_id: payload.sub_item_id ?? null,
      phase_id: payload.phase_id ?? null,
      tool_label: payload.tool_label?.trim() || null,
      input_source: 'manual',
      review_status: 'confirmed',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? '补记失败');
  }
  if (!data.data?.id) {
    throw new Error('补记失败：未创建记录');
  }
  return { id: data.data.id as string };
}
