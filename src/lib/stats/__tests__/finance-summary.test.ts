import { describe, it, expect } from 'vitest';
import {
  aggregateFinanceRecords,
  filterFinanceRecordsByDateRange,
  isFinanceRecord,
  resolveFinanceAccountLabel,
  UNSPECIFIED_ACCOUNT_LABEL,
  type FinanceRecordRow,
} from '../finance-summary';

const baseRows: FinanceRecordRow[] = [
  {
    date: '2026-07-10',
    cost: 32,
    money_direction: 'expense',
    tool_label: '支付宝',
    finance_account_id: 'acc-alipay',
    account_name: '支付宝',
    content: '午饭',
    item_id: 'item-1',
    item_title: '生活',
    id: 'r1',
  },
  {
    date: '2026-07-11',
    cost: 5000,
    money_direction: 'income',
    tool_label: '银行卡',
    finance_account_id: 'acc-bank',
    account_name: '银行卡',
    content: '工资',
    id: 'r2',
  },
  {
    date: '2026-07-11',
    cost: 18,
    money_direction: 'expense',
    tool_label: null,
    finance_account_id: null,
    content: '咖啡',
    id: 'r3',
  },
  {
    date: '2026-07-12',
    cost: 10,
    money_direction: 'none',
    tool_label: '微信',
    content: '无效',
    id: 'r4',
  },
  {
    date: '2026-07-12',
    cost: 200,
    money_direction: 'transfer',
    finance_account_id: 'acc-wechat',
    transfer_to_account_id: 'acc-bank',
    tool_label: null,
    account_name: '微信',
    transfer_to_name: '银行卡',
    content: '提现',
    id: 'r5',
  },
];

describe('isFinanceRecord', () => {
  it('accepts positive cost with expense/income/transfer', () => {
    expect(isFinanceRecord({ cost: 10, money_direction: 'expense' })).toBe(true);
    expect(isFinanceRecord({ cost: 10, money_direction: 'income' })).toBe(true);
    expect(isFinanceRecord({ cost: 10, money_direction: 'transfer' })).toBe(true);
    expect(isFinanceRecord({ cost: 10, money_direction: null })).toBe(true);
  });

  it('rejects zero cost or none direction', () => {
    expect(isFinanceRecord({ cost: 0, money_direction: 'expense' })).toBe(false);
    expect(isFinanceRecord({ cost: 10, money_direction: 'none' })).toBe(false);
  });
});

describe('resolveFinanceAccountLabel', () => {
  it('prefers account_name from join', () => {
    expect(resolveFinanceAccountLabel({ tool_label: null, finance_account_id: 'x', account_name: '微信' })).toBe('微信');
  });

  it('falls back to unspecified account', () => {
    expect(resolveFinanceAccountLabel({ tool_label: null, finance_account_id: null, account_name: null })).toBe(
      UNSPECIFIED_ACCOUNT_LABEL
    );
  });
});

describe('aggregateFinanceRecords', () => {
  it('aggregates totals and net', () => {
    const result = aggregateFinanceRecords(baseRows);
    expect(result.total_expense).toBe(50);
    expect(result.total_income).toBe(5000);
    expect(result.net).toBe(4950);
  });

  it('splits income and expense by account id', () => {
    const result = aggregateFinanceRecords(baseRows.filter((r) => r.id !== 'r5'));
    expect(result.by_account).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account_id: 'acc-bank', label: '银行卡', income: 5000 }),
        expect.objectContaining({ account_id: 'acc-alipay', label: '支付宝', expense: 32 }),
        expect.objectContaining({ account_id: null, label: UNSPECIFIED_ACCOUNT_LABEL, expense: 18 }),
      ])
    );
  });

  it('handles transfer across two accounts without affecting net', () => {
    const result = aggregateFinanceRecords(baseRows);
    const wechat = result.by_account.find((a) => a.account_id === 'acc-wechat');
    const bank = result.by_account.find((a) => a.account_id === 'acc-bank');
    expect(wechat?.expense).toBe(200);
    expect(bank?.income).toBe(5200);
    expect(result.net).toBe(4950);
  });

  it('keeps expense-only breakdowns for insights compatibility', () => {
    const result = aggregateFinanceRecords(baseRows);
    expect(result.by_category).toEqual([{ label: '午饭', amount: 32 }, { label: '咖啡', amount: 18 }]);
  });
});

describe('filterFinanceRecordsByDateRange', () => {
  it('filters inclusive date range', () => {
    const filtered = filterFinanceRecordsByDateRange(baseRows, '2026-07-11', '2026-07-12');
    expect(filtered.map((r) => r.id)).toEqual(['r2', 'r3', 'r4', 'r5']);
  });
});
