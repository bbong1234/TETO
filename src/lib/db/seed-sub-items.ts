import { createClient } from '@/lib/supabase/server';
import { createSubItem, getSubItemsByItemId } from '@/lib/db/sub-items';
import { ENGLISH_SUB_ITEM_PRESETS } from '@/lib/activity/constants';
import { findEnglishDefaultItem } from '@/lib/activity/item-tree';
import type { Item, SubItem } from '@/types/teto';

/**
 * 为「英语学习」默认事项补齐技能子项（词汇/听力/阅读/口语/写作）
 */
export async function seedEnglishSubItems(
  userId: string,
  items: Item[]
): Promise<{ created: SubItem[]; subItems: SubItem[] }> {
  const hostItem = findEnglishDefaultItem(items);
  if (!hostItem) {
    return { created: [], subItems: [] };
  }

  const existing = await getSubItemsByItemId(userId, hostItem.id);
  const existingTitles = new Set(existing.map((s) => s.title));
  const created: SubItem[] = [];

  for (let i = 0; i < ENGLISH_SUB_ITEM_PRESETS.length; i++) {
    const title = ENGLISH_SUB_ITEM_PRESETS[i];
    if (existingTitles.has(title)) continue;
    const sub = await createSubItem(userId, {
      item_id: hostItem.id,
      title,
      sort_order: i,
    });
    created.push(sub);
  }

  const subItems =
    created.length > 0 ? await getSubItemsByItemId(userId, hostItem.id) : existing;
  return { created, subItems };
}

/**
 * 将直挂「英语」大类的记录/子项迁移到「英语学习」默认事项
 */
export async function migrateEnglishRecordsFromCategory(
  userId: string,
  items: Item[]
): Promise<{ recordsMoved: number; subItemsMoved: number }> {
  const englishCategory = items.find((i) => !i.parent_item_id && i.title === '英语');
  const englishItem = findEnglishDefaultItem(items);
  if (!englishCategory || !englishItem || englishCategory.id === englishItem.id) {
    return { recordsMoved: 0, subItemsMoved: 0 };
  }

  const supabase = await createClient();

  const { data: movedSubs, error: subErr } = await supabase
    .from('sub_items')
    .update({ item_id: englishItem.id })
    .eq('user_id', userId)
    .eq('item_id', englishCategory.id)
    .select('id');

  if (subErr) {
    throw new Error(`迁移英语子项失败: ${subErr.message}`);
  }

  const { data: movedRecords, error: recErr } = await supabase
    .from('records')
    .update({ item_id: englishItem.id })
    .eq('user_id', userId)
    .eq('item_id', englishCategory.id)
    .select('id');

  if (recErr) {
    throw new Error(`迁移英语记录失败: ${recErr.message}`);
  }

  return {
    recordsMoved: movedRecords?.length ?? 0,
    subItemsMoved: movedSubs?.length ?? 0,
  };
}
