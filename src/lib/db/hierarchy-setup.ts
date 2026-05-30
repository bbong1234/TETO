import { listItems } from '@/lib/db/items';
import { seedSkillDefaultItems } from '@/lib/db/seed-default-items';
import {
  migrateEnglishRecordsFromCategory,
  seedEnglishSubItems,
} from '@/lib/db/seed-sub-items';
import { seedCategoryItems } from '@/lib/db/seed-categories';

/**
 * 补齐大类 → 技能型默认事项 → 英语子项 → 迁移直挂大类的英语记录
 */
export async function runHierarchySeedAndMigrate(userId: string): Promise<{
  categories: Awaited<ReturnType<typeof seedCategoryItems>>;
  defaultItemsCreated: number;
  englishSubItemsCreated: number;
  englishMigration: { recordsMoved: number; subItemsMoved: number };
}> {
  const categories = await seedCategoryItems(userId);
  let items = categories.items;

  const defaultSeed = await seedSkillDefaultItems(userId, items);
  if (defaultSeed.created.length > 0) {
    items = await listItems(userId, {});
  } else {
    items = defaultSeed.items;
  }

  const englishSeed = await seedEnglishSubItems(userId, items);
  if (englishSeed.created.length > 0) {
    items = await listItems(userId, {});
  }

  const englishMigration = await migrateEnglishRecordsFromCategory(userId, items);

  return {
    categories,
    defaultItemsCreated: defaultSeed.created.length,
    englishSubItemsCreated: englishSeed.created.length,
    englishMigration,
  };
}
