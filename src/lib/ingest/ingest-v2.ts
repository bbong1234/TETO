/**
 * ingest v2 开关：客户端 QuickInput 与服务端 /api/v2/inputs 共用同一套规则。
 *
 * 优先级（高 → 低）：
 * 1. INGEST_V2 / NEXT_PUBLIC_INGEST_V2 显式 true|false（字符串 '1'|'0' 同义）
 * 2. development 或 NEXT_PUBLIC_DEV_MODE=true → 默认开启
 * 3. 生产：查 feature_flags.ingest_v2（需在库表插入对应行，不在仓库 sql 中提供）
 */

function ingestV2EnvOverride(): boolean | undefined {
  const v = process.env.INGEST_V2 ?? process.env.NEXT_PUBLIC_INGEST_V2;
  if (v === 'false' || v === '0') return false;
  if (v === 'true' || v === '1') return true;
  return undefined;
}

export function isIngestV2DevDefaultOn(): boolean {
  return (
    process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEV_MODE === 'true'
  );
}

/** 浏览器与服务端共享：QuickInput 单行是否走 POST /api/v2/inputs */
export function resolveIngestV2ForClient(): boolean {
  const o = ingestV2EnvOverride();
  if (o !== undefined) return o;
  return isIngestV2DevDefaultOn();
}

/** API 路由：是否允许创建 Input / import 等 ingest 入口 */
export async function resolveIngestV2ForServer(userId: string): Promise<boolean> {
  const o = ingestV2EnvOverride();
  if (o !== undefined) return o;
  if (isIngestV2DevDefaultOn()) return true;
  const { isFeatureEnabled } = await import('@/lib/feature-flags');
  return isFeatureEnabled('ingest_v2', userId);
}
