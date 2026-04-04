import { NextRequest, NextResponse } from 'next/server';
import { getUserPageConfig, savePageConfig } from '@/lib/db/page-configs';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const url = new URL(request.url);
    const pageKey = url.searchParams.get('page_key');

    if (!pageKey) {
      return NextResponse.json({ error: '缺少 page_key 参数' }, { status: 400 });
    }

    const config = await getUserPageConfig(userId, pageKey);
    return NextResponse.json(config);
  } catch (error) {
    console.error('获取页面配置失败:', error);
    return NextResponse.json({ error: '获取页面配置失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { page_key, block_order, tab_order } = body;

    if (!page_key || (!block_order && !tab_order)) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    if (block_order && !Array.isArray(block_order)) {
      return NextResponse.json({ error: 'block_order 必须是数组' }, { status: 400 });
    }

    if (tab_order && !Array.isArray(tab_order)) {
      return NextResponse.json({ error: 'tab_order 必须是数组' }, { status: 400 });
    }

    const config = await savePageConfig({
      user_id: userId,
      page_key,
      block_order,
      tab_order,
    });

    if (!config) {
      return NextResponse.json({ error: '保存页面配置失败' }, { status: 500 });
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('保存页面配置失败:', error);
    return NextResponse.json({ error: '保存页面配置失败' }, { status: 500 });
  }
}
