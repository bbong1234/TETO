"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from '@/lib/supabase/client';

const primaryNavItems = [
  { label: "仪表盘", href: "/dashboard" },
  { label: "每日记录", href: "/daily-record" },
  { label: "日记复盘", href: "/diary-review" },
  { label: "项目管理", href: "/projects" },
  { label: "统计分析", href: "/stats" },
];

const secondaryNavItems = [{ label: "返回首页", href: "/" }];

function isActivePath(pathname: string, href: string) {
  return pathname === href;
}

interface AppSidebarProps {
  user: any;
}

export default function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <aside className="flex min-h-screen w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-100">
      <div className="border-b border-slate-800 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500 text-lg font-bold text-white shadow-lg shadow-blue-500/20">
            T
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">TETO</p>
            <p className="text-sm text-slate-400">个人效率系统</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mb-6">
          <p className="mb-3 px-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            核心模块
          </p>
          <nav className="space-y-2">
            {primaryNavItems.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                    active
                      ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  ].join(" ")}
                >
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <p className="mb-3 px-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            系统入口
          </p>
          <nav className="space-y-2">
            {secondaryNavItems.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                    active
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white",
                  ].join(" ")}
                >
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="border-t border-slate-800 p-4">
        {user && (
          <div className="mb-4 rounded-2xl bg-slate-800/80 p-4">
            <p className="text-sm font-semibold text-white">
              {user.isDevMode ? '开发模式' : user.email || '用户'}
            </p>
            <button
              onClick={handleLogout}
              className="mt-2 w-full rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-600"
            >
              登出
            </button>
          </div>
        )}
        <div className="rounded-2xl bg-slate-800/80 p-4">
          <p className="text-sm font-semibold text-white">TETO 1.0</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            当前阶段：静态骨架 + 工作台视觉整理
          </p>
        </div>
      </div>
    </aside>
  );
}