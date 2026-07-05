import { PAYMENT_SOURCES } from '@/lib/activity/recent-context';

export function isPaymentAccountLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  return (PAYMENT_SOURCES as readonly string[]).includes(label.trim());
}

/** 从 tool_label 拆分为收支账户 vs 属性工具 */
export function splitToolLabelForForm(
  toolLabel: string | null | undefined,
  hasFinance: boolean
): { financeAccount: string; toolLabel: string } {
  const raw = toolLabel?.trim() ?? '';
  if (!raw) return { financeAccount: '', toolLabel: '' };
  if (isPaymentAccountLabel(raw) || hasFinance) {
    return { financeAccount: raw, toolLabel: '' };
  }
  return { financeAccount: '', toolLabel: raw };
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
  if (direction === 'expense' || direction === 'income') return true;
  return cost != null && cost > 0;
}
