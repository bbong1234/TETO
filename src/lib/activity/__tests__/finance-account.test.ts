import { describe, it, expect } from 'vitest';
import {
  financeFieldsPatchForNone,
  formHasFinance,
  matchFinanceAccountByText,
  recordHasFinance,
  resolveFormMoneyDirection,
} from '@/lib/activity/finance-account';
import type { FinanceAccount } from '@/types/teto';

const mockAccounts: FinanceAccount[] = [
  {
    id: '1',
    user_id: 'u',
    name: '微信',
    account_type: 'wechat',
    icon: '💚',
    opening_balance: 0,
    currency: 'CNY',
    is_archived: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: '2',
    user_id: 'u',
    name: '支付宝',
    account_type: 'alipay',
    icon: '💙',
    opening_balance: 0,
    currency: 'CNY',
    is_archived: false,
    sort_order: 1,
    created_at: '',
    updated_at: '',
  },
];

describe('finance-account helpers', () => {
  it('recordHasFinance treats explicit none as non-finance even with cost', () => {
    expect(recordHasFinance(32, 'none')).toBe(false);
    expect(recordHasFinance(32, 'expense')).toBe(true);
    expect(recordHasFinance(32, null)).toBe(true);
  });

  it('resolveFormMoneyDirection maps none and legacy cost-only rows', () => {
    expect(resolveFormMoneyDirection({ moneyDirection: 'none', cost: '32' })).toBe('none');
    expect(resolveFormMoneyDirection({ moneyDirection: '', cost: '32' })).toBe('expense');
    expect(resolveFormMoneyDirection({ moneyDirection: 'expense', cost: '' })).toBe('expense');
    expect(resolveFormMoneyDirection({ moneyDirection: '', cost: '' })).toBe('none');
  });

  it('formHasFinance follows resolved direction', () => {
    expect(formHasFinance({ moneyDirection: 'none', cost: '100' })).toBe(false);
    expect(formHasFinance({ moneyDirection: 'expense', cost: '' })).toBe(true);
  });

  it('financeFieldsPatchForNone clears finance fields', () => {
    expect(financeFieldsPatchForNone()).toEqual({
      moneyDirection: 'none',
      cost: '',
      financeAccount: '',
      financeAccountId: '',
      transferToAccountId: '',
    });
  });
});

describe('matchFinanceAccountByText', () => {
  it('matches wechat keyword', () => {
    expect(matchFinanceAccountByText('微信付了32元午饭', mockAccounts)?.name).toBe('微信');
  });

  it('matches alipay keyword', () => {
    expect(matchFinanceAccountByText('支付宝扫码', mockAccounts)?.name).toBe('支付宝');
  });

  it('returns null when no match', () => {
    expect(matchFinanceAccountByText('午饭32元', mockAccounts)).toBeNull();
  });
});
