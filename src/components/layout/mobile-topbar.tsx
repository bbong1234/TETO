'use client';

import { usePathname } from 'next/navigation';

interface MobileTopbarProps {
  user?: { isDevMode?: boolean; email?: string } | null;
}

const pageTitles: Record<string, string> = {
  '/records': '记录',
  '/items': '事项',
  '/review': '复盘',
  '/insights': '洞察',
  '/goals': '目标',
  '/wallet': '钱包',
  '/debug': '诊断',
};

function resolvePageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith('/items/')) return '事项详情';
  if (pathname.startsWith('/debug/')) return '诊断';
  return 'TETO';
}

export default function MobileTopbar({ user }: MobileTopbarProps) {
  const pathname = usePathname();
  const title = resolvePageTitle(pathname);

  return (
    <header
      className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-teto-neutral-800 bg-teto-neutral-900/95 px-4 backdrop-blur-xl lg:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex min-h-12 items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-xs font-bold text-white shadow-lg shadow-blue-500/20">
          T
        </div>
        <span className="text-base font-semibold text-white">{title}</span>
      </div>

      {user && (
        <div className="max-w-[40%] truncate text-right text-xs text-teto-neutral-400">
          {user.isDevMode ? '开发模式' : user.email || '已登录'}
        </div>
      )}
    </header>
  );
}
