'use client';

import type { ExpenseCategoryRow, ExpenseItemRow } from '@/types/teto';

interface WalletStructurePanelProps {
  byCategory: ExpenseCategoryRow[];
  byItem: ExpenseItemRow[];
}

function BarSection({
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

export default function WalletStructurePanel({ byCategory, byItem }: WalletStructurePanelProps) {
  if (byCategory.length === 0 && byItem.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800">结构分析</h2>
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 space-y-3">
        <BarSection title="按类别" rows={byCategory} barClass="bg-amber-400" />
        <BarSection
          title="按事项"
          rows={byItem.map((r) => ({ label: r.label, amount: r.amount }))}
          barClass="bg-blue-400"
        />
      </div>
    </div>
  );
}
