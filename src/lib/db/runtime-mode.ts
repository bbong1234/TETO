/**
 * 运行时数据库/认证模式：
 * - 本地开发：DEV_MODE + DATABASE_URL → 本机 PostgreSQL + 固定 DEV 用户
 * - 生产：Supabase Postgres + Supabase Auth（Vercel 上不配 DATABASE_URL / DEV_MODE）
 */

/** 服务端：本地 Postgres 直连 + 跳过真实登录 */
export function isLocalPostgresMode(): boolean {
  let devMode = process.env.DEV_MODE === 'true';
  if (devMode && process.env.NODE_ENV === 'production') {
    devMode = false;
  }
  return devMode && Boolean(process.env.DATABASE_URL);
}

/** 浏览器：本地开发模式（与 NEXT_PUBLIC_DEV_MODE 一致，生产构建强制关闭） */
export function isClientDevMode(): boolean {
  let devMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  if (devMode && process.env.NODE_ENV === 'production') {
    devMode = false;
  }
  return devMode;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

export function assertSupabaseConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new Error(
      '缺少 Supabase 配置。请在环境变量中设置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
}
