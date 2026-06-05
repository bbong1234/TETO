import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
  })),
}));

import { getPhaseSubItemBreakdownsByItem } from '@/lib/db/records';

describe('getPhaseSubItemBreakdownsByItem', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('groups by phase_id and sub_item_id only', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'records') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                not: async () => ({
                  data: [
                    {
                      phase_id: 'ph1',
                      sub_item_id: 'sub-a',
                      duration_minutes: 60,
                    },
                    {
                      phase_id: 'ph1',
                      sub_item_id: 'sub-a',
                      duration_minutes: 30,
                    },
                    {
                      phase_id: 'ph1',
                      sub_item_id: null,
                      duration_minutes: 10,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'sub_items') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [{ id: 'sub-a', title: '风控' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const map = await getPhaseSubItemBreakdownsByItem('u1', 'item1');
    const rows = map.get('ph1');
    expect(rows).toBeDefined();
    const risk = rows!.find((r) => r.sub_item_id === 'sub-a');
    expect(risk?.sub_item_title).toBe('风控');
    expect(risk?.record_count).toBe(2);
    expect(risk?.total_duration_minutes).toBe(90);
    const none = rows!.find((r) => r.sub_item_id === null);
    expect(none?.record_count).toBe(1);
  });
});
