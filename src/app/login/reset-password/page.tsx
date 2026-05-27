'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return '邮箱或密码错误';
  if (lower.includes('email not confirmed')) return '账号尚未验证，请先到邮箱点击确认链接';
  if (lower.includes('user already registered')) return '该邮箱已注册，请直接登录';
  if (lower.includes('password should be at least')) return '密码至少 6 位';
  if (lower.includes('unable to validate email')) return '邮箱格式无效';
  if (lower.includes('signup is disabled')) return '注册已关闭，请联系管理员';
  return message;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(mapAuthError(updateError.message));
      setLoading(false);
      return;
    }

    router.replace('/records');
    router.refresh();
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-xl font-bold text-white shadow-lg shadow-blue-500/30">
            T
          </div>
          <h1 className="text-2xl font-bold text-white">设置新密码</h1>
          <p className="mt-2 text-sm text-slate-400">请输入新的登录密码</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl backdrop-blur">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">新密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none ring-blue-500/0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                placeholder="至少 6 位"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">确认密码</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none ring-blue-500/0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                placeholder="再次输入密码"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-indigo-400 disabled:opacity-50"
            >
              {loading ? '保存中…' : '保存并进入 TETO'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              返回登录
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
