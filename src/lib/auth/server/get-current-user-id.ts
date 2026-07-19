import { createClient } from '@/lib/supabase/server';
import { isLocalPostgresMode } from '@/lib/db/runtime-mode';
import { createComponentLogger } from '@/lib/observability/logger';

const log = createComponentLogger('auth-server');

const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000001';

export interface CurrentUser {
  id: string;
  email?: string | null;
  isDevMode: boolean;
}

export async function getCurrentUserId(): Promise<string> {
  if (isLocalPostgresMode()) {
    log.info('本地 Postgres 开发模式，使用 DEV_USER_ID', { details: { DEV_USER_ID } });
    return DEV_USER_ID;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    const err = error as { message?: string; code?: string; status?: number };
    log.error('获取用户失败', { details: { message: err.message, code: err.code, status: err.status } });
    throw new Error('获取用户信息失败');
  }

  if (!data.user) {
    log.info('用户未登录');
    throw new Error('请先登录');
  }

  log.info('当前登录用户', { details: { userId: data.user.id } });
  return data.user.id;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  if (isLocalPostgresMode()) {
    log.info('本地 Postgres 开发模式，返回开发用户');
    return {
      id: DEV_USER_ID,
      email: 'dev@teto.local',
      isDevMode: true,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    const err = error as { message?: string; code?: string; status?: number };
    log.error('获取用户失败', { details: { message: err.message, code: err.code, status: err.status } });
    throw new Error('获取用户信息失败');
  }

  if (!data.user) {
    log.info('用户未登录');
    throw new Error('请先登录');
  }

  log.info('当前登录用户', { details: { id: data.user.id, email: data.user.email } });

  return {
    id: data.user.id,
    email: data.user.email,
    isDevMode: false,
  };
}

export function isDevMode(): boolean {
  return isLocalPostgresMode();
}

export function getDevUserId(): string {
  return DEV_USER_ID;
}
