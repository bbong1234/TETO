import type { FinanceAccount, FinanceAccountType } from '@/types/teto';
import { MONEY_DIRECTION_LABELS } from '@/types/teto';

export type MoneyDirection = 'expense' | 'income' | 'none' | 'transfer';

export function isPaymentAccountLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  const known = ['支付宝', '微信', '银行卡', '现金'];
  return known.includes(label.trim());
}
export function resolveFinanceAccountName(
  record: {
    finance_account_id?: string | null;
    tool_label?: string | null;
    finance_account?: { name?: string } | null;
  },
  accounts?: FinanceAccount[]
): string {
  if (record.finance_account_id && accounts) {
    const matched = accounts.find((a) => a.id === record.finance_account_id);
    if (matched) return matched.name;
  }
  if (record.finance_account?.name?.trim()) return record.finance_account.name.trim();
  const raw = record.tool_label?.trim() ?? '';
  return raw;
}

/** 从 tool_label 拆分为收支账户 vs 属性工具（兼容旧数据） */
export function splitToolLabelForForm(
  toolLabel: string | null | undefined,
  hasFinance: boolean,
  financeAccountId?: string | null,
  financeAccountName?: string | null
): { financeAccount: string; financeAccountId: string; toolLabel: string } {
  if (financeAccountId) {
    return {
      financeAccount: financeAccountName?.trim() ?? '',
      financeAccountId,
      toolLabel: hasFinance ? '' : (toolLabel?.trim() ?? ''),
    };
  }
  const raw = toolLabel?.trim() ?? '';
  if (!raw) return { financeAccount: '', financeAccountId: '', toolLabel: '' };
  if (isPaymentAccountLabel(raw) || hasFinance) {
    return { financeAccount: raw, financeAccountId: '', toolLabel: '' };
  }
  return { financeAccount: '', financeAccountId: '', toolLabel: raw };
}

export function mergeToolLabelForSave(
  financeAccount: string,
  toolLabel: string,
  hasFinance: boolean
): string | null {
  const account = financeAccount.trim();
  const tool = toolLabel.trim();
  if (hasFinance && account) return account;
  if (tool) return tool;
  if (account) return account;
  return null;
}

export function recordHasFinance(cost: number | null | undefined, direction: string | null | undefined): boolean {
  if (direction === 'none') return false;
  if (direction === 'expense' || direction === 'income' || direction === 'transfer') return true;
  return cost != null && cost > 0;
}

export function resolveFormMoneyDirection(form: {
  moneyDirection: string;
  cost: string;
}): MoneyDirection {
  const direction = form.moneyDirection.trim();
  if (direction === 'none') return 'none';
  if (direction === 'expense' || direction === 'income' || direction === 'transfer') {
    return direction;
  }
  const cost = form.cost.trim() ? parseFloat(form.cost) : null;
  if (cost != null && !Number.isNaN(cost) && cost > 0) return 'expense';
  return 'none';
}

export function formHasFinance(form: { moneyDirection: string; cost: string }): boolean {
  return resolveFormMoneyDirection(form) !== 'none';
}

export function moneyDirectionLabel(direction: MoneyDirection | string): string {
  return MONEY_DIRECTION_LABELS[direction] ?? MONEY_DIRECTION_LABELS.none;
}

export function financeFieldsPatchForNone(): {
  moneyDirection: 'none';
  cost: string;
  financeAccount: string;
  financeAccountId: string;
  transferToAccountId: string;
} {
  return {
    moneyDirection: 'none',
    cost: '',
    financeAccount: '',
    financeAccountId: '',
    transferToAccountId: '',
  };
}

/** 从文本匹配财务账户（微信/支付宝等关键词） */
export function matchFinanceAccountByText(
  text: string,
  accounts: FinanceAccount[]
): FinanceAccount | null {
  const normalized = text.toLowerCase();
  const keywordMap: { keywords: string[]; types: FinanceAccountType[]; names: string[] }[] = [
    { keywords: ['微信', 'wechat'], types: ['wechat'], names: ['微信'] },
    { keywords: ['支付宝', 'alipay', '花呗'], types: ['alipay'], names: ['支付宝'] },
    { keywords: ['银行卡', '储蓄卡', '招行', '工行', '建行'], types: ['bank_card'], names: ['银行卡'] },
    { keywords: ['现金'], types: ['cash'], names: ['现金'] },
    { keywords: ['信用卡'], types: ['credit_card'], names: [] },
  ];

  for (const rule of keywordMap) {
    if (!rule.keywords.some((k) => normalized.includes(k.toLowerCase()))) continue;
    const byType = accounts.find((a) => rule.types.includes(a.account_type) && !a.is_archived);
    if (byType) return byType;
    const byName = accounts.find((a) => rule.names.includes(a.name) && !a.is_archived);
    if (byName) return byName;
  }

  for (const account of accounts) {
    if (!account.is_archived && normalized.includes(account.name.toLowerCase())) {
      return account;
    }
  }

  return null;
}
