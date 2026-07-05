'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface EditableChipRowProps {
  label?: string;
  value: string;
  placeholder?: string;
  onClick?: () => void;
  /** 受控展开 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  className?: string;
}

export default function EditableChipRow({
  label,
  value,
  placeholder = '未设置',
  onClick,
  open: openProp,
  onOpenChange,
  children,
  className = '',
}: EditableChipRowProps) {
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp ?? openLocal;
  const setOpen = onOpenChange ?? setOpenLocal;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, setOpen]);

  const display = value.trim() || placeholder;
  const isEmpty = !value.trim();

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && <span className="mb-0.5 block text-[10px] text-slate-400">{label}</span>}
      <button
        type="button"
        onClick={() => {
          onClick?.();
          if (children) setOpen(!open);
        }}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
          isEmpty
            ? 'border border-dashed border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600'
            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
        }`}
      >
        {display}
        {children && <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && children && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{children}</h3>;
}
