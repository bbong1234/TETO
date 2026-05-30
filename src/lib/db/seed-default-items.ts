import { createItem } from '@/lib/db/items';
import {
  SKILL_CATEGORY_PRESETS,
  SKILL_DEFAULT_ITEM_TITLES,
  type SkillCategoryPreset,
} from '@/lib/activity/constants';
import type { Item } from '@/types/teto';

/**
 * 为技能型大类补齐默认事项（如 英语 → 英语学习）
 */
export async function seedSkillDefaultItems(
  userId: string,
  items: Item[]
): Promise<{ created: Item[]; items: Item[] }> {
  const created: Item[] = [];
  let nextItems = items;

  for (const categoryTitle of SKILL_CATEGORY_PRESETS) {
    const category = nextItems.find(
      (i) => !i.parent_item_id && i.title === categoryTitle
    );
    if (!category) continue;

    const defaultTitle = SKILL_DEFAULT_ITEM_TITLES[categoryTitle as SkillCategoryPreset];
    const existingChild = nextItems.find(
      (i) => i.parent_item_id === category.id && i.title === defaultTitle
    );
    if (existingChild) continue;

    try {
      const child = await createItem(userId, {
        title: defaultTitle,
        parent_item_id: category.id,
        status: '活跃',
      });
      created.push(child);
      nextItems = [...nextItems, child];
    } catch {
      /* 同名冲突等：跳过 */
    }
  }

  return { created, items: nextItems };
}
