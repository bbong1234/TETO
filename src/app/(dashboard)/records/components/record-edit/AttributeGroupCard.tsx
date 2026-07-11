'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface AttributeGroupCardProps {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function AttributeGroupCard({
  label,
  summary,
  open,
  onToggle,
  children,
}: AttributeGroupCardProps) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-medium text-slate-500">{label}</span>
          {!open && summary && (
            <p className="mt-0.5 truncate text-xs text-slate-800">{summary}</p>
          )}
        </div>
      </button>
      {open && <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">{children}</div>}
    </div>
  );
}
