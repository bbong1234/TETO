'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DraggableTabProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export default function DraggableTab({ id, label, isActive, onClick }: DraggableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="relative"
    >
      <button
        {...listeners}
        onClick={onClick}
        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
      >
        {label}
      </button>
    </div>
  );
}
