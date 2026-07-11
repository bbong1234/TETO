/**
 * 块时间 / 进行中活动 — 客户端状态契约（唯一裁判）
 * @see docs/block-session-contract.md
 */

export const BLOCK_SESSION_CONTRACT_VERSION = 1;

/** 主路径 ID（契约外行为不保证） */
export const BLOCK_SESSION_PATHS = ['P1', 'P2', 'P3', 'P4'] as const;
export type BlockSessionPathId = (typeof BLOCK_SESSION_PATHS)[number];

export type CancelWindowMode = 'start' | 'switch';

/** pending switch 期间禁止将 activity 置 null（显式 stop/cancel 成功除外） */
export const INVARIANT_NO_NULL_DURING_PENDING = 'no_null_during_pending';

/** tombstone 仅在 DELETE 成功或 404 后清除 */
export const INVARIANT_TOMBSTONE_DELETE_ONLY = 'tombstone_delete_only';

/** 块内 PATCH 必须带完整 item_id + sub_item_id */
export const INVARIANT_PATCH_FULL_ITEM = 'patch_full_item';

/** 异步响应代次不匹配时静默丢弃 */
export const INVARIANT_GEN_STALE_DISCARD = 'gen_stale_discard';

/** 撤销快照必须含段 meta */
export const INVARIANT_UNDO_SEGMENT_META = 'undo_segment_meta';

export interface SessionGeneration {
  current: number;
}

export function nextSessionGen(gen: SessionGeneration): SessionGeneration {
  return { current: gen.current + 1 };
}

export function isStaleGeneration(captured: number, current: number): boolean {
  return captured !== current;
}

export interface SessionInvariantContext {
  pendingSwitch: boolean;
  activity: unknown | null;
  nextActivity: unknown | null;
  lockedCategoryId: string | null;
}

export type SessionInvariantViolation =
  | typeof INVARIANT_NO_NULL_DURING_PENDING
  | typeof INVARIANT_TOMBSTONE_DELETE_ONLY
  | typeof INVARIANT_PATCH_FULL_ITEM
  | typeof INVARIANT_GEN_STALE_DISCARD
  | typeof INVARIANT_UNDO_SEGMENT_META;

/** 开发态断言；生产环境 no-op */
export function assertSessionInvariant(
  violation: SessionInvariantViolation | null
): void {
  if (process.env.NODE_ENV === 'production') return;
  if (violation) {
    console.warn(`[block-session-contract] invariant violated: ${violation}`);
  }
}

export function assertNoNullDuringPending(ctx: SessionInvariantContext): void {
  if (
    ctx.pendingSwitch &&
    ctx.activity != null &&
    ctx.nextActivity == null &&
    ctx.lockedCategoryId != null
  ) {
    assertSessionInvariant(INVARIANT_NO_NULL_DURING_PENDING);
  }
}
