'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createBrowserPostgresClient } from '@/lib/postgres/client-browser';
import { assertSupabaseConfigured, isClientDevMode } from '@/lib/db/runtime-mode';

/** 浏览器端：dev 用认证桩；生产用 Supabase Auth（数据仍经 API） */
export function createClient() {
  if (isClientDevMode()) {
    return createBrowserPostgresClient();
  }

  assertSupabaseConfigured();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
