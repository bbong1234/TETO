import { NextResponse, type NextRequest } from 'next/server';

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

export async function middleware(request: NextRequest) {
  // 开发模式下直接放行，不检查认证
  if (DEV_MODE) {
    console.log('[middleware] 开发模式，跳过认证检查');
    return NextResponse.next();
  }

  // 正式模式下的认证检查逻辑（暂时保留，后续可以完善）
  // 目前先放行，等认证流程稳定后再启用
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/',
    '/dashboard/:path*',
    '/daily-record/:path*',
    '/diary-review/:path*',
    '/projects/:path*',
    '/stats/:path*',
  ],
};
