import { describe, expect, it } from 'vitest';
import {
  mutateAppendBlockSegment,
  mutateUpdateLastBlockSegment,
  type BlockTimelineSegment,
} from '../use-block-session-segments';

const baseSegment: BlockTimelineSegment = {
  label: '编程-项目A',
  startMs: 1000,
  endMs: null,
  item_id: 'item-a',
};

describe('mutateUpdateLastBlockSegment', () => {
  it('keeps startMs when updating label within grace window', () => {
    const next = mutateUpdateLastBlockSegment([baseSegment], '编程-项目B', {
      item_id: 'item-b',
      sub_item_id: null,
      action_text: null,
      tag_ids: [],
    });
    expect(next).toHaveLength(1);
    expect(next[0].startMs).toBe(1000);
    expect(next[0].label).toBe('编程-项目B');
    expect(next[0].item_id).toBe('item-b');
  });

  it('returns same array when label and meta unchanged', () => {
    const prev = [baseSegment];
    const next = mutateUpdateLastBlockSegment(prev, baseSegment.label);
    expect(next).toBe(prev);
  });
});

describe('mutateAppendBlockSegment', () => {
  it('closes previous segment and opens a new one with new startMs', () => {
    const startMs = 5000;
    const next = mutateAppendBlockSegment([baseSegment], '编程-项目B', startMs, {
      item_id: 'item-b',
      sub_item_id: null,
      action_text: null,
      tag_ids: [],
    });
    expect(next).toHaveLength(2);
    expect(next[0].endMs).toBe(startMs);
    expect(next[1].startMs).toBe(startMs);
    expect(next[1].label).toBe('编程-项目B');
  });
});
