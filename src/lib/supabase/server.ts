import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createComponentLogger } from '@/lib/observability/logger';

const log = createComponentLogger('supabase-server');

// 使用服务端环境变量（非 NEXT_PUBLIC_），避免在生产构建中泄露 service_role 密钥
let DEV_MODE = process.env.DEV_MODE === 'true';

if (DEV_MODE && process.env.NODE_ENV === 'production') {
  log.error('DEV_MODE 在生产环境已自动禁用，请从 .env 中移除 DEV_MODE=true');
  DEV_MODE = false;
}
if (DEV_MODE) {
  log.warn('服务端使用 SERVICE_ROLE_KEY，绕过 RLS，仅限本地开发');
}

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  
  // DEV_MODE 使用服务端密钥绕过 RLS（仅本地开发）
  // 生产环境使用匿名密钥，依赖 Supabase Auth 会话 + RLS 保护
  const supabaseKey = DEV_MODE
    ? process.env.SUPABASE_SERVICE_ROLE_KEY!
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(
    supabaseUrl,
    supabaseKey,
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
          } catch {}
        },
      },
    }
  );
}
