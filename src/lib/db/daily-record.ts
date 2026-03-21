import type { DailyRecord, DailyRecordItem, DailyRecordWithItems, DailyRecordFormValues } from '@/types/daily-record';
import { RECORD_ITEMS } from '@/constants/record-items';
import { createClient } from '@/lib/supabase/client';

export async function getDailyRecordByDate(
  userId: string,
  recordDate: string
): Promise<DailyRecordWithItems | null> {
  console.log("[getDailyRecordByDate] 查询参数:", { userId, recordDate });
  const supabase = createClient();

  const { data: record, error: recordError } = await supabase
    .from('daily_records')
    .select('*')
    .eq('user_id', userId)
    .eq('record_date', recordDate)
    .maybeSingle();

  console.log("[getDailyRecordByDate] 主记录查询结果:", { record, recordError });

  if (recordError) {
    console.error("[getDailyRecordByDate] 主记录查询错误:", {
      message: recordError.message,
      code: recordError.code,
      details: recordError.details,
      hint: recordError.hint,
    });
    throw recordError;
  }

  if (!record) {
    console.log("[getDailyRecordByDate] 无记录, 返回 null");
    return null;
  }

  const { data: items, error: itemsError } = await supabase
    .from('daily_record_items')
    .select('*')
    .eq('daily_record_id', record.id)
    .order('sort_order', { ascending: true });

  console.log("[getDailyRecordByDate] 子项查询结果:", { items, itemsError });

  if (itemsError) {
    console.error("[getDailyRecordByDate] 子项查询错误:", {
      message: itemsError.message,
      code: itemsError.code,
      details: itemsError.details,
      hint: itemsError.hint,
    });
    throw itemsError;
  }

  return {
    ...record,
    items: items || [],
  };
}

export async function upsertDailyRecord(
  userId: string,
  values: DailyRecordFormValues
): Promise<DailyRecord> {
  console.log("[upsertDailyRecord] 开始, userId:", userId, "values:", values);
  const supabase = createClient();

  const { data: existingRecord, error: selectError } = await supabase
    .from('daily_records')
    .select('id')
    .eq('user_id', userId)
    .eq('record_date', values.recordDate)
    .maybeSingle();

  console.log("[upsertDailyRecord] 查询已有记录:", { existingRecord, selectError });

  if (selectError) {
    console.error("[upsertDailyRecord] 查询已有记录失败:", {
      message: selectError.message,
      code: selectError.code,
      details: selectError.details,
      hint: selectError.hint,
    });
    throw selectError;
  }

  if (existingRecord) {
    console.log("[upsertDailyRecord] 更新已有记录, id:", existingRecord.id);
    const { data, error } = await supabase
      .from('daily_records')
      .update({
        note: values.note || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingRecord.id)
      .select()
      .single();

    if (error) {
      console.error("[upsertDailyRecord] 更新失败:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    console.log("[upsertDailyRecord] 更新成功:", data);
    return data;
  } else {
    console.log("[upsertDailyRecord] 插入新记录");
    const { data, error } = await supabase
      .from('daily_records')
      .insert({
        user_id: userId,
        record_date: values.recordDate,
        note: values.note || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[upsertDailyRecord] 插入失败:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    console.log("[upsertDailyRecord] 插入成功:", data);
    return data;
  }
}

export async function upsertDailyRecordItems(
  dailyRecordId: string,
  values: DailyRecordFormValues
): Promise<DailyRecordItem[]> {
  console.log("[upsertDailyRecordItems] 开始, dailyRecordId:", dailyRecordId);
  const supabase = createClient();

  const { data: existingItems, error: selectError } = await supabase
    .from('daily_record_items')
    .select('id, item_key')
    .eq('daily_record_id', dailyRecordId);

  console.log("[upsertDailyRecordItems] 已有子项:", existingItems, "error:", selectError);

  if (selectError) {
    console.error("[upsertDailyRecordItems] 查询已有子项失败:", {
      message: selectError.message,
      code: selectError.code,
      details: selectError.details,
      hint: selectError.hint,
    });
    throw selectError;
  }

  const existingItemsMap = new Map(
    (existingItems || []).map((item) => [item.item_key, item.id])
  );

  const itemsToUpsert: Omit<DailyRecordItem, 'id' | 'created_at' | 'updated_at'>[] = [];

  RECORD_ITEMS.forEach((config, index) => {
    const value = values.items[config.key as keyof typeof values.items];
    if (value === undefined || value === null || value === '') {
      return;
    }

    const itemData: Omit<DailyRecordItem, 'id' | 'created_at' | 'updated_at'> = {
      daily_record_id: dailyRecordId,
      item_key: config.key,
      item_name: config.name,
      value_number: null,
      value_duration: null,
      value_time: null,
      value_text: null,
      unit: config.unit || null,
      sort_order: index,
    };

    if (config.type === 'number' && typeof value === 'number') {
      itemData.value_number = value;
    } else if (config.type === 'duration' && typeof value === 'number') {
      itemData.value_duration = value;
    } else if (config.type === 'time' && typeof value === 'string') {
      itemData.value_time = value;
    }

    console.log("[upsertDailyRecordItems] 准备保存子项:", itemData);
    itemsToUpsert.push(itemData);
  });

  console.log("[upsertDailyRecordItems] 共需处理", itemsToUpsert.length, "个子项");

  const results: DailyRecordItem[] = [];

  for (const itemData of itemsToUpsert) {
    const existingId = existingItemsMap.get(itemData.item_key);

    if (existingId) {
      console.log("[upsertDailyRecordItems] 更新子项, id:", existingId, "item_key:", itemData.item_key);
      const { data, error } = await supabase
        .from('daily_record_items')
        .update({
          value_number: itemData.value_number,
          value_duration: itemData.value_duration,
          value_time: itemData.value_time,
          value_text: itemData.value_text,
          sort_order: itemData.sort_order,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId)
        .select()
        .single();

      if (error) {
        console.error("[upsertDailyRecordItems] 更新子项失败:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      console.log("[upsertDailyRecordItems] 更新子项成功:", data);
      results.push(data);
    } else {
      console.log("[upsertDailyRecordItems] 插入新子项, item_key:", itemData.item_key);
      const { data, error } = await supabase
        .from('daily_record_items')
        .insert(itemData)
        .select()
        .single();

      if (error) {
        console.error("[upsertDailyRecordItems] 插入子项失败:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      console.log("[upsertDailyRecordItems] 插入子项成功:", data);
      results.push(data);
    }
  }

  console.log("[upsertDailyRecordItems] 完成, 共处理", results.length, "个子项");
  return results;
}

export async function saveDailyRecord(
  userId: string,
  values: DailyRecordFormValues
): Promise<DailyRecordWithItems> {
  console.log("[saveDailyRecord] 开始保存, userId:", userId, "values:", values);
  
  const record = await upsertDailyRecord(userId, values);
  console.log("[saveDailyRecord] 主记录保存完成:", record);
  
  const items = await upsertDailyRecordItems(record.id, values);
  console.log("[saveDailyRecord] 子项保存完成, 共", items.length, "项");

  return {
    ...record,
    items,
  };
}

export function formValuesToFormData(
  record: DailyRecordWithItems | null,
  recordDate: string
): DailyRecordFormValues {
  const formValues: DailyRecordFormValues = {
    recordDate,
    note: record?.note || '',
    items: {},
  };

  if (record?.items) {
    record.items.forEach((item) => {
      const config = RECORD_ITEMS.find((c) => c.key === item.item_key);
      if (!config) return;

      if (config.type === 'number' && item.value_number !== null) {
        (formValues.items as Record<string, number | string>)[item.item_key] = item.value_number;
      } else if (config.type === 'duration' && item.value_duration !== null) {
        (formValues.items as Record<string, number | string>)[item.item_key] = item.value_duration;
      } else if (config.type === 'time' && item.value_time !== null) {
        (formValues.items as Record<string, number | string>)[item.item_key] = item.value_time;
      }
    });
  }

  return formValues;
}
