/** 底部导航三个主 Tab 的根路径（不含详情子路由） */
export const MOBILE_TAB_ROOTS = ['/records', '/items', '/insights'] as const;

export type MobileTabRoot = (typeof MOBILE_TAB_ROOTS)[number];

export function getMobileTabRoot(pathname: string): MobileTabRoot | null {
  const base = pathname.split('?')[0];
  if (base === '/records') return '/records';
  if (base === '/items') return '/items';
  if (base === '/insights') return '/insights';
  return null;
}

export function isMobileTabRoot(pathname: string): pathname is MobileTabRoot {
  return getMobileTabRoot(pathname) !== null;
}
