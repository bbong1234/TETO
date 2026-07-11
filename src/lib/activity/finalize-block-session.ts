import type { BlockTimelineSegment } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import { resolveSegmentAttributionForPersist } from '@/lib/activity/block-attribution-display';
import { parseSegmentLabel } from '@/lib/activity/block-timeline-projection';
import { postManualRecord } from '@/lib/activity/post-manual-record';
import { calcNetDurationMinutes } from '@/lib/activity/session-utils';
import {
  isOptimisticRecordId,
  buildStoppedSnapshot,
} from '@/lib/activity/records-mutation';
import type { Record as TetoRecord } from '@/types/teto';

/** 块时间落库/乐观快照的 content：动作词优先，否则用标签路径，避免 POST 必填校验失败 */
export function resolveBlockSegmentContent(seg: BlockTimelineSegment): string {
  const explicit = seg.action_text?.trim();
  if (explicit) return explicit;
  const { actionLabel } = parseSegmentLabel(seg.label);
  if (actionLabel?.trim()) return actionLabel.trim();
  return '进行中';
}

export function activitySegmentsFromBlock(
  segments: BlockTimelineSegment[]
): BlockTimelineSegment[] {
  return segments.filter((s) => !s.isGap);
}

export function shouldSplitBlockSessionOnStop(segments: BlockTimelineSegment[]): boolean {
  return activitySegmentsFromBlock(segments).length > 1;
}

function segmentEndIso(seg: BlockTimelineSegment, stopIso: string): string {
  return seg.endMs != null ? new Date(seg.endMs).toISOString() : stopIso;
}

/** 停止前：按块内各段生成乐观 completed 快照（今日时间线即时展示多条） */
export function buildOptimisticStoppedFromBlockSegments(
  activity: TetoRecord,
  segments: BlockTimelineSegment[],
  stopIso: string,
  lockedCategoryItemId: string | null | undefined = null
): TetoRecord[] {
  const activitySegs = activitySegmentsFromBlock(segments);
  if (activitySegs.length <= 1) {
    const stopped = buildStoppedSnapshot(activity, stopIso);
    const seg = activitySegs[0];
    if (seg && isOptimisticRecordId(activity.id)) {
      const endIso = segmentEndIso(seg, stopIso);
      const startIso = new Date(seg.startMs).toISOString();
      const { item_id, sub_item_id } = resolveSegmentAttributionForPersist(
        activity,
        seg,
        lockedCategoryItemId
      );
      return [
        {
          ...stopped,
          id: `optimistic-block-seg-${seg.startMs}-0`,
          item_id,
          sub_item_id,
          occurred_at: startIso,
          occurred_at_end: endIso,
        },
      ];
    }
    return [stopped];
  }

  return activitySegs.map((seg, index) => {
    const endIso = segmentEndIso(seg, stopIso);
    const startIso = new Date(seg.startMs).toISOString();
    const { actionLabel } = parseSegmentLabel(seg.label);
    const durationRecord = {
      occurred_at: startIso,
      occurred_at_end: endIso,
      paused_at: null,
      paused_total_seconds: activity.paused_total_seconds ?? 0,
      session_state: activity.session_state ?? 'running',
    } as const;

    const { item_id, sub_item_id } = resolveSegmentAttributionForPersist(
      activity,
      seg,
      lockedCategoryItemId
    );

    return {
      ...activity,
      id:
        index === 0 && !isOptimisticRecordId(activity.id)
          ? activity.id
          : `optimistic-block-seg-${seg.startMs}-${index}`,
      item_id,
      sub_item_id,
      action_text: seg.action_text ?? actionLabel ?? null,
      content: resolveBlockSegmentContent(seg),
      occurred_at: startIso,
      occurred_at_end: endIso,
      lifecycle_status: 'completed' as const,
      duration_minutes: calcNetDurationMinutes(durationRecord, endIso),
      session_state: 'running' as const,
      paused_at: null,
    };
  });
}

function buildSegmentPersistBody(
  activity: TetoRecord,
  seg: BlockTimelineSegment,
  endIso: string,
  capturePatch: Record<string, unknown>,
  applyCapture: boolean,
  lockedCategoryItemId: string | null | undefined
): Record<string, unknown> {
  const startIso = new Date(seg.startMs).toISOString();
  const { actionLabel } = parseSegmentLabel(seg.label);
  const durationRecord = {
    occurred_at: startIso,
    occurred_at_end: endIso,
    paused_at: null,
    paused_total_seconds: 0,
    session_state: 'running' as const,
  };

  const { item_id, sub_item_id } = resolveSegmentAttributionForPersist(
    activity,
    seg,
    lockedCategoryItemId
  );

  const body: Record<string, unknown> = {
    type: '发生',
    occurred_at: startIso,
    occurred_at_end: endIso,
    lifecycle_status: 'completed',
    session_state: 'running',
    paused_at: null,
    duration_minutes: calcNetDurationMinutes(durationRecord, endIso),
    item_id,
    sub_item_id,
    action_text: seg.action_text ?? actionLabel ?? null,
    content: resolveBlockSegmentContent(seg),
    review_status: 'confirmed',
    ...(seg.tag_ids?.length ? { tag_ids: seg.tag_ids } : {}),
    ...(applyCapture ? capturePatch : {}),
  };

  return body;
}

/** 停止块时间：将块内各段落库为多条 completed 发生记录 */
export async function persistBlockSessionSegments(
  activity: TetoRecord,
  segments: BlockTimelineSegment[],
  stopIso: string,
  resolveRecordId: (activity: TetoRecord) => Promise<string | null>,
  capturePatch: Record<string, unknown> = {},
  lockedCategoryItemId: string | null | undefined = null
): Promise<TetoRecord[]> {
  const activitySegs = activitySegmentsFromBlock(segments);
  if (activitySegs.length <= 1) {
    throw new Error('persistBlockSessionSegments requires multiple activity segments');
  }

  const recordId = await resolveRecordId(activity);
  if (!recordId) {
    throw new Error('无法解析活动记录');
  }

  const date = stopIso.slice(0, 10);
  const results: TetoRecord[] = [];

  for (let i = 0; i < activitySegs.length; i++) {
    const seg = activitySegs[i];
    const isLast = i === activitySegs.length - 1;
    const endIso = segmentEndIso(seg, stopIso);
    const body = buildSegmentPersistBody(
      activity,
      seg,
      endIso,
      capturePatch,
      isLast,
      lockedCategoryItemId
    );

    if (i === 0) {
      const res = await fetch(`/api/v2/records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? '保存块时间第一段失败');
      }
      results.push(data.data as TetoRecord);
      continue;
    }

    const created = await postManualRecord({
      date,
      content: String(body.content ?? ''),
      type: '发生',
      lifecycle_status: 'completed',
      occurred_at: body.occurred_at as string,
      occurred_at_end: body.occurred_at_end as string,
      duration_minutes: body.duration_minutes as number,
      item_id: (body.item_id as string | null) ?? undefined,
      sub_item_id: (body.sub_item_id as string | null) ?? undefined,
      action_text: (body.action_text as string | null) ?? undefined,
      tag_ids: body.tag_ids as string[] | undefined,
      review_status: 'confirmed',
      input_source: 'manual',
    });
    results.push(created);
  }

  return results;
}
