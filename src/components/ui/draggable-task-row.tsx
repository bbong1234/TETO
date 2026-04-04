'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DraggableTaskRowProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  showHandle?: boolean;
  style?: React.CSSProperties;
}

export default function DraggableTaskRow({ id, children, className = '', showHandle = true, style }: DraggableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const combinedStyle = {
    ...style,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={combinedStyle}
      className={className}
    >
      {/* 拖拽手柄 */}
      {showHandle && (
        <td className="px-4 py-3 border-r border-slate-200 cursor-move">
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
        </td>
      )}
      {children}
    </tr>
  );
}
