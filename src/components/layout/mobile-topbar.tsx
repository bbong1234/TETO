'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Menu, 
  X, 
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

interface MobileTopbarProps {
  user?: any;
}

export default function MobileTopbar({ user }: MobileTopbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const handleNavClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* 移动端顶部导航栏 */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-sm font-bold text-white shadow-lg shadow-blue-500/20">
            T
          </div>
          <span className="text-lg font-bold text-white">TETO</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          aria-label="打开菜单"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* 移动端抽屉式导航 */}
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setIsOpen(false)}
          />
          {/* 抽屉导航 */}
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 shadow-2xl lg:hidden">
            <div className="flex h-full flex-col">
              {/* 抽屉头部 */}
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-sm font-bold text-white shadow-lg shadow-blue-500/20">
                    T
                  </div>
                  <span className="text-lg font-bold text-white">TETO</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                  aria-label="关闭菜单"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 导航链接 */}
              <nav className="flex-1 overflow-y-auto px-4 py-4">
                {/* 主导航区 */}
                <div className="mb-4">
                  <p className="mb-2 px-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                    主导航
                  </p>
                  <div className="space-y-1">
                    {navItems.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(item.href + '/');
                      const IconComponent = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={handleNavClick}
                          className={[
                            "flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                            active
                              ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/20"
                              : "text-slate-300 hover:bg-slate-800 hover:text-white",
                          ].join(" ")}
                        >
                          <IconComponent className="h-4 w-4 shrink-0" />
                          <span className="ml-3">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>


              </nav>

              {/* 底部信息 */}
              <div className="border-t border-slate-800 p-4">
                {user && (
                  <div className="mb-3 rounded-xl bg-slate-800/80 p-3">
                    <p className="text-sm font-semibold text-white">
                      {user.isDevMode ? '开发模式' : user.email || '用户'}
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-slate-800/80 p-3">
                  <p className="text-sm font-semibold text-white">TETO 1.3</p>
                  <p className="mt-1 text-xs text-slate-400">
                    记录 / 事项 / 洞察
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
