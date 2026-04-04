import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';

interface ImportRecord {
  date: string;
  taskId: string;
  valueBoolean: boolean | null;
  valueNumber: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { records, overrideConflicts = false } = body as { records: ImportRecord[]; overrideConflicts?: boolean };

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: '没有数据可导入' }, { status: 400 });
    }

    const supabase = await createClient();

    let success = 0;
    let skipped = 0;
    let updated = 0;

    for (const record of records) {
      const data = {
        user_id: userId,
        task_id: record.taskId,
        record_date: record.date,
        value_boolean: record.valueBoolean,
        value_number: record.valueNumber,
      };

      // 检查是否存在冲突
      const { data: existingRecord } = await supabase
        .from('task_daily_records')
        .select('id')
        .eq('user_id', userId)
        .eq('task_id', record.taskId)
        .eq('record_date', record.date)
        .single();

      if (existingRecord) {
        if (overrideConflicts) {
          // 覆盖现有记录
          const { error } = await supabase
            .from('task_daily_records')
            .update({
              value_boolean: record.valueBoolean,
              value_number: record.valueNumber,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingRecord.id)
            .eq('user_id', userId);

          if (!error) {
            updated++;
          } else {
            console.error('更新记录失败:', error);
            skipped++;
          }
        } else {
          // 跳过冲突记录
          skipped++;
        }
      } else {
        // 插入新记录
        const { error } = await supabase
          .from('task_daily_records')
          .insert(data);

        if (!error) {
          success++;
        } else {
          console.error('插入记录失败:', error);
          skipped++;
        }
      }
    }

    return NextResponse.json({
      success,
      skipped,
      updated,
      total: records.length,
    });
  } catch (error) {
    console.error('导入失败:', error);
    return NextResponse.json({ error: '导入失败' }, { status: 500 });
  }
}
