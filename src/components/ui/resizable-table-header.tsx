'use client';

import React, { useState, useRef, useEffect } from 'react';

interface ResizableTableHeaderProps {
  columnId: string;
  title: React.ReactNode;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange: (columnId: string, width: number) => void;
  children?: React.ReactNode;
  className?: string;
}

export default function ResizableTableHeader({ 
  columnId, 
  title, 
  width = 120, 
  minWidth = 80, 
  maxWidth = 400, 
  onWidthChange,
  children,
  className = ''
}: ResizableTableHeaderProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(width);
  const headerRef = useRef<HTMLTableCellElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    setCurrentWidth(width);
  }, [width]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startXRef.current;
      let newWidth = startWidthRef.current + deltaX;
      
      // 限制宽度范围
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      setCurrentWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        onWidthChange(columnId, currentWidth);
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, currentWidth, columnId, minWidth, maxWidth, onWidthChange]);

  return (
    <th 
      ref={headerRef}
      className={`${className} relative`}
      style={{ 
        width: `${currentWidth}px`,
        minWidth: `${minWidth}px`,
        maxWidth: `${maxWidth}px`,
        position: 'relative'
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {title}
          {children}
        </div>
        <div 
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-slate-400 transition-colors z-10"
          onMouseDown={handleMouseDown}
          style={{ cursor: isResizing ? 'col-resize' : 'col-resize' }}
        />
      </div>
    </th>
  );
}
