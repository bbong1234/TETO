'use client';

import type { ReactNode } from 'react';

interface RecordDetailSectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

/** 记录详情统一 section 外壳 */
export default function RecordDetailSection({ title, action, children }: RecordDetailSectionProps) {
  return (
    <section className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
