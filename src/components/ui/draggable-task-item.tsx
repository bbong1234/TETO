'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DraggableTaskItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  showHandle?: boolean;
}

export default function DraggableTaskItem({ id, children, className = '', showHandle = true }: DraggableTaskItemProps) {
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
      className={`${className} ${showHandle ? 'cursor-move' : ''}`}
    >
      {/* 拖拽手柄 */}
      {showHandle && (
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 p-2">
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded hover:bg-slate-100 transition-colors"
            title="拖拽调整顺序"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-500"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
