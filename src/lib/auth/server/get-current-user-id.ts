import { createClient } from '@/lib/supabase/server';

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000001';

export interface CurrentUser {
  id: string;
  email?: string | null;
  isDevMode: boolean;
}

export async function getCurrentUserId(): Promise<string> {
  if (DEV_MODE) {
    console.log('[getCurrentUserId] 开发模式，使用 DEV_USER_ID:', DEV_USER_ID);
    return DEV_USER_ID;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[getCurrentUserId] 获取用户失败:', {
      message: error.message,
      code: error.code,
      status: error.status,
    });
    throw new Error('获取用户信息失败');
  }

  if (!data.user) {
    console.log('[getCurrentUserId] 用户未登录');
    throw new Error('请先登录');
  }

  console.log('[getCurrentUserId] 当前登录用户 ID:', data.user.id);
  return data.user.id;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  if (DEV_MODE) {
    console.log('[getCurrentUser] 开发模式，返回开发用户');
    return {
      id: DEV_USER_ID,
      email: 'dev@teto.local',
      isDevMode: true,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[getCurrentUser] 获取用户失败:', {
      message: error.message,
      code: error.code,
      status: error.status,
    });
    throw new Error('获取用户信息失败');
  }

  if (!data.user) {
    console.log('[getCurrentUser] 用户未登录');
    throw new Error('请先登录');
  }

  console.log('[getCurrentUser] 当前登录用户:', {
    id: data.user.id,
    email: data.user.email,
  });

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
