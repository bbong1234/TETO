'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isDevMode } from '@/lib/auth/get-current-user-id';

type Mode = 'login' | 'register' | 'forgot';
type AuthMethod = 'password' | 'otp';

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return '邮箱或密码错误。若你之前用验证码注册，请切换到「验证码登录」，或通过「忘记密码」设置密码。';
  }
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

function redirectAfterAuth() {
  window.location.href = '/records';
}

const AUTH_UI_VERSION = 'password-v3';
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
  const searchParams = useSearchParams();
  const devMode = isDevMode();

  const initialMode = useMemo<Mode>(() => {
    const mode = searchParams.get('mode');
    return mode === 'register' || mode === 'forgot' ? mode : 'login';
  }, [searchParams]);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [otpStep, setOtpStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
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
    setOtp('');
    setOtpStep('email');
    setAuthMethod('password');
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(mapAuthError(signInError.message));
      setLoading(false);
      return;
    }

    if (!data.session) {
      setError('登录失败，未获取到会话，请重试');
      setLoading(false);
      return;
    }

    redirectAfterAuth();
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (otpError) {
      setError(mapAuthError(otpError.message));
      setLoading(false);
      return;
    }

    setMessage('验证码已发送到您的邮箱，请查收');
    setOtpStep('code');
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (verifyError) {
      setError(mapAuthError(verifyError.message));
      setLoading(false);
      return;
    }

    if (!data.session) {
      setError('验证失败，未获取到会话，请重试');
      setLoading(false);
      return;
    }

    redirectAfterAuth();
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
      redirectAfterAuth();
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
      ? authMethod === 'password'
        ? '使用邮箱和密码登录'
        : otpStep === 'email'
          ? '输入邮箱接收验证码（适合旧账号）'
          : '输入邮箱中的 6 位验证码'
      : mode === 'register'
        ? '注册后可长期使用密码登录'
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

        {mode === 'login' && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('password');
                resetFeedback();
                setOtpStep('email');
              }}
              className={[
                'rounded-lg px-3 py-2 text-xs font-medium transition',
                authMethod === 'password' ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400 hover:text-white',
              ].join(' ')}
            >
              密码登录
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod('otp');
                resetFeedback();
                setOtpStep('email');
              }}
              className={[
                'rounded-lg px-3 py-2 text-xs font-medium transition',
                authMethod === 'otp' ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400 hover:text-white',
              ].join(' ')}
            >
              验证码登录
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

          {mode === 'login' && authMethod === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
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

          {mode === 'login' && authMethod === 'otp' && otpStep === 'email' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <Field label="邮箱" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? '发送中…' : '发送验证码'}
              </button>
            </form>
          )}

          {mode === 'login' && authMethod === 'otp' && otpStep === 'code' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Field
                label="验证码"
                type="text"
                value={otp}
                onChange={setOtp}
                autoComplete="one-time-code"
                placeholder="6 位验证码"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? '验证中…' : '登录'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpStep('email');
                  resetFeedback();
                }}
                className="w-full text-sm text-slate-400 transition hover:text-blue-300"
              >
                返回重新输入邮箱
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
          旧账号若无密码，请用「验证码登录」；新用户建议注册后使用密码登录。
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
  type: 'email' | 'password' | 'text';
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
        maxLength={type === 'text' && label === '验证码' ? 6 : undefined}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
      />
    </div>
  );
}
