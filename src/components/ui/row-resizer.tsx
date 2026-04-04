'use client';

import React, { useState, useRef, useEffect } from 'react';

interface RowResizerProps {
  rowId: string;
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  onHeightChange: (rowId: string, height: number) => void;
  children: React.ReactNode;
}

export default function RowResizer({ 
  rowId, 
  initialHeight = 60, 
  minHeight = 40, 
  maxHeight = 200, 
  onHeightChange,
  children
}: RowResizerProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [currentHeight, setCurrentHeight] = useState(initialHeight);
  const rowRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  useEffect(() => {
    setCurrentHeight(initialHeight);
  }, [initialHeight]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = currentHeight;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaY = e.clientY - startYRef.current;
      let newHeight = startHeightRef.current + deltaY;
      
      // 限制高度范围
      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      
      setCurrentHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        onHeightChange(rowId, currentHeight);
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
  }, [isResizing, currentHeight, rowId, minHeight, maxHeight, onHeightChange]);

  return (
    <div 
      ref={rowRef}
      className="relative"
      style={{ height: `${currentHeight}px` }}
    >
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200 cursor-row-resize hover:bg-slate-400 transition-colors"
           onMouseDown={handleMouseDown}
           style={{ 
             cursor: isResizing ? 'row-resize' : 'row-resize',
             zIndex: 10 
           }}
      />
      <div className="h-full overflow-auto">
        {children}
      </div>
    </div>
  );
}
