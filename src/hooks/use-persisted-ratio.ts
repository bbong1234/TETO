'use client';

import { useCallback, useEffect, useState } from 'react';

export function clampRatio(value: number, min = 0.18, max = 0.82): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function usePersistedRatio(storageKey: string, defaultRatio: number) {
  const [ratio, setRatioState] = useState(() => clampRatio(defaultRatio));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed)) {
        setRatioState(clampRatio(parsed));
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const setRatio = useCallback(
    (next: number) => {
      const clamped = clampRatio(next);
      setRatioState(clamped);
      try {
        localStorage.setItem(storageKey, String(clamped));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  return [ratio, setRatio] as const;
}
