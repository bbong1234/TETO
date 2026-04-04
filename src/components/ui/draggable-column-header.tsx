'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DraggableColumnHeaderProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

export default function DraggableColumnHeader({ id, children, className = '' }: DraggableColumnHeaderProps) {
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
      className={`${className} cursor-move`}
    >
      <button
        {...attributes}
        {...listeners}
        className="w-full p-1 rounded hover:bg-slate-100 transition-colors text-left"
        title="拖拽调整列顺序"
      >
        {children}
      </button>
    </div>
  );
}