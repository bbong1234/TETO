import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createRecordLink, getLinksForRecord, deleteRecordLink } from '@/lib/db/record-links';
import type { RecordLinkType } from '@/types/teto';

const VALID_LINK_TYPES: RecordLinkType[] = ['completes', 'derived_from', 'postponed_from', 'related_to'];

/**
 * POST /api/v2/record-links
 * 创建记录关联
 * Body: { source_id: string; target_id: string; link_type: RecordLinkType }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const { source_id, target_id, link_type } = body as {
      source_id?: string;
      target_id?: string;
      link_type?: string;
    };

    if (!source_id || !target_id || !link_type) {
      return NextResponse.json({ error: 'source_id, target_id, link_type 均为必填' }, { status: 400 });
    }

    if (!VALID_LINK_TYPES.includes(link_type as RecordLinkType)) {
      return NextResponse.json({ error: `link_type 必须为: ${VALID_LINK_TYPES.join(', ')}` }, { status: 400 });
    }

    if (source_id === target_id) {
      return NextResponse.json({ error: '不能关联自身' }, { status: 400 });
    }

    const link = await createRecordLink(userId, {
      source_id,
      target_id,
      link_type: link_type as RecordLinkType,
    });

    return NextResponse.json({ data: link }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/v2/record-links?record_id=xxx
 * 获取某条记录的所有关联
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const record_id = searchParams.get('record_id');

    if (!record_id) {
      return NextResponse.json({ error: 'record_id 查询参数为必填' }, { status: 400 });
    }

    const links = await getLinksForRecord(userId, record_id);
    return NextResponse.json({ data: links });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/record-links?id=xxx
 * 删除一条记录关联
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id 查询参数为必填' }, { status: 400 });
    }

    await deleteRecordLink(userId, id);
    return NextResponse.json({ data: { id } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
