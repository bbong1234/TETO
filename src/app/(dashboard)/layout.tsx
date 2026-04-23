'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppSidebar from "@/components/layout/app-sidebar";
import MobileTopbar from "@/components/layout/mobile-topbar";
import { getCurrentUser, isDevMode } from '@/lib/auth/get-current-user-id';

// 将 devMode 定义在组件外部，避免每次渲染都重新计算
const devMode = isDevMode();

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // 从 localStorage 加载侧边栏状态（仅在浏览器环境中）
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('sidebarCollapsed');
      return savedState ? JSON.parse(savedState) : false;
    }
    return false;
  });

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
  }, []); // 移除 router 依赖，避免不必要的重新渲染

  // 保存侧边栏状态到 localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
    }
  }, [sidebarCollapsed]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* 桌面端侧边栏 - 移动端隐藏 */}
      <div className="hidden lg:block">
        <AppSidebar 
          user={user} 
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>
      {/* 主内容区域 - 移动端无左边距，桌面端根据侧边栏状态调整左边距 */}
      <div className={[
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        sidebarCollapsed ? "lg:ml-20" : "lg:ml-72"
      ].join(" ")}>
        <MobileTopbar user={user} />
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-100">
            {children}
        </main>
      </div>
    </div>
  );
}
