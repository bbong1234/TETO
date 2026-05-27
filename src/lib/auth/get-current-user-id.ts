'use client';

import { createClient } from '@/lib/supabase/client';

let DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000001';

if (DEV_MODE && process.env.NODE_ENV === 'production') {
  console.error('[安全] NEXT_PUBLIC_DEV_MODE 在生产环境已自动禁用。请从 .env 中移除 NEXT_PUBLIC_DEV_MODE=true');
  DEV_MODE = false;
}
if (DEV_MODE) {
  console.warn('[DEV_MODE] 客户端认证已跳过。仅限本地开发。');
}

export interface CurrentUser {
  id: string;
  email?: string | null;
  isDevMode: boolean;
}

export async function getCurrentUserId(): Promise<string> {
  const user = await getCurrentUser();
  return user.id;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  if (DEV_MODE) {
    return {
      id: DEV_USER_ID,
      email: 'dev@teto.local',
      isDevMode: true,
    };
  }

  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;

  if (sessionUser) {
    return {
      id: sessionUser.id,
      email: sessionUser.email,
      isDevMode: false,
    };
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('请先登录');
  }

  return {
    id: data.user.id,
    email: data.user.email,
    isDevMode: false,
  };
}

export function isDevMode(): boolean {
  return DEV_MODE;
}

export function getDevUserId(): string {
  return DEV_USER_ID;
}
