import type { CreateRecordPayload } from '@/types/teto';

/**
 * 手动录入（想法/计划等）：走 enhance=client 直连入库，不经 AI 清分。
 * 若走默认 POST，API 可能返回 200 + _clarification 而不写库，前端会误判为成功。
 */
export async function postManualRecord(payload: CreateRecordPayload): Promise<{ id: string }> {
  const res = await fetch('/api/v2/records?enhance=client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? '记录失败');
  }
  if (data.data?._clarification) {
    throw new Error('需要 AI 确认的事项请使用「补记/自然语言录入」');
  }
  if (!data.data?.id) {
    throw new Error('记录失败：未创建记录');
  }
  return { id: data.data.id as string };
}
