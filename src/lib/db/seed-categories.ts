import { createClient } from '@/lib/supabase/server';
import { ACTIVITY_CATEGORY_PRESETS } from '@/lib/activity/constants';
import { listItems } from '@/lib/db/items';
import type { Item } from '@/types/teto';

/**
 * 批量补齐预设大类（已存在同名顶层 item 则跳过）
 */
export async function seedCategoryItems(userId: string): Promise<{
  created: Item[];
  items: Item[];
}> {
  const existing = await listItems(userId, {});
  const topLevelTitles = new Set(
    existing.filter((i) => !i.parent_item_id).map((i) => i.title)
  );

  const supabase = await createClient();
  const created: Item[] = [];

  const missing = ACTIVITY_CATEGORY_PRESETS.filter((title) => !topLevelTitles.has(title));
  if (missing.length === 0) {
    return { created, items: existing };
  }

  await Promise.all(
    missing.map(async (title) => {
      const { data, error } = await supabase
        .from('items')
        .insert({
          user_id: userId,
          title,
          status: '活跃',
          parent_item_id: null,
        })
        .select()
        .single();

      if (!error && data) {
        created.push(data as Item);
      }
    })
  );

  const items = created.length > 0 ? await listItems(userId, {}) : existing;
  return { created, items };
}
