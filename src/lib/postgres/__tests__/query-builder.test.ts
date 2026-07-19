import { describe, expect, it, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@/lib/postgres/pool', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

describe('TableQuery delete', () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [{ id: 'rec-1' }] });
  });

  it('executes DELETE when awaited (thenable)', async () => {
    const { TableQuery } = await import('../query-builder');
    const q = new TableQuery('records').delete().eq('id', 'rec-1').eq('user_id', 'user-1');

    await q;

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/^DELETE FROM "records"/);
    expect(sql).not.toMatch(/^SELECT/);
    expect(params).toEqual(['rec-1', 'user-1']);
  });

  it('returns deleted row via maybeSingle', async () => {
    const { TableQuery } = await import('../query-builder');
    const { data, error } = await new TableQuery('records')
      .delete()
      .eq('id', 'rec-1')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toEqual({ id: 'rec-1' });
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toContain('RETURNING *');
  });

  it('executes UPDATE when awaited (thenable)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'rec-1', content: 'updated' }] });
    const { TableQuery } = await import('../query-builder');
    await new TableQuery('records')
      .update({ content: 'updated' })
      .eq('id', 'rec-1')
      .eq('user_id', 'user-1');

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toMatch(/^UPDATE "records"/);
    expect(sql).not.toMatch(/^SELECT/);
  });

  it('executes DELETE with IN filter when awaited', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'rec-1' }, { id: 'rec-2' }] });
    const { TableQuery } = await import('../query-builder');
    await new TableQuery('records')
      .delete()
      .in('id', ['rec-1', 'rec-2'])
      .eq('user_id', 'user-1')
      .select('id');

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/^DELETE FROM "records"/);
    expect(sql).toContain('IN');
    expect(sql).toContain('RETURNING');
    expect(params).toEqual(['rec-1', 'rec-2', 'user-1']);
  });
});
