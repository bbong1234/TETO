const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID || '00000000-0000-0000-0000-000000000001';

function fakeSession() {
  const user = {
    id: DEV_USER_ID,
    email: 'dev@teto.local',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date(0).toISOString(),
  };
  return {
    access_token: 'dev-local',
    refresh_token: 'dev-local',
    expires_in: 86400,
    token_type: 'bearer' as const,
    user,
  };
}

function devAuth() {
  const session = fakeSession();
  const authError = (message: string) => ({ message, name: 'AuthError', status: 400 });

  return {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session.user }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (_cb: unknown) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    exchangeCodeForSession: async (_code: string) => ({
      error: authError('本地 PostgreSQL 模式未启用 Supabase 登录'),
    }),
    signInWithPassword: async (_opts: unknown) => ({
      data: { session: null, user: null },
      error: authError('本地 PostgreSQL 模式未启用 Supabase 登录'),
    }),
    signInWithOtp: async (_opts: unknown) => ({
      error: authError('本地 PostgreSQL 模式未启用 Supabase 登录'),
    }),
    verifyOtp: async (_opts: unknown) => ({
      data: { session: null, user: null },
      error: authError('本地 PostgreSQL 模式未启用 Supabase 登录'),
    }),
    signUp: async (_opts: unknown) => ({
      data: { session: null, user: null },
      error: authError('本地 PostgreSQL 模式未启用 Supabase 登录'),
    }),
    resetPasswordForEmail: async (_email: string, _opts?: unknown) => ({
      error: authError('本地 PostgreSQL 模式未启用 Supabase 登录'),
    }),
    updateUser: async (_opts: unknown) => ({
      error: authError('本地 PostgreSQL 模式未启用 Supabase 登录'),
    }),
  };
}

/** 浏览器端桩：仅 DEV 认证，不连接 Postgres */
export function createBrowserPostgresClient() {
  return {
    from(_table: string) {
      throw new Error('浏览器不能直接访问 PostgreSQL，请通过 API 路由');
    },
    rpc() {
      throw new Error('浏览器不能直接访问 PostgreSQL，请通过 API 路由');
    },
    auth: devAuth(),
  };
}

export type BrowserPostgresClient = ReturnType<typeof createBrowserPostgresClient>;
