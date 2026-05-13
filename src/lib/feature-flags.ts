/**
 * feature-flags.ts — TETO 1.6 功能开关
 *
 * 使用方式：
 *   import { isFeatureEnabled } from '@/lib/feature-flags';
 *   if (await isFeatureEnabled('debug_trace_page')) { ... }
 *
 * 支持基于 userId 哈希的灰度分流（rollout_percentage 0-100）。
 */

import { createClient } from '@/lib/supabase/server';

/** 功能开关缓存（30s TTL 避免每次请求查 DB） */
let cache: { flags: Map<string, FeatureFlagRecord>; fetchedAt: number } | null = null;
const CACHE_TTL = 30_000;

interface FeatureFlagRecord {
  flag_name: string;
  enabled: boolean;
  rollout_percentage: number;
}

async function fetchFlags(): Promise<Map<string, FeatureFlagRecord>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.flags;
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('feature_flags')
      .select('flag_name, enabled, rollout_percentage');

    const flags = new Map<string, FeatureFlagRecord>();
    if (data) {
      for (const row of data) {
        flags.set(row.flag_name, row as FeatureFlagRecord);
      }
    }

    cache = { flags, fetchedAt: Date.now() };
    return flags;
  } catch {
    // DB 不可用时返回空（所有开关默认关闭）
    return new Map();
  }
}

/**
 * 检查功能是否启用
 *
 * @param flagName — 功能名称
 * @param userId   — 可选，用户 ID（用于灰度分流）
 * @returns true 如果功能已启用
 */
export async function isFeatureEnabled(flagName: string, userId?: string): Promise<boolean> {
  const flags = await fetchFlags();
  const flag = flags.get(flagName);

  if (!flag) return false;  // 未定义的开关默认关闭

  // 如果全局关闭，直接 false
  if (!flag.enabled) return false;

  // 灰度分流
  if (flag.rollout_percentage < 100 && userId) {
    const hash = simpleHash(userId + flagName);
    return hash % 100 < flag.rollout_percentage;
  }

  // 100% 全量
  return flag.rollout_percentage === 100;
}

/** 简单字符串哈希（确定性，同一用户始终返回相同值） */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/** 清除缓存（测试用） */
export function clearFlagsCache(): void {
  cache = null;
}
