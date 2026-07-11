import { describe, expect, it } from 'vitest';
import { filterQuickNoteAiUpdate } from '../ai-enhance-trigger';

describe('filterQuickNoteAiUpdate', () => {
  it('keeps extracted attributes but removes attribution, type and time fields', () => {
    const filtered = filterQuickNoteAiUpdate({
      mood: '平静',
      body_state: '累',
      location: '家',
      object_text: '早饭',
      metric_value: 2,
      parsed_semantic: { action_text: '吃早饭' },
      item_id: 'ai-item',
      sub_item_id: 'ai-sub',
      tag_ids: ['ai-tag'],
      review_status: 'unchecked',
      type: '想法',
      occurred_at: '2026-07-05T10:00:00+08:00',
      time_anchor_date: '2026-07-06',
      time_text: '明天',
      content: 'AI 摘要',
      raw_input: 'AI 原文',
    });

    expect(filtered).toMatchObject({
      mood: '平静',
      body_state: '累',
      location: '家',
      object_text: '早饭',
      metric_value: 2,
    });
    for (const forbidden of [
      'item_id',
      'sub_item_id',
      'tag_ids',
      'review_status',
      'type',
      'occurred_at',
      'time_anchor_date',
      'time_text',
      'content',
      'raw_input',
    ]) {
      expect(filtered).not.toHaveProperty(forbidden);
    }
  });
});
