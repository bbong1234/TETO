'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ConnectorPath {
  recordId: string;
  d: string;
  focused: boolean;
}

interface DiaryTimelineConnectorProps {
  active: boolean;
  focusedRecordId?: string | null;
  layoutRootRef: React.RefObject<HTMLElement | null>;
}

function buildBezierPath(
  from: DOMRect,
  to: DOMRect,
  root: DOMRect
): string {
  const x1 = from.left + from.width * 0.1 - root.left;
  const y1 = from.top + from.height / 2 - root.top;
  const x2 = to.right - 8 - root.left;
  const y2 = to.top + to.height / 2 - root.top;
  const cx1 = x1 - Math.min(80, Math.abs(x1 - x2) * 0.35);
  const cx2 = x2 + Math.min(80, Math.abs(x1 - x2) * 0.35);
  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
}

export default function DiaryTimelineConnector({
  active,
  focusedRecordId = null,
  layoutRootRef,
}: DiaryTimelineConnectorProps) {
  const [paths, setPaths] = useState<ConnectorPath[]>([]);
  const rafRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    const root = layoutRootRef.current;
    if (!root || !active) {
      setPaths([]);
      return;
    }

    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setPaths([]);
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const diaryNodes = root.querySelectorAll('[data-diary-record-id]');
    const next: ConnectorPath[] = [];

    diaryNodes.forEach((node) => {
      const recordId = node.getAttribute('data-diary-record-id');
      if (!recordId) return;
      const timelineNode = root.querySelector(`[data-timeline-record-id="${recordId}"]`);
      if (!timelineNode) return;
      const fromRect = node.getBoundingClientRect();
      const toRect = timelineNode.getBoundingClientRect();
      next.push({
        recordId,
        d: buildBezierPath(fromRect, toRect, rootRect),
        focused: focusedRecordId === recordId,
      });
    });

    setPaths(next);
  }, [active, focusedRecordId, layoutRootRef]);

  useEffect(() => {
    if (!active) {
      setPaths([]);
      return;
    }

    const schedule = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        recompute();
      });
    };

    schedule();
    const root = layoutRootRef.current;
    if (!root) return;

    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    root.querySelectorAll('[data-diary-record-id], [data-timeline-record-id]').forEach((el) => {
      observer.observe(el);
    });

    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, recompute, layoutRootRef]);

  if (!active || paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 hidden lg:block"
      aria-hidden
    >
      {paths.map((path) => (
        <path
          key={path.recordId}
          d={path.d}
          fill="none"
          stroke="#6366f1"
          strokeWidth={path.focused ? 2.5 : 1.75}
          opacity={path.focused ? 1 : 0.75}
        />
      ))}
    </svg>
  );
}
