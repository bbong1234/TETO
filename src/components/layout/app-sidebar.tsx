'use client';

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from '@/lib/supabase/client';
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  ListChecks, 
  BarChart3
} from 'lucide-react';

// 主导航
const navItems = [
  { label: "记录", href: "/records", icon: BookOpen },
  { label: "事项", href: "/items", icon: ListChecks },
  { label: "洞察", href: "/insights", icon: BarChart3 },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}

interface AppSidebarProps {
  user: any;
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function AppSidebar({ user, collapsed = false, onToggle }: AppSidebarProps) {
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <aside 
      className={[
        "fixed inset-y-0 left-0 z-20 shrink-0 border-r border-slate-800 bg-slate-900 text-slate-100 transition-all duration-300",
        collapsed ? "w-20" : "w-72"
      ].join(" ")}
    >
      {/* 顶部 Logo 区域 */}
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-lg font-bold text-white shadow-lg shadow-blue-500/20">
              T
            </div>
            {!collapsed && (
              <div>
                <p className="text-2xl font-bold tracking-tight">TETO</p>
                <p className="text-sm text-slate-400">个人效率系统</p>
              </div>
            )}
          </div>
          {/* 收起/展开按钮 */}
          {onToggle && (
            <button
              onClick={onToggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* 导航区域 */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {/* 主导航区 */}
        <div className="mb-6">
          {!collapsed && (
            <p className="mb-3 px-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              主导航
            </p>
          )}
          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              const IconComponent = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group flex items-center rounded-2xl px-3 py-3 text-sm font-medium transition-all",
                    collapsed ? "justify-center" : "",
                    active
                      ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  ].join(" ")}
                  title={collapsed ? item.label : undefined}
                >
                  <IconComponent className="h-5 w-5 shrink-0" />
                  {!collapsed && <span className="truncate ml-3">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>


      </div>

      {/* 底部信息区域 */}
      <div className="border-t border-slate-800 p-2">
        {user && !collapsed && (
          <div className="mb-2 rounded-xl bg-slate-800/80 p-2">
            <p className="text-xs font-medium text-slate-300">
              {user.isDevMode ? '开发模式' : user.email || '用户'}
            </p>
            <button
              onClick={handleLogout}
              className="mt-1 w-full rounded-lg bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600"
            >
              登出
            </button>
          </div>
        )}
        {!collapsed && (
          <div className="rounded-xl bg-slate-800/80 p-2">
            <p className="text-xs font-medium text-slate-300">TETO 1.4</p>
            <p className="mt-1 text-xs leading-4 text-slate-400">
              记录 / 事项 / 洞察
            </p>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-xs font-bold text-white">
              T
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
