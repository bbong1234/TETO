'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_MS = 60_000;
const REFRESH_EVENT = 'teto-unassigned-refresh';

export function notifyUnassignedRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  }
}

export function useUnassignedCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/records/unassigned-count');
      const data = await res.json();
      if (res.ok) {
        setCount(typeof data.data?.count === 'number' ? data.data.count : 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onRefresh = () => void refresh();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [refresh]);

  return { count, refresh };
}
