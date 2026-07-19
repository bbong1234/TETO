'use client';

import { useEffect, useState } from 'react';

/** 关闭时延迟卸载，以便播放退出动画 */
export function useDelayedVisible(visible: boolean, delayMs = 360): boolean {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), delayMs);
    return () => clearTimeout(timer);
  }, [visible, delayMs]);

  return mounted;
}
