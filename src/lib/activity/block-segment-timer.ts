import { isSessionPaused } from '@/lib/activity/session-utils';
import type { BlockTimelineSegment } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import type { Record as TetoRecord } from '@/types/teto';

/** 块时间顶部计时：以当前活动段起点为准，切换段落后重新计时 */
export function buildSegmentTimerRecord(
  segments: BlockTimelineSegment[],
  activity: TetoRecord
): TetoRecord {
  const activitySegs = segments.filter((s) => !s.isGap);
  const last = activitySegs[activitySegs.length - 1];
  if (!last) return activity;

  const startIso = new Date(last.startMs).toISOString();
  const paused = isSessionPaused(activity.session_state);

  if (paused && last.endMs != null) {
    return {
      ...activity,
      occurred_at: startIso,
      occurred_at_end: new Date(last.endMs).toISOString(),
      paused_at: null,
      paused_total_seconds: 0,
      session_state: 'running',
    };
  }

  return {
    ...activity,
    occurred_at: startIso,
    occurred_at_end: null,
    paused_at: paused ? activity.paused_at : null,
    paused_total_seconds: 0,
    session_state: activity.session_state,
  };
}
