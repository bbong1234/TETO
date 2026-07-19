import { describe, expect, it, vi } from 'vitest';
import { deleteOneOwnedRow } from '../write-helpers';

function mockSupabaseDelete(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return {
    from: vi.fn(() => ({
      delete: vi.fn(() => chain),
    })),
  };
}

describe('deleteOneOwnedRow', () => {
  it('throws when no row deleted', async () => {
    const supabase = mockSupabaseDelete({ data: null, error: null });
    await expect(
      deleteOneOwnedRow(
        supabase as never,
        'records',
        [
          { column: 'id', value: 'missing' },
          { column: 'user_id', value: 'user-1' },
        ],
        '删除记录失败'
      )
    ).rejects.toThrow('未找到匹配记录');
  });

  it('passes when one row deleted', async () => {
    const supabase = mockSupabaseDelete({ data: { id: 'rec-1' }, error: null });
    await expect(
      deleteOneOwnedRow(
        supabase as never,
        'records',
        [
          { column: 'id', value: 'rec-1' },
          { column: 'user_id', value: 'user-1' },
        ],
        '删除记录失败'
      )
    ).resolves.toBeUndefined();
  });
});
