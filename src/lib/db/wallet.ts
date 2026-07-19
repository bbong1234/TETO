import { getWalletPeriodRanges } from '@/lib/computation/runtime/period-ranges';
import { fmtLocalDate } from '@/lib/computation/runtime/helpers';
import {
  attachBalancesToAccounts,
  computeTotalAssets,
  enrichAccountsWithPeriodStats,
  fetchFinanceRecordsForYear,
  listFinanceAccounts,
} from '@/lib/db/finance-accounts';
import {
  aggregateFinanceRecords,
  filterFinanceRecordsByAccount,
  filterFinanceRecordsByDateRange,
  resolveFinanceAccountLabel,
  type FinanceRecordRow,
} from '@/lib/stats/finance-summary';
import type { WalletPeriodKey, WalletSummary, WalletTransaction } from '@/types/teto';
import { compareTimesDesc } from '@/lib/utils/sortable-time';

const WALLET_TRANSACTION_LIMIT = 50;

function toWalletTransaction(row: FinanceRecordRow): WalletTransaction {
  return {
    id: row.id ?? '',
    date: row.date,
    content: row.content,
    cost: row.cost,
    money_direction: row.money_direction,
    account_label: resolveFinanceAccountLabel(row),
    transfer_to_label: row.transfer_to_name ?? null,
    finance_account_id: row.finance_account_id ?? null,
    occurred_at: row.occurred_at ?? null,
    created_at: row.created_at ?? null,
  };
}

function sortTransactions(rows: FinanceRecordRow[]): WalletTransaction[] {
  return rows
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return compareTimesDesc(a.occurred_at || a.created_at, b.occurred_at || b.created_at);
    })
    .slice(0, WALLET_TRANSACTION_LIMIT)
    .map(toWalletTransaction);
}

export async function getWalletSummary(
  userId: string,
  detailPeriod: WalletPeriodKey = 'today',
  accountId?: string | null
): Promise<WalletSummary> {
  const todayStr = fmtLocalDate(new Date());
  const periodRanges = getWalletPeriodRanges(todayStr);
  const yearRange = periodRanges.find((r) => r.period === 'year');
  if (!yearRange) {
    return {
      periods: [],
      transactions: [],
      accounts: [],
      total_assets: 0,
      structure: { by_category: [], by_item: [] },
    };
  }

  const accounts = await listFinanceAccounts(userId);
  const financeRows = await fetchFinanceRecordsForYear(
    userId,
    yearRange.date_from,
    yearRange.date_to
  );
  const accountsWithBalance = attachBalancesToAccounts(accounts, financeRows);

  const periods = periodRanges.map((range) => {
    let periodRows = filterFinanceRecordsByDateRange(
      financeRows,
      range.date_from,
      range.date_to
    );
    if (accountId) {
      periodRows = filterFinanceRecordsByAccount(periodRows, accountId);
    }
    const aggregate = aggregateFinanceRecords(periodRows, accounts);
    return {
      period: range.period,
      label: range.label,
      date_from: range.date_from,
      date_to: range.date_to,
      total_expense: aggregate.total_expense,
      total_income: aggregate.total_income,
      net: aggregate.net,
      by_account: aggregate.by_account,
    };
  });

  const detailRange = periodRanges.find((r) => r.period === detailPeriod) ?? periodRanges[0];
  let detailRows = detailRange
    ? filterFinanceRecordsByDateRange(financeRows, detailRange.date_from, detailRange.date_to)
    : [];
  if (accountId) {
    detailRows = filterFinanceRecordsByAccount(detailRows, accountId);
  }

  const structureAggregate = aggregateFinanceRecords(detailRows, accounts);
  const periodAccounts = detailRange
    ? await enrichAccountsWithPeriodStats(
        accountsWithBalance,
        financeRows,
        detailRange.date_from,
        detailRange.date_to
      )
    : accountsWithBalance;

  return {
    periods,
    transactions: sortTransactions(detailRows),
    accounts: periodAccounts,
    total_assets: computeTotalAssets(accountsWithBalance),
    structure: {
      by_category: structureAggregate.by_category,
      by_item: structureAggregate.by_item,
    },
  };
}

export async function getAccountTransactions(
  userId: string,
  accountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<WalletTransaction[]> {
  const todayStr = fmtLocalDate(new Date());
  const yearRange = getWalletPeriodRanges(todayStr).find((r) => r.period === 'year');
  if (!yearRange) return [];

  const financeRows = await fetchFinanceRecordsForYear(
    userId,
    yearRange.date_from,
    yearRange.date_to
  );

  let rows = filterFinanceRecordsByAccount(financeRows, accountId);
  if (dateFrom && dateTo) {
    rows = filterFinanceRecordsByDateRange(rows, dateFrom, dateTo);
  }

  return sortTransactions(rows);
}
