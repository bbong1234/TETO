import type { Record as TetoRecord } from '@/types/teto';
import type { ActivitySwitchPayload } from '@/lib/activity/records-mutation';
import { isStaleRecordReferenceError, isRecordNotFoundApiError } from '@/lib/api/client-errors';
import {
  markActivitySwitchPending,
  settleActivitySwitch,
  resolveActivityRecordIdClient,
} from '@/lib/activity/activity-switch-pending';
import { ensureBlockAttributionPutBody } from '@/lib/activity/block-tag-switch-rules';

export async function postActivitySwitch(
  payload: Record<string, unknown>
): Promise<ActivitySwitchPayload> {
  const res = await fetch('/api/v2/activities/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? '操作失败');
  }
  return data.data as ActivitySwitchPayload;
}

export async function postActivityStop(): Promise<ActivitySwitchPayload> {
  return postActivitySwitch({});
}

export async function patchRecordAttribution(
  recordId: string,
  body: Record<string, unknown>
): Promise<TetoRecord | null> {
  const res = await fetch(`/api/v2/records/${recordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (isRecordNotFoundApiError(data, res.status)) return null;
    const msg = (data as { error?: { message?: string } }).error?.message ?? '';
    if (isStaleRecordReferenceError(msg)) return null;
    throw new Error(msg || '更新失败');
  }
  return (data.data as TetoRecord) ?? null;
}

export async function deleteRecordById(recordId: string): Promise<boolean> {
  const res = await fetch(`/api/v2/records/${recordId}`, { method: 'DELETE' });
  if (res.ok) return true;
  const data = await res.json().catch(() => ({}));
  if (isRecordNotFoundApiError(data, res.status)) return true;
  return false;
}

export function buildAttributionPutBody(
  resolved: Pick<TetoRecord, 'item_id' | 'sub_item_id'>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return ensureBlockAttributionPutBody({ ...patch }, resolved);
}

export async function resolveRecordId(activity: TetoRecord): Promise<string | null> {
  return resolveActivityRecordIdClient(activity);
}

export { markActivitySwitchPending, settleActivitySwitch };
