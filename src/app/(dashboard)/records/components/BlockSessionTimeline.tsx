'use client';

import { memo, useMemo } from 'react';
import DayTimelinePanel from '@/components/timeline/DayTimelinePanel';
import { blockSegmentsToDayTimeline } from '@/lib/activity/block-timeline-projection';

export interface BlockTimelineSegment {
  label: string;
  startMs: number;
  endMs: number | null;
  /** 空白时间 / 暂停间隙：时长冻结，不随当前时间增长 */
  isGap?: boolean;
  item_id?: string | null;
  sub_item_id?: string | null;
  action_text?: string | null;
  tag_ids?: string[];
}

export type BlockTimelineSegmentMeta = Pick<
  BlockTimelineSegment,
  'item_id' | 'sub_item_id' | 'action_text' | 'tag_ids'
>;

interface BlockSessionTimelineProps {
  segments: BlockTimelineSegment[];
}

/** 块时间内段落列表：样式与今日时间线一致（事项/动作底色、秒级时长） */
const BlockSessionTimeline = memo(function BlockSessionTimeline({
  segments,
}: BlockSessionTimelineProps) {
  const feed = useMemo(() => blockSegmentsToDayTimeline(segments), [segments]);

  if (segments.length === 0) return null;

  return (
    <DayTimelinePanel
      data={feed}
      title="块时间线"
      emptyText="本次块时间暂无段落"
    />
  );
});

export default BlockSessionTimeline;
