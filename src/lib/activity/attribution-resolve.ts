import { getItemDepth, getItemPath, isActiveItem } from '@/lib/activity/item-tree';
import { SEED_RULES } from '@/lib/activity/seed-user-rules';
import type { Item, SubItem } from '@/types/teto';
import type { UserRuleForMatch } from '@/lib/utils/item-match';

/** 自动归属仅匹配在用事项（排除已搁置、已完成等） */
export function isAttributionEligibleItem(item: Item): boolean {
  return isActiveItem(item);
}

/** 输入至少达到该长度才参与自动归属匹配（单字如 t 不触发） */
export const MIN_ATTRIBUTION_INPUT_LENGTH = 2;

function isAttributionInputLongEnough(text: string): boolean {
  return text.trim().length >= MIN_ATTRIBUTION_INPUT_LENGTH;
}

/** 从输入中提取可用于标题匹配的片段（整句 + 分词 + 英文/数字片段） */
export function collectMatchCandidates(text: string): string[] {
  const lower = text.trim().toLowerCase();
  if (!lower) return [];

  const candidates = new Set<string>();
  if (lower.length >= MIN_ATTRIBUTION_INPUT_LENGTH) candidates.add(lower);
  const parts = lower.split(/[\s,，。、；;！!？?（）()【】\[\]"'\-]+/).filter(Boolean);

  for (const part of parts) {
    if (part.length >= 2) candidates.add(part);
  }

  const collapsed = lower.replace(/\s+/g, '');
  if (collapsed.length >= 2) candidates.add(collapsed);

  for (let i = 0; i < parts.length - 1; i++) {
    const joined = parts.slice(i, i + 2).join('');
    if (joined.length >= 3) candidates.add(joined);
  }

  for (const run of lower.match(/[a-z0-9]+(?:\.[a-z0-9]+)?/gi) ?? []) {
    if (run.length >= 2) candidates.add(run.toLowerCase());
  }

  // 长中文无空格：提取 2~4 字滑窗，便于「第三标签方案报批」命中「方案报批」
  const cjk = lower.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const seq of cjk) {
    if (seq.length >= 4) {
      for (let len = 2; len <= Math.min(4, seq.length); len++) {
        for (let i = 0; i <= seq.length - len; i++) {
          candidates.add(seq.slice(i, i + len));
        }
      }
    }
  }

  return [...candidates];
}

function scoreTitleMatch(fragment: string, title: string): number {
  if (fragment.length < 2 || title.length < 2) return 0;
  if (fragment.includes(title)) return title.length + 200;
  if (title.includes(fragment)) return fragment.length + 100;
  return 0;
}

/** 输入与事项标题的综合匹配分（支持多关键词叠加，如 teto + 1.7） */
export function scoreItemTitleMatch(
  text: string,
  itemTitle: string,
  patterns: string[] = []
): number {
  const titleLower = itemTitle.trim().toLowerCase();
  const candidates = collectMatchCandidates(text);
  const input = text.trim().toLowerCase();

  let score = Math.max(...candidates.map((c) => scoreTitleMatch(c, titleLower)), 0);

  if (
    input.length >= MIN_ATTRIBUTION_INPUT_LENGTH &&
    (input.includes(titleLower) || titleLower.includes(input))
  ) {
    score = Math.max(score, Math.min(input.length, titleLower.length) + 250);
  }

  const matchedFragments = candidates.filter(
    (c) => c.length >= 2 && scoreTitleMatch(c, titleLower) > 0
  );
  if (matchedFragments.length >= 2) {
    const multiScore =
      180 + matchedFragments.reduce((sum, c) => sum + Math.min(c.length, 12), 0);
    score = Math.max(score, multiScore);
  }

  for (const p of patterns) {
    const pl = p.toLowerCase();
    if (pl === titleLower || titleLower.includes(pl) || pl.includes(titleLower)) {
      score = Math.max(score, pl.length + 300);
    }
  }

  return score;
}

/** 层级越深，在得分接近时越优先（三类 > 二类 > 一类） */
const DEPTH_MATCH_BONUS = 48;

type LeafCandidate = {
  category: Item;
  leafItem: Item;
  subItemId?: string;
  matchedTitle: string;
  score: number;
  depth: number;
};

function compareLeafCandidates(a: LeafCandidate, b: LeafCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.depth !== a.depth) return b.depth - a.depth;
  return b.matchedTitle.length - a.matchedTitle.length;
}

/** 扫描所有二类/三类 Item 与 SubItem，返回按「得分 > 深度 > 标题长度」排序的候选 */
export function collectLeafCandidates(
  text: string,
  items: Item[],
  patterns: string[] = [],
  subItems: SubItem[] = []
): LeafCandidate[] {
  const candidates: LeafCandidate[] = [];
  const itemById = new Map(items.map((i) => [i.id, i]));

  for (const item of items) {
    if (!item.parent_item_id || !isAttributionEligibleItem(item)) continue;

    const title = item.title.trim();
    if (title.length < 2) continue;

    const parent = itemById.get(item.parent_item_id);
    const catTitle = parent?.title.trim().toLowerCase() ?? '';
    if (catTitle && title.trim().toLowerCase() === catTitle) continue;

    const baseScore = scoreItemTitleMatch(text, title, patterns);
    if (baseScore <= 0) continue;

    const path = getItemPath(items, item.id);
    const category = path[0];
    if (!category) continue;

    const depth = path.length - 1;
    candidates.push({
      category,
      leafItem: item,
      matchedTitle: title,
      score: baseScore + depth * DEPTH_MATCH_BONUS,
      depth,
    });
  }

  for (const sub of subItems) {
    const title = sub.title.trim();
    if (title.length < 2) continue;

    const baseScore = scoreItemTitleMatch(text, title, patterns);
    if (baseScore <= 0) continue;

    const host = itemById.get(sub.item_id);
    if (!host || !isAttributionEligibleItem(host)) continue;

    const path = getItemPath(items, host.id);
    const category = path[0];
    if (!category) continue;

    const depth = path.length;
    candidates.push({
      category,
      leafItem: host,
      subItemId: sub.id,
      matchedTitle: title,
      score: baseScore + depth * DEPTH_MATCH_BONUS,
      depth,
    });
  }

  return candidates.sort(compareLeafCandidates);
}

export function resolveBestLeafMatch(
  text: string,
  items: Item[],
  patterns: string[] = [],
  subItems: SubItem[] = []
): LeafCandidate | null {
  return collectLeafCandidates(text, items, patterns, subItems)[0] ?? null;
}

/** 候选 leaf 是否比当前 leaf 更具体（更深层级或更长标题） */
export function isMoreSpecificItemMatch(
  items: Item[],
  candidate: Item,
  current: Item | null | undefined
): boolean {
  if (!current) return true;
  if (candidate.id === current.id) return false;
  const candDepth = getItemDepth(items, candidate.id);
  const currDepth = getItemDepth(items, current.id);
  if (candDepth !== currDepth) return candDepth > currDepth;
  return candidate.title.trim().length > current.title.trim().length;
}

/** 输入与事项标题是否相关（整句包含或关键词片段匹配） */
export function itemTitleMatchesInput(text: string, itemTitle: string): boolean {
  const title = itemTitle.trim().toLowerCase();
  if (!title) return false;
  const input = text.trim().toLowerCase();
  if (
    input.length >= MIN_ATTRIBUTION_INPUT_LENGTH &&
    (title.includes(input) || input.includes(title))
  ) {
    return true;
  }
  return collectMatchCandidates(text).some((c) => scoreTitleMatch(c, title) > 0);
}

/** 顶层 Item 与某二类同名 → 通常是误挂，不应作为一类匹配 */
function isMisplacedDuplicateL1(item: Item, items: Item[]): boolean {
  if (item.parent_item_id) return false;
  const title = item.title.trim().toLowerCase();
  return items.some(
    (i) =>
      i.parent_item_id &&
      i.title.trim().toLowerCase() === title &&
      isAttributionEligibleItem(i)
  );
}

/**
 * 输入更像二类/三类标题（如 teto / teto项目 → teto开发），而非一类大类（如 编程）。
 * 避免顶层误挂的同名 Item 被当成一类选中。
 */
export function shouldPreferL2Match(
  text: string,
  l1: Item,
  l2: Item,
  directL1Match: Item | null | undefined,
  items: Item[] = []
): boolean {
  const input = text.trim().toLowerCase();
  if (input.length < 2) return false;

  const l1Title = l1.title.trim().toLowerCase();

  if (input === l1Title) return false;

  if (!itemTitleMatchesInput(text, l2.title)) return false;

  if (directL1Match && items.length > 0 && isMisplacedDuplicateL1(directL1Match, items)) {
    return true;
  }

  if (directL1Match && !directL1Match.parent_item_id && directL1Match.id !== l1.id) {
    const directTitle = directL1Match.title.trim().toLowerCase();
    const l2Title = l2.title.trim().toLowerCase();
    if (itemTitleMatchesInput(text, directL1Match.title) && itemTitleMatchesInput(text, l2.title)) {
      return true;
    }
    if (directTitle === l2Title) return true;
  }

  if (input !== l1Title && !l1Title.includes(input)) {
    return true;
  }

  return false;
}

/** preset 指向 L2/L3 时取真正的一类祖先；仅 L1 preset 才返回根节点 */
function resolvePresetCategory(presetPath: Item[]): Item | null {
  const root = presetPath[0];
  if (!root || root.parent_item_id) return null;
  return root;
}

export function collectMatchingPatterns(text: string, rules: UserRuleForMatch[]): string[] {
  const lower = text.trim().toLowerCase();
  if (!lower || lower.length < MIN_ATTRIBUTION_INPUT_LENGTH) return [];

  const patterns = new Set<string>();
  for (const rule of rules) {
    if (rule.is_active === false) continue;
    const pattern = rule.trigger_pattern?.trim();
    if (!pattern) continue;
    if (lower.includes(pattern.toLowerCase())) {
      patterns.add(pattern);
    }
  }
  for (const seed of SEED_RULES) {
    if (lower.includes(seed.trigger_pattern.toLowerCase())) {
      patterns.add(seed.trigger_pattern);
    }
  }
  return [...patterns];
}

export function findCategoryByTitle(items: Item[], titleHint: string): Item | undefined {
  const hint = titleHint.trim().toLowerCase();
  if (!hint) return undefined;

  const exact = items.filter(
    (i) => !i.parent_item_id && i.title.trim().toLowerCase() === hint
  );
  if (exact.length === 1) return exact[0];

  const candidates = items.filter((i) => {
    if (i.parent_item_id) return false;
    const t = i.title.trim().toLowerCase();
    return t === hint || t.includes(hint) || hint.includes(t);
  });
  return candidates.sort((a, b) => a.title.length - b.title.length)[0];
}

export function resolveCategoryFromSeed(text: string, items: Item[]): Item | null {
  const lower = text.trim().toLowerCase();
  if (lower.length < MIN_ATTRIBUTION_INPUT_LENGTH) return null;
  const seed = SEED_RULES.filter((s) => lower.includes(s.trigger_pattern.toLowerCase())).sort(
    (a, b) => b.trigger_pattern.length - a.trigger_pattern.length
  )[0];
  if (!seed) return null;
  return findCategoryByTitle(items, seed.item_title_hint) ?? null;
}

/**
 * 直接用一类/大类标题匹配文本（种子词典无命中时的后备）。
 * 支持双向匹配：输入包含标题，或标题包含输入（用户输入了标题的一部分）。
 * 要求标题至少 2 个字符，避免单字误匹配。
 */
export function resolveCategoryFromTitle(text: string, items: Item[]): Item | null {
  if (!isAttributionInputLongEnough(text)) return null;
  const candidates = collectMatchCandidates(text);
  if (candidates.length === 0) return null;
  const categories = items.filter(
    (i) => !i.parent_item_id && i.title.trim().length >= 2 && isAttributionEligibleItem(i)
  );
  const scored = categories
    .map((cat) => {
      const catLower = cat.title.trim().toLowerCase();
      const score = Math.max(...candidates.map((c) => scoreTitleMatch(c, catLower)), 0);
      return { cat, score };
    })
    .filter((x) => x.score > 0 && !isMisplacedDuplicateL1(x.cat, items))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.cat ?? null;
}

/**
 * 扫描所有二类/三类 Item 标题（不含 SubItem），返回最深层匹配。
 * @deprecated 优先使用 resolveBestLeafMatch / collectLeafCandidates
 */
export function resolveFromL2Title(
  text: string,
  items: Item[],
  options?: { patterns?: string[]; subItems?: SubItem[] }
): { category: Item | null; l2: Item | null; subItemId?: string } {
  const best = resolveBestLeafMatch(
    text,
    items,
    options?.patterns ?? [],
    options?.subItems ?? []
  );
  if (!best) return { category: null, l2: null };

  return {
    category: best.category,
    l2: best.subItemId ? best.leafItem : best.leafItem,
    subItemId: best.subItemId,
  };
}

export function listLevel2Children(items: Item[], categoryId: string): Item[] {
  return items.filter(
    (i) => i.parent_item_id === categoryId && isAttributionEligibleItem(i)
  );
}

/**
 * 在二类事项中找与输入/关键词最匹配的一项。
 * 避免「吃早饭」误命中与一类同名的二类；同长度时优先 pattern 与更长标题。
 */
export function matchLevel2Child(
  text: string,
  patterns: string[],
  children: Item[],
  categoryTitle?: string
): Item | null {
  const lower = text.trim().toLowerCase();
  if (!lower || lower.length < MIN_ATTRIBUTION_INPUT_LENGTH || children.length === 0) return null;

  const candidates = collectMatchCandidates(text);
  const catLower = categoryTitle?.trim().toLowerCase() ?? '';
  let best: { item: Item; score: number } | null = null;

  for (const child of children) {
    const title = child.title.trim().toLowerCase();
    if (!title || (catLower && title === catLower)) continue;

    const matchedPatterns = patterns.filter((p) => {
      const pl = p.toLowerCase();
      return pl === title || title.includes(pl) || pl.includes(title);
    });
    const patternScore =
      matchedPatterns.length > 0 ? Math.max(...matchedPatterns.map((p) => p.length + 200)) : 0;

    let includesScore = 0;
    for (const fragment of candidates) {
      const s = scoreTitleMatch(fragment, title);
      if (s <= 0) continue;
      if (fragment.includes(title)) {
        const longerSibling = children.some((other) => {
          if (other.id === child.id) return false;
          const ot = other.title.trim().toLowerCase();
          if (!ot || ot === catLower) return false;
          return ot.length > title.length && fragment.includes(ot);
        });
        if (!longerSibling) includesScore = Math.max(includesScore, s);
      } else {
        includesScore = Math.max(includesScore, s);
      }
    }

    const score = Math.max(patternScore, includesScore);
    if (score <= 0) continue;

    if (
      !best ||
      score > best.score ||
      (score === best.score && child.title.length > best.item.title.length)
    ) {
      best = { item: child, score };
    }
  }

  return best?.item ?? null;
}

export function buildOrgPathLabel(l1Title: string, l2Title?: string, l3Title?: string): string {
  return [l1Title, l2Title, l3Title].filter(Boolean).join('-');
}

export function resolveTextAttribution(
  text: string,
  items: Item[],
  rules: UserRuleForMatch[],
  options?: { presetItemId?: string | null; subItems?: SubItem[] }
): {
  category: Item | null;
  l2: Item | null;
  subItemId?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { category: null, l2: null };
  if (trimmed.length < MIN_ATTRIBUTION_INPUT_LENGTH) return { category: null, l2: null };

  const patterns = collectMatchingPatterns(trimmed, rules);
  const subItems = options?.subItems ?? [];
  const rawPresetId = options?.presetItemId ?? null;
  const presetItemId =
    rawPresetId && items.some((i) => i.id === rawPresetId && isAttributionEligibleItem(i))
      ? rawPresetId
      : null;
  const presetPath = presetItemId ? getItemPath(items, presetItemId) : [];
  const presetCategory = resolvePresetCategory(presetPath);
  const presetLeaf = presetPath[presetPath.length - 1] ?? null;

  const fromL1Title = resolveCategoryFromTitle(trimmed, items);
  const fromSeed = resolveCategoryFromSeed(trimmed, items);
  const bestLeaf = resolveBestLeafMatch(trimmed, items, patterns, subItems);

  const inputLower = trimmed.toLowerCase();
  const l1Exact =
    fromL1Title && fromL1Title.title.trim().toLowerCase() === inputLower;

  // 有 leaf 匹配且非「仅要一类」的精确输入
  if (bestLeaf && !l1Exact) {
    const leafForPrefer = bestLeaf.subItemId
      ? items.find((i) => i.id === bestLeaf.leafItem.id) ?? bestLeaf.leafItem
      : bestLeaf.leafItem;
    const misplacedOk =
      !fromL1Title ||
      shouldPreferL2Match(trimmed, bestLeaf.category, leafForPrefer, fromL1Title, items) ||
      isMisplacedDuplicateL1(fromL1Title, items);

    if (misplacedOk) {
      if (bestLeaf.subItemId) {
        return {
          category: bestLeaf.category,
          l2: bestLeaf.leafItem,
          subItemId: bestLeaf.subItemId,
        };
      }
      return {
        category: bestLeaf.category,
        l2: bestLeaf.leafItem,
      };
    }
  }

  // 仅一类：输入与一类标题相同（如「吃饭」）
  if (l1Exact && fromL1Title) {
    return { category: fromL1Title, l2: null };
  }

  let category: Item | null = presetCategory ?? fromSeed ?? fromL1Title ?? null;
  let l2: Item | null = null;
  let subItemId: string | undefined;

  if (bestLeaf && category?.id === bestLeaf.category.id) {
    if (bestLeaf.subItemId) {
      l2 = bestLeaf.leafItem;
      subItemId = bestLeaf.subItemId;
    } else {
      l2 = bestLeaf.leafItem;
    }
  } else if (bestLeaf) {
    category = bestLeaf.category;
    if (bestLeaf.subItemId) {
      l2 = bestLeaf.leafItem;
      subItemId = bestLeaf.subItemId;
    } else {
      l2 = bestLeaf.leafItem;
    }
  } else if (category) {
    l2 = matchLevel2Child(
      trimmed,
      patterns,
      listLevel2Children(items, category.id),
      category.title
    );
  }

  if (
    !l2 &&
    !subItemId &&
    presetLeaf &&
    getItemDepth(items, presetLeaf.id) >= 1 &&
    isAttributionEligibleItem(presetLeaf)
  ) {
    l2 = presetLeaf;
  }

  return { category, l2, subItemId };
}
