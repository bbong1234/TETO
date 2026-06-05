'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-is-mobile';
import {
  getMobileTabRoot,
  MOBILE_TAB_ROOTS,
  type MobileTabRoot,
} from '@/components/layout/mobile-tab-routes';
import {
  RecordsDayContentSkeleton,
  ItemsDesktopSkeleton,
  InsightsPageSkeleton,
} from '@/components/ui/PageSkeletons';

const RecordsClient = dynamic(
  () => import('@/app/(dashboard)/records/RecordsClient'),
  { loading: () => <RecordsDayContentSkeleton /> }
);
const ItemsClient = dynamic(
  () => import('@/app/(dashboard)/items/ItemsClient'),
  { loading: () => <ItemsDesktopSkeleton /> }
);
const InsightsClient = dynamic(
  () => import('@/app/(dashboard)/insights/InsightsClient'),
  { loading: () => <InsightsPageSkeleton /> }
);

const TAB_PANEL: Record<
  MobileTabRoot,
  { component: React.ComponentType; skeleton: ReactNode }
> = {
  '/records': { component: RecordsClient, skeleton: <RecordsDayContentSkeleton /> },
  '/items': { component: ItemsClient, skeleton: <ItemsDesktopSkeleton /> },
  '/insights': { component: InsightsClient, skeleton: <InsightsPageSkeleton /> },
};

interface MobileTabShellProps {
  children: ReactNode;
}

/**
 * 移动端底部 Tab：已访问过的主模块保持挂载，切换时只改可见性，避免整页重载卡顿。
 * 桌面端与子路由（如 /items/[id]）仍走默认 children 渲染。
 */
export default function MobileTabShell({ children }: MobileTabShellProps) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const activeTab = getMobileTabRoot(pathname);

  const [mountedTabs, setMountedTabs] = useState<Set<MobileTabRoot>>(() => {
    const initial = new Set<MobileTabRoot>();
    if (activeTab) initial.add(activeTab);
    return initial;
  });

  useEffect(() => {
    if (!activeTab) return;
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  /** 首次进入移动端后，空闲时预挂载其余 Tab，后续切换更丝滑 */
  useEffect(() => {
    if (!isMobile) return;
    const idle =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 800);
    const cancel =
      typeof cancelIdleCallback !== 'undefined'
        ? cancelIdleCallback
        : (id: number) => window.clearTimeout(id);

    const id = idle(() => {
      setMountedTabs((prev) => {
        const next = new Set(prev);
        for (const tab of MOBILE_TAB_ROOTS) next.add(tab);
        return next.size === prev.size ? prev : next;
      });
    });
    return () => cancel(id as number);
  }, [isMobile]);

  if (!isMobile || !activeTab) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex flex-1 flex-col min-h-0 overflow-hidden">
      {MOBILE_TAB_ROOTS.map((tab) => {
        if (!mountedTabs.has(tab)) return null;
        const { component: Panel, skeleton } = TAB_PANEL[tab];
        const isActive = tab === activeTab;
        return (
          <div
            key={tab}
            className={[
              'absolute inset-0 flex flex-col min-h-0 overflow-hidden',
              'transition-opacity duration-150 ease-out',
              isActive
                ? 'opacity-100 z-10 pointer-events-auto'
                : 'opacity-0 z-0 pointer-events-none',
            ].join(' ')}
            aria-hidden={!isActive}
          >
            <Suspense fallback={skeleton}>
              <Panel />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}
