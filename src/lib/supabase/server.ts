import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerPostgresClient } from '@/lib/postgres/client-server';
import {
  assertSupabaseConfigured,
  isLocalPostgresMode,
} from '@/lib/db/runtime-mode';
import { createComponentLogger } from '@/lib/observability/logger';

const log = createComponentLogger('supabase-server');

if (isLocalPostgresMode()) {
  log.info('本地 PostgreSQL 直连模式（DEV_MODE + DATABASE_URL）');
} else if (!isLocalPostgresMode() && process.env.NODE_ENV !== 'production') {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    log.warn('未配置 Supabase；非 DEV_MODE 时 API 将需要 Supabase 环境变量');
  }
}

export async function createClient() {
  if (isLocalPostgresMode()) {
    return createServerPostgresClient();
  }

  assertSupabaseConfigured();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            /* Server Component 中 set 可能不可用，middleware 会刷新 session */
          }
        },
      },
    }
  );
}

export type ServerDbClient = Awaited<ReturnType<typeof createClient>>;
