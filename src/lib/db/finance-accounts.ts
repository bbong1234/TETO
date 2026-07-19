import { createClient } from '@/lib/supabase/server';
import { PAYMENT_SOURCES } from '@/lib/activity/recent-context';
import {
  aggregateFinanceRecords,
  filterFinanceRecordsByDateRange,
  isFinanceRecord,
  type FinanceRecordRow,
} from '@/lib/stats/finance-summary';
import type {
  CreateFinanceAccountPayload,
  FinanceAccount,
  FinanceAccountType,
  UpdateFinanceAccountPayload,
} from '@/types/teto';
import { FINANCE_ACCOUNT_TYPE_ICONS } from '@/types/teto';

const DEFAULT_ACCOUNTS: { name: string; account_type: FinanceAccountType }[] = [
  { name: '微信', account_type: 'wechat' },
  { name: '支付宝', account_type: 'alipay' },
  { name: '银行卡', account_type: 'bank_card' },
  { name: '现金', account_type: 'cash' },
];

const PAYMENT_TO_TYPE: Record<string, FinanceAccountType> = {
  微信: 'wechat',
  支付宝: 'alipay',
  银行卡: 'bank_card',
  现金: 'cash',
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function listFinanceAccounts(
  userId: string,
  options?: { includeArchived?: boolean; skipMigration?: boolean }
): Promise<FinanceAccount[]> {
  await ensureDefaultFinanceAccounts(userId);
  if (!options?.skipMigration) {
    await migrateToolLabelFinanceAccounts(userId);
  }

  const supabase = await createClient();
  let query = supabase
    .from('finance_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!options?.includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`获取财务账户失败: ${error.message}`);
  }
  return (data ?? []) as FinanceAccount[];
}

export async function createFinanceAccount(
  userId: string,
  payload: CreateFinanceAccountPayload
): Promise<FinanceAccount> {
  const supabase = await createClient();
  const name = payload.name.trim();
  if (!name) throw new Error('账户名称不能为空');

  const { data, error } = await supabase
    .from('finance_accounts')
    .insert({
      user_id: userId,
      name,
      account_type: payload.account_type,
      icon: payload.icon ?? FINANCE_ACCOUNT_TYPE_ICONS[payload.account_type] ?? null,
      opening_balance: payload.opening_balance ?? 0,
      currency: payload.currency ?? 'CNY',
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('账户名称已存在');
    throw new Error(`创建财务账户失败: ${error.message}`);
  }
  return data as FinanceAccount;
}

export async function updateFinanceAccount(
  userId: string,
  id: string,
  payload: UpdateFinanceAccountPayload
): Promise<FinanceAccount> {
  const supabase = await createClient();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updateData.name = payload.name.trim();
  if (payload.account_type !== undefined) updateData.account_type = payload.account_type;
  if (payload.icon !== undefined) updateData.icon = payload.icon;
  if (payload.opening_balance !== undefined) updateData.opening_balance = payload.opening_balance;
  if (payload.currency !== undefined) updateData.currency = payload.currency;
  if (payload.is_archived !== undefined) updateData.is_archived = payload.is_archived;
  if (payload.sort_order !== undefined) updateData.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('finance_accounts')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('账户名称已存在');
    throw new Error(`更新财务账户失败: ${error.message}`);
  }
  return data as FinanceAccount;
}

export async function ensureDefaultFinanceAccounts(userId: string): Promise<void> {
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from('finance_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) throw new Error(`检查财务账户失败: ${countError.message}`);
  if ((count ?? 0) > 0) return;

  const rows = DEFAULT_ACCOUNTS.map((acc, index) => ({
    user_id: userId,
    name: acc.name,
    account_type: acc.account_type,
    icon: FINANCE_ACCOUNT_TYPE_ICONS[acc.account_type],
    sort_order: index,
  }));

  const { error } = await supabase.from('finance_accounts').insert(rows);
  if (error) throw new Error(`初始化默认账户失败: ${error.message}`);
}

export async function migrateToolLabelFinanceAccounts(userId: string): Promise<void> {
  const supabase = await createClient();
  const { data: accounts, error } = await supabase
    .from('finance_accounts')
    .select('id, name')
    .eq('user_id', userId);
  if (error || !accounts) return;

  const accountByName = new Map(accounts.map((a: { id: string; name: string }) => [a.name, a.id]));

  for (const label of PAYMENT_SOURCES) {
    const accountId = accountByName.get(label);
    if (!accountId) continue;

    await supabase
      .from('records')
      .update({ finance_account_id: accountId })
      .eq('user_id', userId)
      .is('finance_account_id', null)
      .eq('tool_label', label)
      .not('cost', 'is', null)
      .gt('cost', 0);
  }
}

export async function fetchFinanceRecordsForYear(
  userId: string,
  yearFrom: string,
  yearTo: string
): Promise<FinanceRecordRow[]> {
  const supabase = await createClient();

  const { data: days } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', yearFrom)
    .lte('date', yearTo);

  if (!days || days.length === 0) return [];

  const dayIds = days.map((d: { id: string }) => d.id);

  const { data: records, error } = await supabase
    .from('records')
    .select(
      'id, content, cost, money_direction, item_id, tool_label, finance_account_id, transfer_to_account_id, occurred_at, created_at, record_days(date), items(title), finance_account:finance_accounts!records_finance_account_id_fkey(id, name, account_type, icon), transfer_to:finance_accounts!records_transfer_to_account_id_fkey(id, name)'
    )
    .eq('user_id', userId)
    .in('record_day_id', dayIds)
    .not('cost', 'is', null)
    .gt('cost', 0);

  if (error) {
    throw new Error(`获取财务记录失败: ${error.message}`);
  }

  return (records ?? [])
    .map((r: any) => {
      const row = r as unknown as {
        id: string;
        cost: number;
        money_direction: string | null;
        content: string;
        item_id: string | null;
        tool_label: string | null;
        finance_account_id: string | null;
        transfer_to_account_id: string | null;
        occurred_at: string | null;
        created_at: string | null;
        record_days?: { date?: string } | null;
        items?: { title?: string } | null;
        finance_account?: { id: string; name: string; account_type: string; icon: string | null } | null;
        transfer_to?: { id: string; name: string } | null;
      };
      const date = row.record_days?.date;
      if (!date) return null;

      const financeRow: FinanceRecordRow = {
        id: row.id,
        date,
        cost: Number(row.cost) || 0,
        money_direction: row.money_direction as FinanceRecordRow['money_direction'],
        tool_label: row.tool_label,
        finance_account_id: row.finance_account_id,
        transfer_to_account_id: row.transfer_to_account_id,
        account_name: row.finance_account?.name ?? null,
        account_type: (row.finance_account?.account_type as FinanceAccountType | undefined) ?? null,
        account_icon: row.finance_account?.icon ?? null,
        transfer_to_name: row.transfer_to?.name ?? null,
        content: row.content,
        item_id: row.item_id,
        item_title: row.items?.title ?? null,
        occurred_at: row.occurred_at,
        created_at: row.created_at,
      };
      return isFinanceRecord(financeRow) ? financeRow : null;
    })
    .filter((row: any): row is FinanceRecordRow => row != null);
}

export function computeAccountBalanceFromRows(
  accountId: string,
  openingBalance: number,
  rows: FinanceRecordRow[]
): number {
  let balance = openingBalance;

  for (const row of rows) {
    const cost = Number(row.cost) || 0;
    if (row.money_direction === 'transfer') {
      if (row.finance_account_id === accountId) balance -= cost;
      if (row.transfer_to_account_id === accountId) balance += cost;
      continue;
    }
    if (row.finance_account_id !== accountId) continue;
    if (row.money_direction === 'income') balance += cost;
    else balance -= cost;
  }

  return roundMoney(balance);
}

export function attachBalancesToAccounts(
  accounts: FinanceAccount[],
  rows: FinanceRecordRow[]
): FinanceAccount[] {
  return accounts.map((account) => ({
    ...account,
    current_balance: computeAccountBalanceFromRows(account.id, account.opening_balance, rows),
  }));
}

export function computeTotalAssets(accounts: FinanceAccount[]): number {
  return roundMoney(
    accounts.filter((a) => !a.is_archived).reduce((sum, a) => sum + (a.current_balance ?? a.opening_balance), 0)
  );
}

export async function enrichAccountsWithPeriodStats(
  accounts: FinanceAccount[],
  rows: FinanceRecordRow[],
  dateFrom: string,
  dateTo: string
): Promise<FinanceAccount[]> {
  const periodRows = filterFinanceRecordsByDateRange(rows, dateFrom, dateTo);
  const aggregate = aggregateFinanceRecords(periodRows, accounts);
  const byId = new Map(
    aggregate.by_account
      .filter((a) => a.account_id)
      .map((a) => [a.account_id as string, a])
  );

  return accounts.map((account) => {
    const stats = byId.get(account.id);
    return {
      ...account,
      current_balance: computeAccountBalanceFromRows(account.id, account.opening_balance, rows),
      period_expense: stats?.expense ?? 0,
      period_income: stats?.income ?? 0,
    };
  });
}
