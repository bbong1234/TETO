import {
  buildOrgPathLabel,
  collectMatchingPatterns,
  isAttributionEligibleItem,
  MIN_ATTRIBUTION_INPUT_LENGTH,
  resolveTextAttribution,
} from '@/lib/activity/attribution-resolve';
import type { ActivityContextValue } from '@/lib/activity/activity-context-types';
import { getItemPath, resolveActivityContextFromRecord } from '@/lib/activity/item-tree';
import { SEED_RULES } from '@/lib/activity/seed-user-rules';
import { matchPresetsByText, type UserRuleForMatch } from '@/lib/utils/item-match';
import type { Item, SubItem, Tag } from '@/types/teto';

export interface QuickCreateAttributionOption {
  id: string;
  /** 圆圈展示（短） */
  shortLabel: string;
  /** 完整路径，用于 aria / tooltip */
  label: string;
  itemId?: string | null;
  subItemId?: string | null;
  functionTagId?: string | null;
  isNoAssign?: boolean;
  recommended?: boolean;
}

function addUniqueOption(
  options: QuickCreateAttributionOption[],
  seenIds: Set<string>,
  seenItemIds: Set<string>,
  option: QuickCreateAttributionOption
) {
  if (seenIds.has(option.id)) return;
  if (!option.subItemId && option.itemId && seenItemIds.has(option.itemId)) return;
  seenIds.add(option.id);
  if (option.itemId && !option.subItemId) seenItemIds.add(option.itemId);
  options.push(option);
}

export interface BuildQuickCreateOptionsParams {
  subItems?: SubItem[];
}

/**
 * 随手记输入时的归属选项（一类 / 二类分层，按 itemId 去重）
 */
export function buildQuickCreateAttributionOptions(
  text: string,
  items: Item[],
  rules: UserRuleForMatch[],
  tags: Tag[] = [],
  params?: BuildQuickCreateOptionsParams
): QuickCreateAttributionOption[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length < MIN_ATTRIBUTION_INPUT_LENGTH) return [];

  const options: QuickCreateAttributionOption[] = [];
  const seenIds = new Set<string>();
  const seenItemIds = new Set<string>();
  const presets = matchPresetsByText(trimmed, rules);
  const patterns = collectMatchingPatterns(trimmed, rules);

  if (presets.isNoAssign) {
    return [
      {
        id: 'no_assign',
        shortLabel: '无需',
        label: '无需归属',
        isNoAssign: true,
        recommended: true,
      },
    ];
  }

  const { category, l2: matchedL2, subItemId } = resolveTextAttribution(trimmed, items, rules, {
    presetItemId: presets.itemId,
    subItems: params?.subItems ?? [],
  });

  let hasRecommended = false;

  if (category && matchedL2 && subItemId) {
    const sub = params?.subItems?.find((s) => s.id === subItemId);
    const subTitle = sub?.title ?? matchedL2.title;
    addUniqueOption(options, seenIds, seenItemIds, {
      id: `sub:${subItemId}`,
      shortLabel: subTitle,
      label: buildOrgPathLabel(category.title, matchedL2.title, subTitle),
      itemId: matchedL2.id,
      subItemId,
      functionTagId: presets.functionTagId,
      recommended: true,
    });
    hasRecommended = true;
  } else if (category && matchedL2) {
    const matchedPath = getItemPath(items, matchedL2.id);
    const fullLabel =
      matchedPath.length >= 3
        ? buildOrgPathLabel(matchedPath[0].title, matchedPath[1].title, matchedPath[2].title)
        : buildOrgPathLabel(category.title, matchedL2.title);
    addUniqueOption(options, seenIds, seenItemIds, {
      id: `l2:${matchedL2.id}`,
      shortLabel: matchedL2.title,
      label: fullLabel,
      itemId: matchedL2.id,
      functionTagId: presets.functionTagId,
      recommended: true,
    });
    hasRecommended = true;
  }

  if (category) {
    addUniqueOption(options, seenIds, seenItemIds, {
      id: `l1:${category.id}`,
      shortLabel: category.title,
      label: category.title,
      itemId: category.id,
      functionTagId: matchedL2 ? null : presets.functionTagId,
      recommended: !hasRecommended,
    });
    if (!hasRecommended) hasRecommended = true;
  }

  // 仅有种子词典、事项尚未入库：展示预期一类-二类文案（不可写入 itemId）
  if (!category) {
    const seed = SEED_RULES.filter((s) =>
      trimmed.toLowerCase().includes(s.trigger_pattern.toLowerCase())
    ).sort((a, b) => b.trigger_pattern.length - a.trigger_pattern.length)[0];
    if (seed) {
      const l2Title = patterns.find(
        (p) =>
          p !== seed.item_title_hint &&
          !seed.item_title_hint.includes(p) &&
          seed.trigger_pattern !== p
      );
      const fullLabel = l2Title
        ? `${seed.item_title_hint}-${l2Title}`
        : seed.item_title_hint;
      addUniqueOption(options, seenIds, seenItemIds, {
        id: `seed:${fullLabel}`,
        shortLabel: l2Title ?? seed.item_title_hint,
        label: fullLabel,
        itemId: null,
        recommended: true,
      });
      hasRecommended = true;
    }
  }

  if (presets.functionTagId && !category) {
    const name = tags.find((t) => t.id === presets.functionTagId)?.name?.trim();
    if (name) {
      addUniqueOption(options, seenIds, seenItemIds, {
        id: `tag:${presets.functionTagId}`,
        shortLabel: name,
        label: name,
        functionTagId: presets.functionTagId,
        recommended: !hasRecommended,
      });
      if (!hasRecommended) hasRecommended = true;
    }
  }

  addUniqueOption(options, seenIds, seenItemIds, {
    id: 'unassigned',
    shortLabel: '未归类',
    label: '未归类',
    itemId: null,
    recommended: !hasRecommended,
  });

  if (!options.some((o) => o.recommended) && options.length > 0) {
    options[0].recommended = true;
  }

  return options;
}

/** @deprecated 使用 buildQuickCreateAttributionOptions */
export function buildQuickCreateAttributionPreview(
  text: string,
  items: Item[],
  rules: UserRuleForMatch[],
  tags: Tag[] = []
) {
  const opts = buildQuickCreateAttributionOptions(text, items, rules, tags);
  const primary = opts.find((o) => o.recommended) ?? opts[0];
  if (!primary) return null;
  return {
    label: primary.label,
    kind: primary.isNoAssign
      ? ('no_assign' as const)
      : primary.functionTagId && !primary.itemId
        ? ('function_only' as const)
        : ('item' as const),
  };
}

export function pickDefaultAttributionOptionId(
  options: QuickCreateAttributionOption[]
): string | null {
  if (options.length === 0) return null;
  return (options.find((o) => o.recommended) ?? options[0]).id;
}

/** 确保 context.categoryItemId 始终为真正的一类（无 parent） */
export function normalizeActivityContextCategory(
  items: Item[],
  ctx: ActivityContextValue
): ActivityContextValue {
  if (!ctx.categoryItemId) return ctx;
  const cat = items.find((i) => i.id === ctx.categoryItemId);
  if (!cat?.parent_item_id) return ctx;
  const path = getItemPath(items, ctx.categoryItemId);
  const root = path[0];
  if (!root) return ctx;
  return {
    ...ctx,
    categoryItemId: root.id,
    categoryTitle: root.title,
  };
}

/** 将随手记推荐选项转为标签栏同步用的 ActivityContext */
export function buildActivityContextFromAttributionOption(
  items: Item[],
  option: QuickCreateAttributionOption | null | undefined,
  optionId: string | null
): ActivityContextValue | null {
  if (!option && !optionId) return null;

  if (optionId?.startsWith('sub:')) {
    const subItemId = optionId.slice(4);
    const hostId = option?.itemId;
    if (!hostId) return null;
    const ctx = resolveActivityContextFromRecord(items, hostId, subItemId) as ActivityContextValue;
    return normalizeActivityContextCategory(items, ctx);
  }

  if (optionId?.startsWith('l1:')) {
    const categoryId = optionId.slice(3);
    const cat = items.find((i) => i.id === categoryId);
    if (!cat || cat.parent_item_id) return null;
    return {
      categoryItemId: categoryId,
      categoryTitle: cat.title,
      itemId: '',
      subItemId: '',
    };
  }

  const itemId = option?.itemId;
  if (!itemId) return null;

  if (option?.subItemId) {
    const ctx = resolveActivityContextFromRecord(
      items,
      itemId,
      option.subItemId
    ) as ActivityContextValue;
    return normalizeActivityContextCategory(items, ctx);
  }

  const item = items.find((i) => i.id === itemId);
  if (item && !isAttributionEligibleItem(item)) {
    const path = getItemPath(items, itemId);
    const cat = path[0];
    if (!cat) return null;
    return {
      categoryItemId: cat.id,
      categoryTitle: cat.title,
      itemId: '',
      subItemId: '',
    };
  }

  return normalizeActivityContextCategory(
    items,
    resolveActivityContextFromRecord(items, itemId) as ActivityContextValue
  );
}
