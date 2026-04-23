'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isDevMode } from '@/lib/auth/get-current-user-id';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const devMode = isDevMode();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    
    console.log('[login] 发送 OTP 到:', email);
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error('[login] 发送 OTP 失败:', {
        message: error.message,
        code: error.code,
        status: error.status,
      });
      setError(error.message);
    } else {
      console.log('[login] OTP 发送成功');
      setMessage('验证码已发送到您的邮箱，请查收');
      setStep('otp');
    }

    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    
    console.log('[login] 验证 OTP:', { email, otp });
    
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (error) {
      console.error('[login] 验证 OTP 失败:', {
        message: error.message,
        code: error.code,
        status: error.status,
      });
      setError(error.message);
    } else {
      console.log('[login] 登录成功, user:', data.user?.id);
      console.log('[login] session:', data.session ? '存在' : '不存在');
      
      // 验证 session 是否正确设置
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[login] 验证 session:', sessionData.session ? '已设置' : '未设置');
      
      // 跳转到今日记录
      window.location.href = '/records';
    }

    setLoading(false);
  };

  if (devMode) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border p-6 shadow-sm">
          <h1 className="mb-2 text-2xl font-bold">TETO 开发模式</h1>
          <p className="mb-4 text-sm text-gray-600">
            当前为开发模式，无需登录即可直接使用系统。
          </p>
          <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
            <p className="font-medium">开发模式说明：</p>
            <ul className="mt-2 list-disc pl-4 space-y-1">
              <li>使用测试用户 ID 进行数据操作</li>
              <li>无需邮箱验证</li>
              <li>所有页面可直接访问</li>
            </ul>
          </div>
          <a
            href="/records"
            className="block w-full rounded bg-black px-4 py-2 text-center text-white hover:bg-gray-800"
          >
            进入记录
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold">TETO 登录</h1>
        <p className="mb-4 text-sm text-gray-600">
          {step === 'email' 
            ? '输入邮箱接收验证码' 
            : '输入邮箱中的 6 位验证码'}
        </p>

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded bg-green-50 p-3 text-sm text-green-600">
            {message}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                邮箱地址
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-black px-4 py-2 text-center text-white disabled:opacity-50"
            >
              {loading ? '发送中...' : '发送验证码'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                验证码
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                maxLength={6}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-black px-4 py-2 text-center text-white disabled:opacity-50"
            >
              {loading ? '验证中...' : '登录'}
            </button>
            <button
              type="button"
              onClick={() => setStep('email')}
              className="w-full rounded border border-gray-300 px-4 py-2 text-center text-sm text-gray-600"
            >
              返回重新输入邮箱
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
