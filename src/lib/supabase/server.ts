import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  
  // 在开发模式下使用服务端密钥，绕过行级安全策略
  // 在生产模式下使用匿名密钥，依赖认证会话
  const supabaseKey = DEV_MODE 
    ? process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! 
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
