'use client';

import { useState } from 'react';
import { PAYMENT_SOURCES } from '@/lib/activity/recent-context';
import { MONEY_DIRECTION_LABELS } from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import RecordDetailSection from './RecordDetailSection';

interface RecordFinanceSectionProps {
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordFinanceSection({ form, onPatch }: RecordFinanceSectionProps) {
  const [open, setOpen] = useState(false);

  const hasFinance =
    form.moneyDirection === 'expense' ||
    form.moneyDirection === 'income' ||
    (form.cost && parseFloat(form.cost) > 0);

  const directionLabel = form.moneyDirection
    ? MONEY_DIRECTION_LABELS[form.moneyDirection as keyof typeof MONEY_DIRECTION_LABELS] ?? form.moneyDirection
    : '支出';

  const summary = hasFinance
    ? `${directionLabel}${form.cost ? ` ¥${form.cost}` : ''}${form.financeAccount ? ` · ${form.financeAccount}` : ''}`
    : '';

  return (
    <RecordDetailSection title="收支">
      <div className="flex flex-wrap items-center gap-1.5">
        {hasFinance ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
          >
            {summary}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              onPatch({ moneyDirection: form.moneyDirection || 'expense' });
            }}
            className="rounded-full border border-dashed border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-400 hover:border-blue-300 hover:text-blue-600"
          >
            + 记一笔
          </button>
        )}
        {form.financeAccount && !hasFinance && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {form.financeAccount}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="flex flex-wrap gap-1">
            {(['expense', 'income', 'none'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onPatch({ moneyDirection: d === 'none' ? '' : d })}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  form.moneyDirection === d || (d === 'none' && !form.moneyDirection)
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {MONEY_DIRECTION_LABELS[d]}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={form.cost}
            onChange={(e) => onPatch({ cost: e.target.value })}
            placeholder="金额"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <div className="flex flex-wrap gap-1">
            {PAYMENT_SOURCES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPatch({ financeAccount: p })}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  form.financeAccount === p
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled
              title="即将支持"
              className="rounded-full border border-dashed border-slate-200 px-2 py-0.5 text-[10px] text-slate-400"
            >
              + 新建账户
            </button>
          </div>
          <input
            type="text"
            value={form.moneyCurrency}
            onChange={(e) => onPatch({ moneyCurrency: e.target.value })}
            placeholder="币种 CNY"
            className="w-24 rounded border border-slate-200 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              onPatch({ cost: '', moneyDirection: '', financeAccount: '' });
              setOpen(false);
            }}
            className="text-[10px] text-slate-400 hover:text-red-500"
          >
            清除收支
          </button>
        </div>
      )}
    </RecordDetailSection>
  );
}
