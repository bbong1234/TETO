import type { Record as TetoRecord } from '@/types/teto';
import { isOptimisticRecordId } from '@/lib/activity/records-mutation';

let pendingSwitchResolve: ((record: TetoRecord | null) => void) | null = null;
let pendingSwitchPromise: Promise<TetoRecord | null> | null = null;

const resolveInflight = new Map<string, Promise<string | null>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 开始一次 switch/stop（乐观更新前调用） */
export function markActivitySwitchPending(): void {
  if (!pendingSwitchPromise) {
    pendingSwitchPromise = new Promise((resolve) => {
      pendingSwitchResolve = resolve;
    });
  }
}

/** switch/stop 完成（成功或失败）后调用 */
export function settleActivitySwitch(record: TetoRecord | null): void {
  pendingSwitchResolve?.(record);
  pendingSwitchResolve = null;
  pendingSwitchPromise = null;
}

/** 是否有进行中的 switch/stop（乐观更新后、服务端尚未 settle） */
export function hasPendingActivitySwitch(): boolean {
  return pendingSwitchPromise !== null;
}

/** 等待进行中的 switch/stop 结束，返回 settle 时的 record */
export async function waitForPendingActivitySwitch(): Promise<TetoRecord | null> {
  if (!pendingSwitchPromise) return null;
  return pendingSwitchPromise;
}

async function fetchCurrentActivityId(): Promise<string | null> {
  try {
    const res = await fetch('/api/v2/activities/current');
    const data = await res.json();
    const current = data.data as TetoRecord | null;
    if (current?.id && !isOptimisticRecordId(current.id)) return current.id;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 将 optimistic 活动 ID 解析为服务端真实 ID。
 * 先等待进行中的 switch，再短轮询 /activities/current（去重并发请求）。
 */
export async function resolveActivityRecordIdClient(
  activity: TetoRecord
): Promise<string | null> {
  if (!isOptimisticRecordId(activity.id)) return activity.id;

  const cached = resolveInflight.get(activity.id);
  if (cached) return cached;

  const promise = (async (): Promise<string | null> => {
    if (pendingSwitchPromise) {
      const settled = await pendingSwitchPromise;
      if (settled?.id && !isOptimisticRecordId(settled.id)) return settled.id;
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) await sleep(300);
      const id = await fetchCurrentActivityId();
      if (id) return id;
      if (pendingSwitchPromise) {
        const settled = await pendingSwitchPromise;
        if (settled?.id && !isOptimisticRecordId(settled.id)) return settled.id;
      }
    }
    return null;
  })();

  resolveInflight.set(activity.id, promise);
  try {
    return await promise;
  } finally {
    resolveInflight.delete(activity.id);
  }
}
