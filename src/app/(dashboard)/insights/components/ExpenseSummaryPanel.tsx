'use client';

import { Wallet } from 'lucide-react';
import type { ExpenseSummary } from '@/types/teto';

interface ExpenseSummaryPanelProps {
  data: ExpenseSummary | null | undefined;
}

function ExpenseBarSection({
  title,
  rows,
  barClass,
}: {
  title: string;
  rows: { label: string; amount: number }[];
  barClass: string;
}) {
  if (rows.length === 0) return null;
  const maxAmount = Math.max(...rows.map((c) => c.amount), 1);

  return (
    <div className="space-y-2 pt-2 border-t border-slate-100 first:border-t-0 first:pt-0">
      <p className="text-[10px] font-medium text-slate-400">{title}</p>
      {rows.map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">{row.label}</span>
            <span className="tabular-nums text-slate-800 font-medium">¥{row.amount.toFixed(2)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${barClass}`}
              style={{ width: `${(row.amount / maxAmount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ExpenseSummaryPanel({ data }: ExpenseSummaryPanelProps) {
  if (!data || data.total_expense <= 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-amber-600" />
          <h2 className="text-base font-semibold text-slate-800">消费汇总</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">本期暂无消费记录。记录页点 ¥ 可快速记账。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-amber-600" />
        <h2 className="text-base font-semibold text-slate-800">消费汇总</h2>
        <span className="text-sm font-semibold text-amber-700 ml-auto tabular-nums">
          ¥{data.total_expense.toFixed(2)}
        </span>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 space-y-3">
        <ExpenseBarSection title="按类别" rows={data.by_category} barClass="bg-amber-400" />
        <ExpenseBarSection
          title="按事项"
          rows={(data.by_item ?? []).map((r) => ({ label: r.label, amount: r.amount }))}
          barClass="bg-blue-400"
        />
        <ExpenseBarSection
          title="按支付方式"
          rows={data.by_payment_source ?? []}
          barClass="bg-emerald-400"
        />
        {data.total_income > 0 && (
          <p className="text-[10px] text-emerald-600 pt-1 border-t border-slate-100">
            收入 ¥{data.total_income.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
