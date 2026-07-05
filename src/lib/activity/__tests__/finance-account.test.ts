import { describe, expect, it } from 'vitest';
import {
  isPaymentAccountLabel,
  mergeToolLabelForSave,
  splitToolLabelForForm,
} from '@/lib/activity/finance-account';

describe('finance-account', () => {
  it('splits payment account from tool label when finance exists', () => {
    expect(splitToolLabelForForm('微信', true)).toEqual({
      financeAccount: '微信',
      toolLabel: '',
    });
  });

  it('keeps non-payment as tool', () => {
    expect(splitToolLabelForForm('VS Code', false)).toEqual({
      financeAccount: '',
      toolLabel: 'VS Code',
    });
  });

  it('merge prefers finance account when has finance', () => {
    expect(mergeToolLabelForSave('支付宝', 'Cursor', true)).toBe('支付宝');
  });

  it('isPaymentAccountLabel', () => {
    expect(isPaymentAccountLabel('微信')).toBe(true);
    expect(isPaymentAccountLabel('Cursor')).toBe(false);
  });
});
