import { createClient } from '@/lib/supabase/server';
import { ACTIVITY_CATEGORY_PRESETS } from '@/lib/activity/constants';
import { listItems, supportsParentItemId } from '@/lib/db/items';
import { seedEnglishSubItems } from '@/lib/db/seed-sub-items';
import { seedSkillDefaultItems } from '@/lib/db/seed-default-items';
import { migrateEnglishRecordsFromCategory } from '@/lib/db/seed-sub-items';
import type { Item, SubItem } from '@/types/teto';

/**
 * 批量补齐预设大类（已存在同名顶层 item 则跳过）
 */
export async function seedCategoryItems(userId: string): Promise<{
  created: Item[];
  items: Item[];
  english_sub_items_created: SubItem[];
  default_items_created: Item[];
  english_migration: { recordsMoved: number; subItemsMoved: number };
}> {
  const existing = await listItems(userId, {});
  const topLevelTitles = new Set(
    existing.filter((i) => !i.parent_item_id).map((i) => i.title)
  );

  const supabase = await createClient();
  const includeParent = await supportsParentItemId(supabase);
  const created: Item[] = [];

  const missing = ACTIVITY_CATEGORY_PRESETS.filter((title) => !topLevelTitles.has(title));
  if (missing.length === 0) {
    let items = existing;
    const defaultSeed = await seedSkillDefaultItems(userId, items);
    if (defaultSeed.created.length > 0) items = await listItems(userId, {});
    const englishSeed = await seedEnglishSubItems(userId, items);
    if (englishSeed.created.length > 0) items = await listItems(userId, {});
    const englishMigration = await migrateEnglishRecordsFromCategory(userId, items);
    return {
      created,
      items,
      english_sub_items_created: englishSeed.created,
      default_items_created: defaultSeed.created,
      english_migration: englishMigration,
    };
  }

  await Promise.all(
    missing.map(async (title) => {
      const row: Record<string, unknown> = {
        user_id: userId,
        title,
        status: '活跃',
      };
      if (includeParent) {
        row.parent_item_id = null;
      }
      const { data, error } = await supabase.from('items').insert(row).select().single();

      if (!error && data) {
        created.push(data as Item);
      }
    })
  );

  let items = created.length > 0 ? await listItems(userId, {}) : existing;
  const defaultSeed = await seedSkillDefaultItems(userId, items);
  if (defaultSeed.created.length > 0) items = await listItems(userId, {});
  const englishSeed = await seedEnglishSubItems(userId, items);
  if (englishSeed.created.length > 0) items = await listItems(userId, {});
  const englishMigration = await migrateEnglishRecordsFromCategory(userId, items);
  return {
    created,
    items,
    english_sub_items_created: englishSeed.created,
    default_items_created: defaultSeed.created,
    english_migration: englishMigration,
  };
}
