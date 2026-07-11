'use client';

import { useEffect, useState } from 'react';
import { CANCEL_WINDOW_MS } from '@/lib/activity/constants';

interface GraceProgressChipProps {
  label: string;
  onClick: () => void;
  graceActive?: boolean;
  graceExpiresAt?: number | null;
  className?: string;
  accent?: 'blue' | 'emerald' | 'indigo';
}

function graceRemainingRatio(expiresAt: number | null): number {
  if (!expiresAt) return 1;
  return Math.max(0, expiresAt - Date.now()) / CANCEL_WINDOW_MS;
}

/** 块时间 5 秒撤销窗：选中标签内展示倒计时进度条（不改变 chip 尺寸） */
export default function GraceProgressChip({
  label,
  onClick,
  graceActive = false,
  graceExpiresAt = null,
  className = '',
}: GraceProgressChipProps) {
  const [remainingRatio, setRemainingRatio] = useState(() =>
    graceRemainingRatio(graceExpiresAt)
  );
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!graceActive || !graceExpiresAt) {
      return;
    }
    setRemainingRatio(graceRemainingRatio(graceExpiresAt));
    const tick = () => {
      const remaining = Math.max(0, graceExpiresAt - Date.now());
      setRemainingRatio(remaining / CANCEL_WINDOW_MS);
      setSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
    };
    tick();
    const id = setInterval(tick, 40);
    return () => clearInterval(id);
  }, [graceActive, graceExpiresAt]);

  const showProgress = graceActive && graceExpiresAt != null && remainingRatio > 0;

  return (
    <button
      type="button"
      onClick={() => {
        onClick();
      }}
      title={showProgress && secondsLeft > 0 ? `${secondsLeft} 秒内可撤销` : undefined}
      className={['relative overflow-hidden', className].join(' ')}
    >
      {showProgress && (
        <>
          <span aria-hidden className="absolute inset-0 bg-slate-950/25" />
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-300/85 via-amber-400/85 to-amber-300/85 transition-[width] duration-75 ease-linear"
            style={{ width: `${remainingRatio * 100}%` }}
          />
        </>
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}
