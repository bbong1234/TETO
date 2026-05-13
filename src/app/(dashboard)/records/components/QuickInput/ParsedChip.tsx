'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ChipData {
  key: string;
  label: string;
  value: string;
  icon?: React.ReactNode;
}

export default function ParsedChip({
  chip,
  onRemove,
  onEdit,
}: {
  chip: ChipData;
  onRemove: () => void;
  onEdit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(chip.value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(chip.value);
  }, [chip.value]);

  const handleConfirm = () => {
    onEdit(editValue);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[11px]">
        {chip.icon}
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
            if (e.key === 'Escape') { setEditValue(chip.value); setEditing(false); }
          }}
          className="w-16 bg-transparent text-blue-700 text-[11px] focus:outline-none border-b border-blue-300"
        />
      </span>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors"
    >
      {chip.icon}
      {chip.label} {chip.value}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="ml-0.5 text-blue-400 hover:text-blue-600"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
