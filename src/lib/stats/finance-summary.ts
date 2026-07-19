import type {
  ExpenseCategoryRow,
  ExpenseItemRow,
  ExpensePaymentRow,
  ExpenseSummary,
  FinanceAccount,
  FinanceAccountType,
  WalletAccountRow,
} from '@/types/teto';
import { FINANCE_ACCOUNT_TYPE_ICONS } from '@/types/teto';

export const UNSPECIFIED_ACCOUNT_LABEL = '未指定账户';

export interface FinanceRecordRow {
  date: string;
  cost: number;
  money_direction: 'expense' | 'income' | 'none' | 'transfer' | null;
  tool_label: string | null;
  finance_account_id?: string | null;
  transfer_to_account_id?: string | null;
  account_name?: string | null;
  account_type?: FinanceAccountType | null;
  account_icon?: string | null;
  transfer_to_name?: string | null;
  content: string;
  item_id?: string | null;
  item_title?: string | null;
  id?: string;
  occurred_at?: string | null;
  created_at?: string | null;
}

export interface FinanceAggregate {
  total_expense: number;
  total_income: number;
  net: number;
  by_account: WalletAccountRow[];
  by_category: ExpenseCategoryRow[];
  by_item: ExpenseItemRow[];
  by_payment_source: ExpensePaymentRow[];
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isFinanceRecord(row: Pick<FinanceRecordRow, 'cost' | 'money_direction'>): boolean {
  const cost = Number(row.cost) || 0;
  if (cost <= 0) return false;
  return row.money_direction !== 'none';
}

export function resolveFinanceAccountLabel(
  row: Pick<FinanceRecordRow, 'tool_label' | 'finance_account_id' | 'account_name'>,
  accounts?: FinanceAccount[]
): string {
  if (row.finance_account_id && accounts) {
    const matched = accounts.find((a) => a.id === row.finance_account_id);
    if (matched) return matched.name;
  }
  if (row.account_name?.trim()) return row.account_name.trim();
  const trimmed = row.tool_label?.trim();
  return trimmed || UNSPECIFIED_ACCOUNT_LABEL;
}

function getOrCreateAccountEntry(
  map: Map<string, WalletAccountRow>,
  accountId: string | null,
  label: string,
  accountType?: FinanceAccountType | null,
  icon?: string | null
): WalletAccountRow {
  const key = accountId ?? `__label__:${label}`;
  const existing = map.get(key);
  if (existing) return existing;
  const entry: WalletAccountRow = {
    account_id: accountId,
    label,
    account_type: accountType ?? null,
    icon: icon ?? null,
    expense: 0,
    income: 0,
    net: 0,
  };
  map.set(key, entry);
  return entry;
}

function applyExpenseToAccount(
  map: Map<string, WalletAccountRow>,
  accountId: string | null,
  label: string,
  amount: number,
  accountType?: FinanceAccountType | null,
  icon?: string | null
) {
  const entry = getOrCreateAccountEntry(map, accountId, label, accountType, icon);
  entry.expense += amount;
  entry.net = roundMoney(entry.income - entry.expense);
}

function applyIncomeToAccount(
  map: Map<string, WalletAccountRow>,
  accountId: string | null,
  label: string,
  amount: number,
  accountType?: FinanceAccountType | null,
  icon?: string | null
) {
  const entry = getOrCreateAccountEntry(map, accountId, label, accountType, icon);
  entry.income += amount;
  entry.net = roundMoney(entry.income - entry.expense);
}

export function aggregateFinanceRecords(
  records: FinanceRecordRow[],
  accounts?: FinanceAccount[]
): FinanceAggregate {
  let totalExpense = 0;
  let totalIncome = 0;
  const byAccount = new Map<string, WalletAccountRow>();
  const byLabel = new Map<string, number>();
  const byItem = new Map<string, ExpenseItemRow>();
  const byPayment = new Map<string, number>();

  for (const row of records) {
    if (!isFinanceRecord(row)) continue;

    const cost = Number(row.cost) || 0;
    const direction = row.money_direction;
    const accountLabel = resolveFinanceAccountLabel(row, accounts);
    const accountId = row.finance_account_id ?? null;
    const accountType = row.account_type ?? accounts?.find((a) => a.id === accountId)?.account_type ?? null;
    const accountIcon = row.account_icon ?? accounts?.find((a) => a.id === accountId)?.icon ?? null;

    if (direction === 'transfer') {
      const fromLabel = accountLabel;
      const toLabel =
        row.transfer_to_name ??
        (row.transfer_to_account_id
          ? accounts?.find((a) => a.id === row.transfer_to_account_id)?.name
          : null) ??
        '未指定账户';
      const toId = row.transfer_to_account_id ?? null;
      const toType = accounts?.find((a) => a.id === toId)?.account_type ?? null;
      const toIcon = accounts?.find((a) => a.id === toId)?.icon ?? null;
      applyExpenseToAccount(byAccount, accountId, fromLabel, cost, accountType, accountIcon);
      applyIncomeToAccount(byAccount, toId, toLabel, cost, toType, toIcon);
      continue;
    }

    if (direction === 'income') {
      totalIncome += cost;
      applyIncomeToAccount(byAccount, accountId, accountLabel, cost, accountType, accountIcon);
      continue;
    }

    totalExpense += cost;
    applyExpenseToAccount(byAccount, accountId, accountLabel, cost, accountType, accountIcon);

    const categoryLabel = (row.content || '其他').trim() || '其他';
    byLabel.set(categoryLabel, (byLabel.get(categoryLabel) ?? 0) + cost);

    const itemKey = row.item_id ?? '__none__';
    const itemLabel =
      row.item_title?.trim() || (row.item_id ? '未命名事项' : '未关联事项');
    const itemEntry = byItem.get(itemKey) ?? {
      item_id: row.item_id ?? null,
      label: itemLabel,
      amount: 0,
    };
    itemEntry.amount += cost;
    byItem.set(itemKey, itemEntry);

    const paymentLabel = accountLabel !== UNSPECIFIED_ACCOUNT_LABEL ? accountLabel : row.tool_label?.trim();
    if (paymentLabel) {
      byPayment.set(paymentLabel, (byPayment.get(paymentLabel) ?? 0) + cost);
    }
  }

  const by_account = [...byAccount.values()]
    .map((row) => ({
      ...row,
      expense: roundMoney(row.expense),
      income: roundMoney(row.income),
      net: roundMoney(row.net),
      icon: row.icon ?? (row.account_type ? FINANCE_ACCOUNT_TYPE_ICONS[row.account_type] : null),
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.expense - a.expense);

  const by_category = [...byLabel.entries()]
    .map(([label, amount]) => ({ label, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const by_item = [...byItem.values()]
    .map((row) => ({ ...row, amount: roundMoney(row.amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const by_payment_source = [...byPayment.entries()]
    .map(([label, amount]) => ({ label, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  totalExpense = roundMoney(totalExpense);
  totalIncome = roundMoney(totalIncome);

  return {
    total_expense: totalExpense,
    total_income: totalIncome,
    net: roundMoney(totalIncome - totalExpense),
    by_account,
    by_category,
    by_item,
    by_payment_source,
  };
}

export function toExpenseSummary(aggregate: FinanceAggregate): ExpenseSummary {
  return {
    total_expense: aggregate.total_expense,
    total_income: aggregate.total_income,
    by_category: aggregate.by_category,
    by_item: aggregate.by_item,
    by_payment_source: aggregate.by_payment_source,
  };
}

export function filterFinanceRecordsByDateRange(
  records: FinanceRecordRow[],
  dateFrom: string,
  dateTo: string
): FinanceRecordRow[] {
  return records.filter((row) => row.date >= dateFrom && row.date <= dateTo);
}

export function filterFinanceRecordsByAccount(
  records: FinanceRecordRow[],
  accountId: string | null
): FinanceRecordRow[] {
  if (!accountId) return records;
  return records.filter(
    (row) =>
      row.finance_account_id === accountId ||
      row.transfer_to_account_id === accountId
  );
}
