'use client';

import type { ReactNode } from 'react';

export function CompactInput({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 focus-within:border-blue-400 focus-within:bg-white transition-colors">
      {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <span className="block text-[9px] text-slate-400 leading-none mb-0.5">{label}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none"
        />
      </div>
    </div>
  );
}
