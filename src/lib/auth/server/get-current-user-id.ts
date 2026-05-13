import { createClient } from '@/lib/supabase/server';
import { createComponentLogger } from '@/lib/observability/logger';

const log = createComponentLogger('auth-server');

// 服务端使用 DEV_MODE（非 NEXT_PUBLIC_），与 server.ts 保持一致
// 客户端模块 src/lib/auth/get-current-user-id.ts 使用 NEXT_PUBLIC_ 前缀
let DEV_MODE = process.env.DEV_MODE === 'true';
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000001';

if (DEV_MODE && process.env.NODE_ENV === 'production') {
  log.error('DEV_MODE 在生产环境已自动禁用，请从 .env 中移除 DEV_MODE=true');
  DEV_MODE = false;
}

export interface CurrentUser {
  id: string;
  email?: string | null;
  isDevMode: boolean;
}

export async function getCurrentUserId(): Promise<string> {
  if (DEV_MODE) {
    log.info('开发模式，使用 DEV_USER_ID', { details: { DEV_USER_ID } });
    return DEV_USER_ID;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    log.error('获取用户失败', { details: { message: error.message, code: error.code, status: error.status } });
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
  if (DEV_MODE) {
    log.info('开发模式，返回开发用户');
    return {
      id: DEV_USER_ID,
      email: 'dev@teto.local',
      isDevMode: true,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    log.error('获取用户失败', { details: { message: error.message, code: error.code, status: error.status } });
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
  return DEV_MODE;
}

export function getDevUserId(): string {
  return DEV_USER_ID;
}
