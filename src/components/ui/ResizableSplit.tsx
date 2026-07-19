'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { clampRatio } from '@/hooks/use-persisted-ratio';

interface ResizableSplitProps {
  direction: 'horizontal' | 'vertical';
  ratio: number;
  onRatioChange: (ratio: number) => void;
  first: ReactNode;
  second?: ReactNode | null;
  minFirstPx?: number;
  minSecondPx?: number;
  className?: string;
  firstClassName?: string;
  secondClassName?: string;
  handleLabel?: string;
}

export default function ResizableSplit({
  direction,
  ratio,
  onRatioChange,
  first,
  second,
  minFirstPx = 120,
  minSecondPx = 120,
  className = '',
  firstClassName = '',
  secondClassName = '',
  handleLabel = '拖动调整区域大小',
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const isHorizontal = direction === 'horizontal';

      const onMove = (moveEvent: PointerEvent) => {
        const total = isHorizontal ? rect.width : rect.height;
        if (total <= 0) return;
        const offset = isHorizontal ? moveEvent.clientX - rect.left : moveEvent.clientY - rect.top;
        const minRatio = minFirstPx / total;
        const maxRatio = 1 - minSecondPx / total;
        onRatioChange(clampRatio(offset / total, minRatio, maxRatio));
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [direction, minFirstPx, minSecondPx, onRatioChange]
  );

  const isHorizontal = direction === 'horizontal';

  if (second == null) {
    return (
      <div
        className={[
          'resizable-split flex min-h-0 min-w-0 flex-1',
          isHorizontal ? 'flex-row' : 'flex-col',
          className,
        ].join(' ')}
      >
        <div className={['min-h-0 min-w-0 flex-1 overflow-hidden', firstClassName].join(' ')}>
          {first}
        </div>
      </div>
    );
  }

  const firstSize = `${ratio * 100}%`;

  return (
    <div
      ref={containerRef}
      className={[
        'resizable-split flex min-h-0 min-w-0 flex-1',
        isHorizontal ? 'flex-row' : 'flex-col',
        className,
      ].join(' ')}
    >
      <div
        className={['min-h-0 min-w-0 overflow-hidden', firstClassName].join(' ')}
        style={isHorizontal ? { width: firstSize, flexShrink: 0 } : { height: firstSize, flexShrink: 0 }}
      >
        {first}
      </div>

      <div
        role="separator"
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
        aria-label={handleLabel}
        tabIndex={0}
        onPointerDown={onPointerDown}
        className={[
          'resizable-split-handle shrink-0 touch-none',
          isHorizontal ? 'resizable-split-handle--horizontal' : 'resizable-split-handle--vertical',
        ].join(' ')}
      />

      <div className={['min-h-0 min-w-0 flex-1 overflow-hidden', secondClassName].join(' ')}>
        {second}
      </div>
    </div>
  );
}
