'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isDevMode } from '@/lib/auth/get-current-user-id';

type Mode = 'login' | 'register' | 'forgot';

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return '邮箱或密码错误';
  if (lower.includes('email not confirmed')) return '账号尚未验证，请先到邮箱点击确认链接';
  if (lower.includes('user already registered')) return '该邮箱已注册，请直接登录';
  if (lower.includes('password should be at least')) return '密码至少 6 位';
  if (lower.includes('unable to validate email')) return '邮箱格式无效';
  if (lower.includes('signup is disabled')) return '注册已关闭，请联系管理员';
  if (lower.includes('rate limit')) return '操作太频繁，请稍后再试';
  return message;
}

function authCallbackUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`;
}

const AUTH_UI_VERSION = 'password-v2';
const BUILD_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const devMode = isDevMode();

  const initialMode = useMemo<Mode>(() => {
    const mode = searchParams.get('mode');
    return mode === 'register' || mode === 'forgot' ? mode : 'login';
  }, [searchParams]);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const authError = searchParams.get('error');
    if (authError === 'auth_callback') return '登录链接已失效，请重新操作';
    if (authError === 'missing_code') return '登录验证失败，请重试';
    return null;
  });
  const [message, setMessage] = useState<string | null>(null);

  const resetFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetFeedback();
    setPassword('');
    setConfirmPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(mapAuthError(signInError.message));
      setLoading(false);
      return;
    }

    router.replace('/records');
    router.refresh();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authCallbackUrl('/records'),
      },
    });

    if (signUpError) {
      setError(mapAuthError(signUpError.message));
      setLoading(false);
      return;
    }

    if (data.session) {
      router.replace('/records');
      router.refresh();
      return;
    }

    setMessage('注册成功。若 Supabase 开启了邮箱确认，请先到邮箱点击确认链接；否则可直接登录。');
    switchMode('login');
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl('/login/reset-password'),
    });

    if (resetError) {
      setError(mapAuthError(resetError.message));
      setLoading(false);
      return;
    }

    setMessage('重置密码邮件已发送，请查收邮箱并点击链接设置新密码。');
    setLoading(false);
  };

  if (devMode) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
          <h1 className="mb-2 text-2xl font-bold text-white">TETO 开发模式</h1>
          <p className="mb-4 text-sm text-slate-400">当前为开发模式，无需登录即可直接使用。</p>
          <Link
            href="/records"
            className="block w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-center text-sm font-semibold text-white"
          >
            进入记录
          </Link>
        </div>
      </main>
    );
  }

  const title =
    mode === 'login' ? '登录 TETO' : mode === 'register' ? '创建账号' : '找回密码';
  const subtitle =
    mode === 'login'
      ? '使用邮箱和密码登录，无需每次收验证码'
      : mode === 'register'
        ? '注册后可长期使用，登录时不再发邮件'
        : '输入注册邮箱，我们会发送重置密码链接';

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-xl font-bold text-white shadow-lg shadow-blue-500/30">
            T
          </div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>

        {mode !== 'forgot' && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-900/60 p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={[
                'rounded-lg px-3 py-2 text-sm font-medium transition',
                mode === 'login' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white',
              ].join(' ')}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={[
                'rounded-lg px-3 py-2 text-sm font-medium transition',
                mode === 'register' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white',
              ].join(' ')}
            >
              注册
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl backdrop-blur">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {message}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <Field label="邮箱" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field
                label="密码"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? '登录中…' : '登录'}
              </button>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="w-full text-sm text-slate-400 transition hover:text-blue-300"
              >
                忘记密码？
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <Field label="邮箱" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field
                label="密码"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                placeholder="至少 6 位"
              />
              <Field
                label="确认密码"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                placeholder="再次输入密码"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? '注册中…' : '注册'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <Field label="注册邮箱" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? '发送中…' : '发送重置链接'}
              </button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-sm text-slate-400 transition hover:text-blue-300"
              >
                返回登录
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          账号仍使用邮箱作为唯一标识；改为密码登录后，日常打开 App 不再需要收验证码邮件。
        </p>
        <p className="mt-2 text-center text-[10px] text-slate-600">
          登录页版本 {AUTH_UI_VERSION} · {BUILD_SHA}
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string;
  type: 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
      />
    </div>
  );
}
