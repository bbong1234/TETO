'use client';

import { memo } from 'react';
import type { Record as TetoRecord } from '@/types/teto';
import { formatElapsedClock } from '@/lib/activity/stats-utils';
import { useSessionElapsedSeconds } from '@/hooks/use-elapsed-seconds';
import { isSessionPaused } from '@/lib/activity/session-utils';

interface ActivitySessionTimerProps {
  activity?: TetoRecord | null;
  /** 块时间冻结态：显示 --:-- 且不 tick */
  frozen?: boolean;
  /** compact：底部折叠条；drawer：全屏抽屉顶栏；default：桌面卡片 */
  variant?: 'compact' | 'drawer' | 'default';
  className?: string;
}

/** 独立计时展示，避免每秒 tick 带动报备面板整树重渲染 */
const ActivitySessionTimer = memo(function ActivitySessionTimer({
  activity,
  frozen = false,
  variant = 'default',
  className,
}: ActivitySessionTimerProps) {
  const elapsedSeconds = useSessionElapsedSeconds(frozen ? null : activity);
  const paused = !frozen && isSessionPaused(activity?.session_state);
  const clock = frozen ? '--:--' : formatElapsedClock(elapsedSeconds);

  if (variant === 'drawer') {
    return (
      <p
        className={[
          'mt-2 text-center text-4xl font-bold tabular-nums tracking-tight sm:text-5xl',
          paused ? 'text-slate-400' : 'text-slate-900',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {clock}
      </p>
    );
  }

  if (variant === 'compact') {
    return (
      <p
        className={[
          'text-xl font-semibold tabular-nums',
          paused ? 'text-slate-400' : 'text-slate-900',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {clock}
      </p>
    );
  }

  return (
    <p
      className={[
        'text-2xl font-semibold tabular-nums sm:text-3xl',
        paused ? 'text-slate-400' : 'text-slate-900',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {clock}
    </p>
  );
});

export default ActivitySessionTimer;
