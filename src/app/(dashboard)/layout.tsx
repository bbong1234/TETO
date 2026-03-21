'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppSidebar from "@/components/layout/app-sidebar";
import MobileTopbar from "@/components/layout/mobile-topbar";
import { getCurrentUser, isDevMode } from '@/lib/auth/get-current-user-id';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const devMode = isDevMode();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (devMode) {
          // 开发模式下直接通过
          setUser({ isDevMode: true });
          setLoading(false);
          return;
        }

        const currentUser = await getCurrentUser();
        setUser(currentUser);
        setLoading(false);
      } catch (error) {
        console.error('认证检查失败:', error);
        // 未登录，重定向到登录页
        router.push('/login');
      }
    };

    checkAuth();
  }, [router, devMode]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <AppSidebar user={user} />
      <div className="flex min-h-screen flex-1 flex-col">
        <MobileTopbar user={user} />
        <main className="flex-1 bg-slate-100">
          {children}
        </main>
      </div>
    </div>
  );
}