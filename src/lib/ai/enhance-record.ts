/**
 * enhance-record.ts
 * 记录创建后的异步 AI 增强：自动识别 item_hint 并归属事项
 */

import { parseSemantic } from './parse-semantic';
import { createClient } from '@/lib/supabase/server';

/**
 * 对一条已保存的记录进行异步 AI 增强
 * - 调用 DeepSeek 解析 item_hint
 * - 模糊匹配用户事项列表
 * - 匹配成功则自动更新 item_id（不覆盖用户已手动设置的）
 */
export async function enhanceRecord(
  userId: string,
  recordId: string,
  content: string,
  date: string
): Promise<void> {
  const supabase = await createClient();

  // 获取用户事项列表（只取活跃/推进中的）
  const { data: items } = await supabase
    .from('items')
    .select('id, title')
    .eq('user_id', userId)
    .in('status', ['活跃', '推进中', '放缓'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (!items || items.length === 0) return;

  // 调用语义解析
  let result;
  try {
    result = await parseSemantic(content, date, undefined, items);
  } catch {
    // AI 解析失败不影响主流程，静默退出
    return;
  }

  const firstUnit = result.parsed.units[0];
  if (!firstUnit?.item_hint) return;

  const hint = firstUnit.item_hint.trim();

  // 精确匹配优先，再模糊匹配
  let matched = items.find(
    (i) => i.title === hint
  );
  if (!matched) {
    matched = items.find(
      (i) =>
        i.title.includes(hint) || hint.includes(i.title)
    );
  }

  if (!matched) return;

  // 只更新 item_id 为 null 的记录（不覆盖用户手动选择）
  await supabase
    .from('records')
    .update({ item_id: matched.id })
    .eq('id', recordId)
    .eq('user_id', userId)
    .is('item_id', null);
}
