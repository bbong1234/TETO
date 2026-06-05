'use client';

import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, ListChecks, BarChart3, MoreHorizontal } from 'lucide-react';
import { useEffect, useState, useTransition, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  getMobileTabRoot,
  MOBILE_TAB_ROOTS,
  type MobileTabRoot,
} from '@/components/layout/mobile-tab-routes';

const primaryNavItems: { label: string; href: MobileTabRoot; icon: typeof BookOpen }[] = [
  { label: '记录', href: '/records', icon: BookOpen },
  { label: '事项', href: '/items', icon: ListChecks },
  { label: '洞察', href: '/insights', icon: BarChart3 },
];

const moreNavItems = [{ label: '诊断', href: '/debug' }];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const moreActive = moreNavItems.some((item) => isActivePath(pathname, item.href));

  useEffect(() => {
    for (const href of MOBILE_TAB_ROOTS) {
      router.prefetch(href);
    }
  }, [router]);

  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending, pathname]);

  const navigateTab = (e: MouseEvent, href: MobileTabRoot) => {
    e.preventDefault();
    if (getMobileTabRoot(pathname) === href) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          aria-label="关闭菜单"
          onClick={() => setMoreOpen(false)}
        />
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-teto-neutral-800 bg-teto-neutral-900/95 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {moreOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-1 px-3">
            <div className="rounded-2xl border border-teto-neutral-700 bg-teto-neutral-900 p-2 shadow-2xl">
              {moreNavItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={[
                      'flex min-h-11 items-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'text-teto-neutral-300 hover:bg-teto-neutral-800 hover:text-white',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="mx-auto flex h-14 max-w-lg items-stretch justify-around px-2">
          {primaryNavItems.map((item) => {
            const active =
              pendingHref === item.href ||
              (pendingHref === null && isActivePath(pathname, item.href));
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => navigateTab(e, item.href)}
                className={[
                  'flex min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors duration-150',
                  active ? 'text-blue-400' : 'text-teto-neutral-400 active:text-white',
                  isPending && pendingHref === item.href ? 'opacity-80' : '',
                ].join(' ')}
              >
                <Icon className={['h-5 w-5', active ? 'stroke-[2.5]' : 'stroke-2'].join(' ')} />
                <span className={['text-[10px] font-medium', active ? 'text-blue-300' : ''].join(' ')}>
                  {item.label}
                </span>
              </a>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={[
              'flex min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors duration-150',
              moreActive || moreOpen ? 'text-blue-400' : 'text-teto-neutral-400 active:text-white',
            ].join(' ')}
            aria-label="更多"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">更多</span>
          </button>
        </div>
      </nav>
    </>
  );
}
