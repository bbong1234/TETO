'use client';

import { createClient } from '@/lib/supabase/client';
import { isClientDevMode } from '@/lib/db/runtime-mode';

const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000001';

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
  if (isClientDevMode()) {
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
  return isClientDevMode();
}

export function getDevUserId(): string {
  return DEV_USER_ID;
}
